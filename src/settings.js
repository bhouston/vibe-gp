// Settings panel: a gear button in the top-right corner opens a panel with the driver
// aids / damage toggles, the controls list and the renderer in use. The toggles are
// saved to localStorage so they survive reloads and track changes.

const KEY = 'vibegp.settings';
const DEFAULTS = { tc: true, abs: true, damage: true };

const TOGGLES = [
  { id: 'tc', name: 'Traction control', desc: 'Traction, stability and steering assists' },
  { id: 'abs', name: 'ABS', desc: 'Anti-lock brakes' },
  { id: 'damage', name: 'Damage', desc: 'Collision damage (off also repairs the car)' },
];

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export class Settings {
  constructor() {
    this.values = load();
    this.onChange = null; // set by main: (id, value) => void
    this.button = document.getElementById('settings-btn');
    this.panel = document.getElementById('settings');
    const list = document.getElementById('settings-toggles');

    this.switches = {};
    for (const t of TOGGLES) {
      const row = document.createElement('button');
      row.className = 'setting';
      row.type = 'button';
      row.innerHTML = `<span><b>${t.name}</b><small>${t.desc}</small></span><i class="switch"></i>`;
      row.addEventListener('mousedown', (e) => e.preventDefault()); // keep keyboard focus on the game
      row.addEventListener('click', () => this.set(t.id, !this.values[t.id]));
      list.appendChild(row);
      this.switches[t.id] = row;
    }
    this.render();

    this.button.addEventListener('mousedown', (e) => e.preventDefault());
    this.button.addEventListener('click', () => this.toggle());
    // click anywhere outside the panel closes it
    addEventListener('pointerdown', (e) => {
      if (this.open && !this.panel.contains(e.target) && !this.button.contains(e.target)) this.toggle(false);
    });
  }

  get open() {
    return !this.panel.hidden;
  }

  toggle(open = !this.open) {
    this.panel.hidden = !open;
    this.button.classList.toggle('active', open);
  }

  get(id) {
    return this.values[id];
  }

  set(id, value) {
    this.values[id] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* storage unavailable: the setting still applies for this session */
    }
    this.render();
    this.onChange?.(id, value);
  }

  render() {
    for (const [id, row] of Object.entries(this.switches)) {
      row.classList.toggle('on', !!this.values[id]);
      row.setAttribute('aria-pressed', String(!!this.values[id]));
    }
  }
}
