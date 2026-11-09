/** Enhance the static report without fetching data or executing diagnostic commands.
 * @param {Element} root
 */
export function initializeWalkthrough(root) {
  const panels = Array.from(root.querySelectorAll('[data-step]'));
  const buttons = Array.from(root.querySelectorAll('[data-step-button]'));
  const previous = root.querySelector('[data-previous]');
  const next = root.querySelector('[data-next]');
  const progress = root.querySelector('[data-progress]');
  const state = root.querySelector('[data-state]');
  const dependency = root.querySelector('[data-dependency-label]');
  const storage = root.querySelector('[data-storage-node]');
  if (!panels.length || buttons.length !== panels.length || !previous || !next || !progress || !state || !dependency || !storage) return;
  let current = 0;
  /** @param {number} index */
  const show = (index, focus = true) => {
    current = Math.max(0, Math.min(panels.length - 1, index));
    panels.forEach((panel, i) => { panel.toggleAttribute('hidden', i !== current); });
    buttons.forEach((button, i) => {
      if (i === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    previous.toggleAttribute('disabled', current === 0);
    next.toggleAttribute('disabled', current === panels.length - 1);
    progress.textContent = `Step ${current + 1} of ${panels.length}`;
    const panel = panels[current];
    state.textContent = panel.getAttribute('data-status');
    const resolved = state.textContent === 'RESOLVED';
    state.setAttribute('data-resolved', String(resolved));
    storage.setAttribute('data-resolved', String(resolved));
    dependency.textContent = panel.getAttribute('data-dependency');
    if (focus) {
      const heading = panel.querySelector('[data-step-heading]');
      if (heading instanceof HTMLElement) heading.focus();
    }
  };
  buttons.forEach((button, index) => button.addEventListener('click', () => show(index)));
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  root.querySelector('[data-timeline]')?.removeAttribute('hidden');
  root.querySelector('[data-controls]')?.removeAttribute('hidden');
  show(0, false);
}
