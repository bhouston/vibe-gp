// Settings panel: a gear button in the top-right corner opens a panel with the driver
// aids / damage / sound toggles, the controls list and the renderer in use. The toggles are
// saved to localStorage so they survive reloads and track changes.

const KEY = 'vibegp.settings';
const DEFAULTS = { tc: true, abs: true, damage: true, music: true, sound: true, ai: true, aiLevel: 'normal', laps: 5, noResets: false, chaos: 40, graphics: 'auto' };

const TOGGLES = [
  { id: 'tc', name: 'Traction control', desc: 'Traction, stability and steering assists' },
  { id: 'abs', name: 'ABS', desc: 'Anti-lock brakes' },
  { id: 'damage', name: 'Damage', desc: 'Collision damage (off also repairs the car)' },
  { id: 'music', name: 'Music', desc: 'Background music' },
  { id: 'sound', name: 'Sound effects', desc: 'Engine, wind, tyres and crashes' },
  { id: 'ai', name: 'AI opponents', desc: 'Race the other ten teams (restarts the race)' },
  // choices: a click steps to the next value
  { id: 'aiLevel', name: 'AI difficulty', desc: 'How hard the other cars push', choices: ['easy', 'normal', 'hard', 'expert'] },
  { id: 'laps', name: 'Race length', desc: 'Laps, with AI opponents', choices: [3, 5, 10, 20] },
  // range: a slider [min, max, step]; changes apply at once
  { id: 'chaos', name: 'AI chaos', desc: 'How differently the AI drivers race: low is tidy, high is late braking, divebombs and crashes', range: [0, 100, 5] },
  { id: 'graphics', name: 'Graphics', desc: 'Auto lowers the resolution while the frame rate is low; Low is the light profile for slower PCs. Reloads the game', choices: ['auto', 'high', 'low'] },
  { id: 'noResets', name: 'No resets', desc: 'A crashed AI car isn\'t put back on the track: it drives itself out, or retires' },
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
      if (t.range) {
        const row = document.createElement('label');
        row.className = 'setting slider';
        const [min, max, step] = t.range;
        row.innerHTML = `<span><b>${t.name} <em class="value"></em></b><small>${t.desc}</small></span><input type="range" min="${min}" max="${max}" step="${step}">`;
        const input = row.querySelector('input');
        input.addEventListener('input', () => this.set(t.id, +input.value));
        // arrow keys drive the car: hand focus back to the game once the slider is let go
        input.addEventListener('change', () => input.blur());
        list.appendChild(row);
        this.switches[t.id] = row;
        continue;
      }
      const row = document.createElement('button');
      row.className = 'setting';
      row.type = 'button';
      row.innerHTML = `<span><b>${t.name}</b><small>${t.desc}</small></span>${t.choices ? '<i class="choice"></i>' : '<i class="switch"></i>'}`;
      row.addEventListener('mousedown', (e) => e.preventDefault()); // keep keyboard focus on the game
      row.addEventListener('click', () => {
        if (!t.choices) return this.set(t.id, !this.values[t.id]);
        const i = t.choices.indexOf(this.values[t.id]);
        this.set(t.id, t.choices[(i + 1) % t.choices.length]);
      });
      if (t.choices) row.classList.add('choices');
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
      if (row.classList.contains('slider')) {
        row.querySelector('input').value = this.values[id];
        row.querySelector('.value').textContent = this.values[id];
        continue;
      }
      if (row.classList.contains('choices')) {
        row.querySelector('.choice').textContent = String(this.values[id]).toUpperCase();
        continue;
      }
      row.classList.toggle('on', !!this.values[id]);
      row.setAttribute('aria-pressed', String(!!this.values[id]));
    }
  }
}
