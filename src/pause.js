// Pause menu: Esc or P in a race (or MENU on touch screens), and automatically when the
// window loses focus. The race is frozen while it's open (main.js skips the simulation);
// the menu resumes, restarts the race, opens Settings or goes back to the car / circuit
// selector. Keyboard: up / down (or W / S) to choose, Enter or Space to pick, Esc or P
// to resume, R to restart.

const ITEMS = [
  { id: 'resume', label: 'Resume', key: 'Esc' },
  { id: 'restart', label: 'Restart race', key: 'R' },
  { id: 'settings', label: 'Settings', key: '' },
  { id: 'quit', label: 'Change car or circuit', key: '' },
];

export class PauseMenu {
  /** handlers: { resume, restart, settings, quit } */
  constructor(handlers) {
    this.handlers = handlers;
    this.el = document.createElement('div');
    this.el.id = 'pause';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="pause-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <h2 id="pause-title">Paused</h2>
        <p class="pause-info"></p>
        <div class="pause-items"></div>
        <p class="pause-hint">Esc or P to resume</p>
      </div>`;
    this.info = this.el.querySelector('.pause-info');
    const list = this.el.querySelector('.pause-items');
    this.buttons = ITEMS.map((item, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-btn pause-btn';
      b.innerHTML = `<span>${item.label}</span>${item.key ? `<kbd>${item.key}</kbd>` : ''}`;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // keep keyboard focus on the game
      b.addEventListener('click', () => this.pick(i));
      b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && this.focus(i));
      list.appendChild(b);
      return b;
    });
    // inside the HUD, under the settings panel (which it can open on top of itself)
    document.getElementById('hud').appendChild(this.el);
    this.index = 0;
  }

  get visible() {
    return !this.el.hidden;
  }

  /** Open the menu; `info` is a line about the race so far (track, lap, position). */
  show(info) {
    this.info.textContent = info ?? '';
    this.el.hidden = false;
    this.focus(0);
  }

  hide() {
    this.el.hidden = true;
  }

  focus(i) {
    this.index = (i + ITEMS.length) % ITEMS.length;
    this.buttons.forEach((b, k) => b.classList.toggle('focused', k === this.index));
  }

  pick(i) {
    this.handlers[ITEMS[i].id]?.();
  }

  /** Keyboard while paused (Input one-shot presses). */
  handleKeys(input) {
    if (input.hit('Escape') || input.hit('KeyP')) return this.pick(0);
    if (input.hit('KeyR')) return this.pick(1);
    const step = (input.hit('ArrowDown') || input.hit('KeyS') ? 1 : 0) - (input.hit('ArrowUp') || input.hit('KeyW') ? 1 : 0);
    if (step) this.focus(this.index + step);
    if (input.hit('Enter') || input.hit('Space')) this.pick(this.index);
  }
}
