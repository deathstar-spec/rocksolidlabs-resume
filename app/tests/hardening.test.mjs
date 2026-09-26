import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as monitoring from '../src/lib/monitoring.js';

const payload = (...statuses) => ({
  heartbeatList: Object.fromEntries(statuses.map((status, i) => [i, [{ status }]])),
  uptimeList: Object.fromEntries(statuses.map((_, i) => [`${i}_24`, 1]))
});

test('shared monitoring states: empty, malformed, mixed, maintenance and valid data', () => {
  for (const [statuses, expected] of [
    [[], 'unknown'], [[1], 'healthy'], [['1'], 'healthy'], [[0], 'offline'],
    [[3], 'maintenance'], [[1, 3], 'maintenance'], [[0, 3], 'degraded'],
    [[1, 0], 'degraded'], [[0, 0], 'offline'], [[1, 1], 'healthy'],
    [[1, null], 'unknown'], [[1, 2], 'unknown'], [[true], 'unknown'],
    [[''], 'unknown'], [[{}], 'unknown'], [[undefined], 'unknown']
  ]) {
    assert.equal(monitoring.summarizeMonitors(statuses.map((_, i) => i), payload(...statuses)).state,
      expected, JSON.stringify(statuses));
  }
  for (const data of [null, {}, { heartbeatList: {} }, { heartbeatList: { 0: [] } },
    { heartbeatList: { 0: 'invalid' } }, { heartbeatList: { 0: [null] } }]) {
    assert.equal(monitoring.summarizeMonitors([0], data).state, 'unknown');
  }
  assert.equal(monitoring.summarizeMonitors([0, undefined], payload(1)).state, 'unknown');
  assert.equal(monitoring.summarizeMonitors([0], { heartbeatList: { 0: [{ status: 1 }, {}] } }).state, 'unknown');
});

test('invalid configuration and uptime cannot become usable health data', () => {
  for (const config of [null, {}, { publicGroupList: {} }, { publicGroupList: [null] },
    { publicGroupList: [{ name: 'Public', monitorList: [null] }] }]) {
    assert.throws(() => monitoring.publicGroups(config));
  }
  assert.deepEqual(monitoring.publicGroups({ publicGroupList: [] }), []);
  for (const value of [NaN, Infinity, -1, 1.1, '1', null]) {
    assert.equal(monitoring.monitorUptime({ uptimeList: { '0_24': value } }, 0), null);
  }
  assert.equal(monitoring.summarizeMonitors([0, 1], payload(1)).uptime, null);
  assert.equal(monitoring.summarizeMonitors([0, 1], payload(1, 1)).uptime, 100);
});

function terminal(reduced = false) {
  const lines = [];
  const events = {};
  const intervals = new Map();
  const timeouts = new Map();
  const changes = new Set();
  let nextTimer = 0;
  const element = () => ({
    classList: { add() {} }, style: {}, children: [], textContent: '',
    appendChild(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
    addEventListener() {}, querySelectorAll() { return []; }
  });
  const output = element();
  output.appendChild = (child) => { lines.push(child); };
  output.replaceChildren = () => { lines.length = 0; };
  const input = { value: '', focus() {}, setSelectionRange() {},
    addEventListener(type, fn) { events[type] = fn; } };
  const preference = { matches: reduced,
    addEventListener(_, fn) { changes.add(fn); },
    removeEventListener(_, fn) { changes.delete(fn); } };
  const selectors = { '#lab-terminal': element(), '#terminal-output': output,
    '#terminal-input': input, '.terminal-window': element() };
  const context = {
    ...monitoring,
    document: { querySelector: (s) => selectors[s], createElement: element },
    requestAnimationFrame: (fn) => fn(),
    window: {
      matchMedia: () => preference,
      setInterval(fn) { const id = ++nextTimer; intervals.set(id, fn); return id; },
      clearInterval(id) { intervals.delete(id); },
      setTimeout(fn) { const id = ++nextTimer; timeouts.set(id, fn); return id; },
      clearTimeout(id) { timeouts.delete(id); }
    }
  };
  const source = readFileSync(new URL('../src/components/LabTerminal.astro', import.meta.url), 'utf8')
    .match(/<script>([\s\S]*?)<\/script>/)[1].replace(/import[^;]+;/g, '');
  vm.runInNewContext(source, context);
  return {
    lines, input, intervals, timeouts, changes,
    command(value) { input.value = value; events.keydown({ key: 'Enter' }); },
    history(key) { events.keydown({ key, preventDefault() {} }); },
    reduce() { preference.matches = true; for (const fn of [...changes]) fn(preference); }
  };
}

test('actual terminal rejects prototype names and keeps commands/history', () => {
  const ui = terminal();
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.doesNotThrow(() => ui.command(name));
    assert.ok(ui.lines.some((line) => line.textContent === `command not found: ${name}`));
  }
  ui.command('whoami');
  assert.ok(ui.lines.some((line) => line.textContent === 'visitor'));
  ui.command('neofetch');
  assert.ok(ui.lines.some((line) => line.textContent.includes("You found a command")));
  ui.history('ArrowUp'); assert.equal(ui.input.value, 'neofetch');
  ui.history('ArrowUp'); assert.equal(ui.input.value, 'whoami');
  ui.history('ArrowDown'); assert.equal(ui.input.value, 'neofetch');
  ui.command('clear'); assert.equal(ui.lines.length, 0);
});

test('Matrix is static with reduced motion and stops when preference changes', () => {
  const reduced = terminal(true);
  reduced.command('matrix');
  assert.equal(reduced.intervals.size, 0);
  assert.equal(reduced.timeouts.size, 0);
  assert.ok(reduced.lines.some((line) => line.className === 'terminal-matrix'));
  const normal = terminal();
  normal.command('matrix');
  assert.equal(normal.intervals.size, 1);
  assert.equal(normal.timeouts.size, 1);
  normal.reduce();
  assert.equal(normal.intervals.size, 0);
  assert.equal(normal.timeouts.size, 0);
  assert.equal(normal.changes.size, 0);
  const finished = terminal();
  finished.command('matrix');
  [...finished.timeouts.values()][0]();
  assert.equal(finished.intervals.size, 0);
  assert.equal(finished.changes.size, 0);
});
