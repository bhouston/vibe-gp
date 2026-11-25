// Settings: a centred popup (like the pause menu) opened from the gear button in the top-right
// corner or from the pause menu. Tabs split it into Race, Audio, Display and Controls. The
// values are saved to localStorage so they survive reloads and track changes (all but the
// `session` ones, which start from their defaults each time the game loads).

const KEY = 'vibegp.settings';
const DEFAULTS = {
  tc: true, abs: true, damage: true,
  music: true, musicVol: 100, sound: true, sfxVol: 100,
  ai: true, aiLevel: 'normal', laps: 5, noResets: false, chaos: 40,
  graphics: 'auto',
  boxes: false, // the collision boxes overlay (debug; also key O)
};

const TABS = [
  { id: 'race', label: 'Race' },
  { id: 'audio', label: 'Audio' },
  { id: 'display', label: 'Display' },
  { id: 'controls', label: 'Controls' }, // static help, from index.html
];

// A row is a switch (on / off), `choices` (a segmented picker) or `range` ([min, max, step]
// slider, applied while it moves). `group` starts a heading inside the tab; `needs` dims and
// disables the row while that switch is off; `session` rows aren't saved.
const ROWS = [
  { tab: 'race', group: 'Driver aids', id: 'tc', name: 'Traction control', desc: 'Traction, stability and steering assists' },
  { tab: 'race', id: 'abs', name: 'ABS', desc: 'Anti-lock brakes' },
  { tab: 'race', id: 'damage', name: 'Damage', desc: 'Collision damage. Turning it off repairs the car' },
  { tab: 'race', group: 'Opponents', id: 'ai', name: 'AI opponents', desc: 'Race the other ten teams. Restarts the race' },
  { tab: 'race', id: 'aiLevel', name: 'Difficulty', desc: 'How hard the AI cars push. Restarts the race', choices: ['easy', 'normal', 'hard', 'expert'], needs: 'ai' },
  { tab: 'race', id: 'laps', name: 'Race length', desc: 'Laps per race. Restarts the race', choices: [3, 5, 10, 20], needs: 'ai' },
  { tab: 'race', id: 'chaos', name: 'Chaos', desc: 'Low is tidy racing. High means late braking, divebombs and crashes', range: [0, 100, 5], needs: 'ai' },
  { tab: 'race', id: 'noResets', name: 'No resets', desc: 'Crashed AI cars aren\'t put back on track: they recover or retire', needs: 'ai' },
  { tab: 'audio', group: 'Music', id: 'music', name: 'Play music', desc: 'The background track' },
  { tab: 'audio', id: 'musicVol', name: 'Volume', aria: 'Music volume', range: [0, 100, 5], unit: '%', needs: 'music' },
  { tab: 'audio', group: 'Sound effects', id: 'sound', name: 'Play sound effects', desc: 'Engine, tyres, wind, crashes and start lights' },
  { tab: 'audio', id: 'sfxVol', name: 'Volume', aria: 'Sound effects volume', range: [0, 100, 5], unit: '%', needs: 'sound' },
  { tab: 'display', group: 'Graphics', id: 'graphics', name: 'Quality', desc: 'Auto lowers the resolution when the frame rate drops. Low suits slower computers. Reloads the game', choices: ['auto', 'high', 'low'] },
  { tab: 'display', group: 'Debug', id: 'boxes', name: 'Collision boxes', desc: 'Every car\'s collision boxes, red where they touch another car (key O)', session: true },
];
const SESSION = new Set(ROWS.filter((r) => r.session).map((r) => r.id));

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const id of SESSION) delete saved[id];
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

const label = (v) => (typeof v === 'string' ? v[0].toUpperCase() + v.slice(1) : String(v));
/** Buttons keep keyboard focus on the game (the arrow keys drive the car). */
const noFocus = (el) => el.addEventListener('mousedown', (e) => e.preventDefault());

export class Settings {
  constructor() {
    this.values = load();
    this.onChange = null; // set by main: (id, value) => void
    this.onOpen = null; // set by main: called before the popup opens (pauses a race)
    this.button = document.getElementById('settings-btn');
    this.el = document.getElementById('settings');
    this.panel = this.el.querySelector('.settings-panel');
    const tabBar = this.el.querySelector('.settings-tabs');
    const body = this.el.querySelector('.settings-body');

    // one <section> per tab; Controls is already in the page
    this.sections = {};
    this.tabs = {};
    for (const t of TABS) {
      let section = body.querySelector(`[data-tab="${t.id}"]`);
      if (!section) {
        section = document.createElement('section');
        section.dataset.tab = t.id;
        body.appendChild(section);
      }
      section.setAttribute('role', 'tabpanel');
      this.sections[t.id] = section;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `settings-tab tab-${t.id}`;
      tab.setAttribute('role', 'tab');
      tab.textContent = t.label;
      noFocus(tab);
      tab.addEventListener('click', () => this.showTab(t.id));
      tabBar.appendChild(tab);
      this.tabs[t.id] = tab;
    }
    // Controls stays last
    body.appendChild(this.sections.controls);

    this.rows = {};
    for (const r of ROWS) {
      const section = this.sections[r.tab];
      if (r.group) {
        const h = document.createElement('h3');
        h.textContent = r.group;
        section.appendChild(h);
      }
      const row = this.buildRow(r);
      row.dataset.id = r.id;
      section.appendChild(row);
      this.rows[r.id] = row;
    }
    // notes in the page (the renderer in use) go under the tab's rows
    for (const note of body.querySelectorAll('.settings-note')) note.parentElement.appendChild(note);

    this.el.querySelector('.settings-close').addEventListener('click', () => this.toggle(false));
    noFocus(this.el.querySelector('.settings-close'));
    noFocus(this.button);
    this.button.addEventListener('click', () => this.toggle());
    // a click on the dimmed backdrop (outside the panel) closes it
    this.el.addEventListener('pointerdown', (e) => e.target === this.el && this.toggle(false));

    this.showTab('race');
    this.render();
  }

  buildRow(r) {
    const text = `<span class="setting-text"><b>${r.name}</b>${r.desc ? `<small>${r.desc}</small>` : ''}</span>`;
    if (r.range) {
      const row = document.createElement('div');
      row.className = 'setting slider';
      const [min, max, step] = r.range;
      row.innerHTML = `<div class="setting-top">${text}<output class="value"></output></div><input type="range" min="${min}" max="${max}" step="${step}" aria-label="${r.aria ?? r.name}">`;
      const input = row.querySelector('input');
      input.addEventListener('input', () => this.set(r.id, +input.value));
      // the arrow keys drive the car: hand focus back to the game once the slider is let go
      input.addEventListener('change', () => input.blur());
      return row;
    }
    if (r.choices) {
      const row = document.createElement('div');
      row.className = 'setting choices';
      row.innerHTML = `${text}<div class="segments" role="radiogroup" aria-label="${r.name}"></div>`;
      const seg = row.querySelector('.segments');
      for (const c of r.choices) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.value = String(c);
        b.textContent = label(c);
        noFocus(b);
        b.addEventListener('click', () => this.values[r.id] !== c && this.set(r.id, c));
        seg.appendChild(b);
      }
      return row;
    }
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'setting toggle';
    row.setAttribute('role', 'switch');
    row.innerHTML = `${text}<i class="switch" aria-hidden="true"></i>`;
    noFocus(row);
    row.addEventListener('click', () => this.set(r.id, !this.values[r.id]));
    return row;
  }

  showTab(id) {
    this.tab = id;
    for (const [k, s] of Object.entries(this.sections)) s.hidden = k !== id;
    for (const [k, t] of Object.entries(this.tabs)) {
      t.classList.toggle('active', k === id);
      t.setAttribute('aria-selected', String(k === id));
    }
    this.el.querySelector('.settings-body').scrollTop = 0;
  }

  get open() {
    return !this.el.hidden;
  }

  toggle(open = !this.open) {
    if (open === this.open) return;
    if (open) this.onOpen?.();
    this.el.hidden = !open;
    this.button.classList.toggle('active', open);
  }

  get(id) {
    return this.values[id];
  }

  set(id, value) {
    this.values[id] = value;
    try {
      const saved = { ...this.values };
      for (const k of SESSION) delete saved[k];
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      /* storage unavailable: the setting still applies for this session */
    }
    this.render();
    this.onChange?.(id, value);
  }

  render() {
    for (const r of ROWS) {
      const row = this.rows[r.id];
      const v = this.values[r.id];
      const off = r.needs ? !this.values[r.needs] : false;
      row.classList.toggle('disabled', off);
      if (r.range) {
        const input = row.querySelector('input');
        input.value = v;
        input.disabled = off;
        row.querySelector('.value').textContent = `${v}${r.unit ?? ''}`;
      } else if (r.choices) {
        for (const b of row.querySelectorAll('.segments button')) {
          const on = b.dataset.value === String(v);
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', String(on));
          b.disabled = off;
        }
      } else {
        row.classList.toggle('on', !!v);
        row.setAttribute('aria-checked', String(!!v));
        row.disabled = off;
      }
    }
  }
}
