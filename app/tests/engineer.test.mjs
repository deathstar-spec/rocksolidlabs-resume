import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeWalkthrough } from '../src/lib/walkthrough.js';
import { storageWalkthrough } from '../src/data/engineer.js';

class ElementMock {
  constructor(attributes = {}) { this.attributes = new Map(Object.entries(attributes)); this.events = {}; this.textContent = ''; this.focused = false; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  toggleAttribute(name, force) { if (force) this.setAttribute(name, ''); else this.removeAttribute(name); }
  addEventListener(name, listener) { this.events[name] = listener; }
  querySelector() { return this.heading; }
  focus() { this.focused = true; }
  click() { this.events.click(); }
}

function fixture() {
  const panels = storageWalkthrough.steps.map((step) => {
    const panel = new ElementMock({ 'data-status': step.status, 'data-dependency': step.dependency });
    panel.heading = new ElementMock();
    return panel;
  });
  const buttons = panels.map(() => new ElementMock());
  const selectors = Object.fromEntries(['previous', 'next', 'progress', 'state', 'dependency-label', 'storage-node', 'timeline', 'controls'].map((name) => [`[data-${name}]`, new ElementMock()]));
  const root = {
    querySelectorAll: (selector) => selector === '[data-step]' ? panels : buttons,
    querySelector: (selector) => selectors[selector],
  };
  return { root, panels, buttons, get: (name) => selectors[`[data-${name}]`] };
}

test('walkthrough navigates all stages, updates dependency state and bounds controls', () => {
  const original = globalThis.HTMLElement;
  globalThis.HTMLElement = ElementMock;
  try {
    const ui = fixture();
    initializeWalkthrough(ui.root);
    assert.equal(ui.get('state').textContent, 'DEGRADED');
    assert.equal(ui.get('previous').getAttribute('disabled'), '');
    assert.equal(ui.panels.filter((panel) => panel.getAttribute('hidden') === null).length, 1);
    assert.equal(ui.panels[0].heading.focused, false);
    for (let index = 1; index < ui.panels.length; index++) {
      ui.get('next').click();
      assert.equal(ui.buttons[index].getAttribute('aria-current'), 'step');
      assert.equal(ui.panels[index].getAttribute('hidden'), null);
      assert.equal(ui.panels[index - 1].getAttribute('hidden'), '');
      assert.equal(ui.get('progress').textContent, `Step ${index + 1} of 7`);
      assert.equal(ui.panels[index].heading.focused, true);
    }
    assert.equal(ui.get('state').textContent, 'RESOLVED');
    assert.equal(ui.get('storage-node').getAttribute('data-resolved'), 'true');
    assert.equal(ui.get('next').getAttribute('disabled'), '');
    ui.get('next').click();
    assert.equal(ui.get('progress').textContent, 'Step 7 of 7');
    ui.buttons[2].click();
    assert.equal(ui.get('state').textContent, 'INVESTIGATING');
    assert.equal(ui.get('dependency-label').textContent, 'Mount missing');
    assert.equal(ui.get('storage-node').getAttribute('data-resolved'), 'false');
    ui.get('previous').click();
    assert.equal(ui.get('progress').textContent, 'Step 2 of 7');
    ui.buttons[0].click();
    ui.get('previous').click();
    assert.equal(ui.get('progress').textContent, 'Step 1 of 7');
    assert.equal(ui.buttons.filter((button) => button.getAttribute('aria-current') === 'step').length, 1);
  } finally {
    if (original === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = original;
  }
});

test('incomplete markup remains a readable static report', () => {
  const ui = fixture();
  ui.root.querySelector = () => null;
  assert.doesNotThrow(() => initializeWalkthrough(ui.root));
  assert.ok(ui.panels.every((panel) => panel.getAttribute('hidden') === null));
});
