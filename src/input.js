// Keyboard controls.
const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set(); // one-shot presses, cleared each frame
    this.assists = { tc: true, abs: true }; // T / B toggle traction control and brake assist
    addEventListener('keydown', (e) => {
      if (Object.values(KEYS).flat().includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      if (!e.repeat && e.code === 'KeyT') this.assists.tc = !this.assists.tc;
      if (!e.repeat && e.code === 'KeyB') this.assists.abs = !this.assists.abs;
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  is(action) {
    return KEYS[action].some((k) => this.down.has(k));
  }

  /** True once per key press. */
  hit(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
  }

  get state() {
    return {
      throttle: this.is('throttle') ? 1 : 0,
      brake: this.is('brake') ? 1 : 0,
      steer: (this.is('left') ? 1 : 0) - (this.is('right') ? 1 : 0),
      tc: this.assists.tc,
      abs: this.assists.abs,
    };
  }
}
