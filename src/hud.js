// DOM-based heads-up display.
import { formatTime } from './race.js';
import { COMPOUND_LIST, TYRE } from './tyres.js';
import { DAMAGE } from './damage.js';

/** Pirelli-style tyre badge: black tyre, compound-coloured ring and letter. */
function compoundIcon(c) {
  return `<svg viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="18" fill="#141518"/>
    <circle cx="20" cy="20" r="13" fill="none" stroke="${c.css}" stroke-width="3.2"/>
    <text x="20" y="21" text-anchor="middle" dominant-baseline="middle" fill="${c.css}" font-size="13" font-weight="900" font-style="italic">${c.letter}</text>
  </svg>`;
}

// Per-frame HUD writes go through these: they touch the page only when a value changes,
// since every write (even of the same text) makes the browser redo the HUD's style and layout.
const shown = new WeakMap(); // element -> { key: last value written }
function changed(el, key, v) {
  let m = shown.get(el);
  if (!m) shown.set(el, (m = {}));
  if (m[key] === v) return false;
  m[key] = v;
  return true;
}
const setText = (el, v) => changed(el, '#text', (v = String(v))) && (el.textContent = v);
const setStyle = (el, prop, v) => changed(el, prop, v) && el.style.setProperty(prop, v);
const setAttr = (el, name, v) => changed(el, '@' + name, v) && el.setAttribute(name, v);

export class Hud {
  constructor() {
    this.el = {
      speed: document.getElementById('speed'),
      gear: document.getElementById('gear'),
      rpm: document.getElementById('rpm-fill'),
      lap: document.getElementById('lap'),
      current: document.getElementById('current'),
      last: document.getElementById('last'),
      best: document.getElementById('best'),
      flash: document.getElementById('flash'),
      cam: document.getElementById('cam'),
      surface: document.getElementById('surface'),
      trackName: document.getElementById('track-name'),
      map: document.getElementById('minimap'),
      tyres: [0, 1, 2, 3].map((i) => document.getElementById(`tyre-${i}`)),
      tc: document.getElementById('aid-tc'),
      abs: document.getElementById('aid-abs'),
      fitted: document.getElementById('tyre-fitted'),
      wingChange: document.getElementById('wing-change'),
      wingChoice: document.getElementById('wing-choice'),
      wing: [0, 1].map((i) => document.getElementById(`wing-${i}`)),
      damageMap: document.querySelector('.damage-map'),
      damageState: document.getElementById('damage-state'),
    };
    this.damageParts = buildDamageCar(document.getElementById('damage-car'));
    this.onCompound = null; // set by main: (compound) => void
    this.onPick = null; // set by main: (race entry) => void, a car clicked in the timing tower
    this.watching = null; // the race entry being watched (its tower row is marked)
    document.getElementById('standings-list').addEventListener('click', (ev) => {
      const li = ev.target.closest('li[data-i]');
      const e = li && this.race?.entries[+li.dataset.i];
      if (e) this.onPick?.(e);
    });
    this.onWing = null; // set by main: () => void, toggles the wing change
    this.el.wingChange.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.wingChange.addEventListener('click', () => this.onWing?.());
    const row = document.getElementById('compounds');
    this.compoundButtons = COMPOUND_LIST.map((c, i) => {
      const b = document.createElement('button');
      b.className = 'compound';
      b.style.setProperty('--c', c.css);
      b.title = `${c.name} tyres for the next pit stop (${i + 1})`;
      b.innerHTML = `${compoundIcon(c)}<span>${c.name}</span><kbd>${i + 1}</kbd>`;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // keep keyboard focus on the game
      b.addEventListener('click', () => this.onCompound?.(c));
      row.appendChild(b);
      return { c, b };
    });
  }

  /** Tint the HUD in the player's team colours. */
  setTeam(team) {
    const root = document.documentElement.style;
    // navy is too dark to read as an accent on the dark panels, so Red Bull uses its red
    root.setProperty('--team', team.id === 'redbull' ? team.ui.secondary : team.ui.primary);
    root.setProperty('--team-accent', team.ui.accent);
    document.getElementById('team-name').textContent = `${team.name} · #${team.number}`;
    this.teamColor = team.ui.accent;
    if (this.mapCar) this.mapCar.setAttribute('fill', this.teamColor);
  }

  /** Mark the player's pit box on the minimap (call after setTrack). */
  setBox(box) {
    this.el.map.querySelector('#map-box')?.remove();
    if (!box || !this.mapCar) return;
    const r = this.mapSw * 0.9;
    const m = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    m.id = 'map-box';
    for (const [k, v] of Object.entries({ x: box.x - r, y: box.z - r, width: r * 2, height: r * 2, fill: this.teamColor ?? '#ffc400', stroke: '#fff', 'stroke-width': this.mapSw * 0.3 })) m.setAttribute(k, v);
    this.mapCar.before(m); // under the car marker
  }

  /** Draw the minimap for a newly loaded track. */
  setTrack(path, def) {
    const b = path.bounds();
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const pad = size * 0.08;
    const sw = size / 40;
    this.mapSw = sw;
    const start = path.poseAt(0);
    this.el.map.setAttribute('viewBox', `${b.minX - pad} ${b.minZ - pad} ${b.maxX - b.minX + pad * 2} ${b.maxZ - b.minZ + pad * 2}`);
    this.el.map.innerHTML = `
      ${path.pit ? `<path d="${path.pit.svgPath(3)}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="${sw * 0.45}" stroke-linejoin="round"/>` : ''}
      <path d="${path.svgPath(3)}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="${sw}" stroke-linejoin="round"/>
      <rect x="${start.x - sw}" y="${start.z - sw}" width="${sw * 2}" height="${sw * 2}" fill="#e10600"/>
      <circle id="map-car" r="${sw * 1.4}" fill="${this.teamColor ?? '#ffc400'}" stroke="#000" stroke-width="${sw * 0.3}"/>`;
    this.mapCar = this.el.map.querySelector('#map-car');
    this.el.trackName.textContent = def.name;
  }

  /**
   * The race field (src/ai.js Race, or null for a solo run): a minimap dot per AI car,
   * the timing tower and the position row.
   */
  setRace(race) {
    this.race = race;
    this.el.map.querySelectorAll('.map-ai').forEach((n) => n.remove());
    this.aiDots = [];
    const tower = document.getElementById('standings');
    tower.hidden = !race;
    document.getElementById('pos-row').hidden = !race;
    this.towerAt = -1;
    if (!race || !this.mapCar) return;
    for (const e of race.ai) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.classList.add('map-ai');
      c.setAttribute('r', (this.mapSw * 0.95).toFixed(1));
      c.setAttribute('fill', e.team.ui.primary);
      c.setAttribute('stroke', e.team.ui.accent);
      c.setAttribute('stroke-width', (this.mapSw * 0.3).toFixed(1));
      this.mapCar.before(c); // the player's dot stays on top
      this.aiDots.push({ e, c });
    }
  }

  updateRace(now) {
    const race = this.race;
    if (!race) return;
    for (const { e, c } of this.aiDots) {
      setAttr(c, 'cx', e.physics.position.x.toFixed(1));
      setAttr(c, 'cy', e.physics.position.z.toFixed(1));
      setAttr(c, 'opacity', e.retired ? '0.35' : '1');
    }
    const me = race.player;
    setText(this.el.pos ??= document.getElementById('pos'), `${me.position} / ${race.entries.length}`);
    setText(this.el.lap, me.finished ? 'FINISHED' : me.lap === 0 ? 'OUT' : `${Math.min(me.lap, race.laps)} / ${race.laps}`);
    // the tower: a few times a second is plenty
    if (now - this.towerAt < 0.25) return;
    this.towerAt = now;
    const leader = race.order[0];
    const done = me.finished;
    document.getElementById('standings-title').textContent = done ? 'FINAL RESULT' : race.leaderDone ? 'CHEQUERED FLAG' : 'RACE';
    const lap = Math.min(race.laps, Math.max(1, leader.lap));
    document.getElementById('standings-laps').textContent = `LAP ${lap}/${race.laps}`;
    const L = race.path.length;
    const rows = race.order.map((e) => {
      let gap = '';
      if (race.sinceGreen === 0) gap = `P${e.slot + 1}`; // on the grid: the starting slot
      else if (e.retired) gap = 'OUT';
      else if (e.physics.onPitLane && !e.finished) gap = 'PIT';
      else if (e.position === 1) gap = e.finished ? formatTime(e.finishTime) : 'LEADER';
      else if (e.finished && leader.finished) {
        const lapsDown = race.laps - Math.round(e.flagAt / L);
        gap = lapsDown > 0 ? `+${lapsDown} LAP${lapsDown > 1 ? 'S' : ''}` : `+${(e.finishTime - leader.finishTime).toFixed(1)}`;
      } else {
        const down = Math.floor((leader.progress - e.progress) / L);
        gap = down >= 1 ? `+${down} LAP${down > 1 ? 'S' : ''}` : `+${race.gapTo(e, leader).toFixed(1)}`;
      }
      const name = e.isPlayer ? 'YOU' : e.team.name;
      // the tyre each car is on, in its sidewall colour (and the AI's driving style on hover)
      const c = e.physics.compound;
      const tyre = c ? `<b class="tyre" style="color:${c.css};border-color:${c.css}">${c.letter}</b>` : '<b></b>';
      const stops = e.stops ? `${e.stops} stop${e.stops > 1 ? 's' : ''}` : 'no stops';
      const title = ` title="${e.style ? `${e.style.name} driver · ` : ''}${c ? `${c.name.toLowerCase()}s · ` : ''}${stops}"`;
      const pit = gap === 'PIT' ? ' pit' : '';
      const watch = e === this.watching ? ' watch' : '';
      return `<li data-i="${race.entries.indexOf(e)}"${title} class="${e.isPlayer ? 'me' : ''}${e.finished ? ' done' : ''}${e.retired ? ' out' : ''}${pit}${watch}"><span class="p">${e.position}</span><i style="background:${e.team.ui.primary}"></i><span>${name}</span>${tyre}<span class="gap">${gap}</span></li>`;
    });
    document.getElementById('standings-list').innerHTML = rows.join('');
  }

  update(car, timer, camMode, pitStop = null) {
    const e = this.el;
    if (this.mapCar) {
      setAttr(this.mapCar, 'cx', car.position.x.toFixed(1));
      setAttr(this.mapCar, 'cy', car.position.z.toFixed(1));
    }
    setText(e.speed, Math.round(Math.abs(car.speed) * 3.6));
    setText(e.gear, car.gear);
    setStyle(e.rpm, 'width', `${(car.rpm * 100).toFixed(1)}%`);
    e.rpm.classList.toggle('redline', car.rpm > 0.93);
    if (!this.race) setText(e.lap, timer.lap === 0 ? 'OUT' : timer.lap);
    setText(e.current, formatTime(timer.current));
    setText(e.last, formatTime(timer.last));
    setText(e.best, formatTime(timer.best));
    setText(e.cam, camMode.toUpperCase());
    const dirt = car.wheels.reduce((a, w) => a + w.dirt, 0) / 4;
    const dmg = car.damage;
    const wingHurt = dmg.wingHealth < 0.85;
    const wingNext = pitStop?.state === 'service' ? pitStop.changingWing : !!pitStop?.nextWing;
    setText(e.surface, pitText(pitStop, car) ?? (car.inPitLane ? 'PIT LIMITER 80' : car.onPitLane ? 'PIT LANE' : car.surface === 'gravel' ? 'IN THE GRAVEL' : car.surface === 'grass' || car.surface === 'runoff' ? 'OFF TRACK' : dirt > 0.15 ? 'DIRTY TYRES'
      : wingHurt && !wingNext ? 'FRONT WING DAMAGED · F: NEW WING AT THE NEXT STOP' : ''));
    // front wing: condition per half, and whether a new one goes on at the next stop
    dmg.wing.forEach((d, i) => {
      const el = e.wing[i];
      const lost = d >= DAMAGE.wingBreak;
      el.classList.toggle('lost', lost);
      setStyle(el, 'background', lost ? '' : damageColor(d / DAMAGE.wingBreak));
    });
    // the whole car: every part coloured by its damage, dashed where it has broken off
    e.damageMap.classList.toggle('off', !car.damageOn);
    setText(e.damageState, car.damageOn ? 'DAMAGE' : 'DAMAGE OFF');
    for (const p of this.damageParts) {
      const d = p.i === null ? dmg[p.part] : dmg[p.part][p.i];
      const lost = d >= p.breakAt;
      const key = lost ? 'lost' : damageColor(d / p.breakAt);
      if (key === p.key) continue;
      p.key = key;
      p.el.classList.toggle('lost', lost);
      p.el.style[p.el.tagName === 'line' ? 'stroke' : 'fill'] = lost ? '' : key;
    }
    e.wingChange.classList.toggle('selected', wingNext);
    e.wingChange.classList.toggle('needed', wingHurt);
    setText(e.wingChoice, wingNext ? 'YES' : 'NO');
    const next = pitStop?.state === 'service' ? pitStop.fitting : pitStop?.nextCompound;
    for (const { c, b } of this.compoundButtons) b.classList.toggle('selected', c === next);
    const comp = car.compound;
    const wear = car.wheels.reduce((a, w) => Math.max(a, w.wear), 0);
    const fitted = `<i style="color:${comp.css}">${comp.letter}</i> ${Math.round((1 - wear) * 100)}%`;
    if (fitted !== this.lastFitted) e.fitted.innerHTML = this.lastFitted = fitted;
    car.wheels.forEach((w, i) => {
      const el = e.tyres[i];
      setText(el, Math.round(w.temp));
      // colour by the compound's own window: softs are happy cooler than hards
      setStyle(el, 'background', tyreColor(w.temp + TYRE.tOpt - comp.tOpt));
      el.classList.toggle('slide', w.slide > 1.05);
      el.classList.toggle('kerb', w.surface.name === 'kerb' || w.surface.name === 'sausage');
      el.classList.toggle('grass', w.surface.name === 'grass');
      el.classList.toggle('runoff', w.surface.name === 'runoff');
      el.classList.toggle('gravel', w.surface.name === 'gravel');
      setStyle(el, '--dmg', `${Math.round(w.damage * 100)}%`);
      el.classList.toggle('damaged', w.damage > 0.5);
    });
    e.tc.classList.toggle('on', car.tc);
    e.tc.classList.toggle('active', car.tc && car.tcActive);
    e.abs.classList.toggle('on', car.abs);
    e.abs.classList.toggle('active', car.abs && car.absActive);
    const f = timer.flash;
    if (f && timer.time < f.until) {
      setText(e.flash, f.text);
      e.flash.classList.add('show');
      e.flash.classList.toggle('best', !!f.best);
      e.flash.classList.toggle('warn', !!f.warn);
    } else e.flash.classList.remove('show');
  }
}

/** Pit box guidance while the player's box is ahead, on the marks or being serviced. */
function pitText(p, car) {
  if (!p) return null;
  switch (p.state) {
    case 'approach': return `${car.inPitLane ? 'PIT LIMITER 80' : 'PIT LANE'} · YOUR BOX ${Math.round(p.distance)} M`;
    case 'inBox': return 'IN THE BOX · STOP';
    case 'service': return `PIT STOP ${p.elapsed.toFixed(1)} s · ${p.fitting.name}S${p.changingWing ? ' + FRONT WING' : ''}`;
    default: return null;
  }
}

/**
 * Top-view car diagram for the damage panel (nose up, so the car's left is on the left).
 * Returns the parts: { part, i, el, breakAt } with breakAt the level at which it's gone
 * (or 1 for parts that only wear down).
 */
function buildDamageCar(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs, cls) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (cls) el.setAttribute('class', cls);
    svg.appendChild(el);
    return el;
  };
  make('rect', { x: 24, y: 9, width: 12, height: 100, rx: 5 }, 'chassis'); // survival cell: never breaks
  const parts = [];
  const part = (part, i, tag, attrs, breakAt = 1) => {
    const el = make(tag, attrs, 'part');
    const t = document.createElementNS(NS, 'title');
    const corner = part === 'tyre' || part === 'suspension';
    const where = i === null ? '' : `${(corner ? ['left front', 'right front', 'left rear', 'right rear'] : ['left', 'right'])[i]} `;
    t.textContent = `${where}${{ wing: 'front wing', rearWing: 'rear wing', engine: 'engine / gearbox' }[part] ?? part}`;
    el.appendChild(t);
    parts.push({ part, i, el, breakAt, key: null });
  };
  for (const i of [0, 1]) {
    const x = (l, w) => (i === 0 ? l : 60 - l - w); // mirror a left-side x for the right side
    part('wing', i, 'rect', { x: x(4, 25), y: 3, width: 25, height: 7, rx: 1.5 }, DAMAGE.wingBreak);
    part('floor', i, 'rect', { x: x(9, 3.5), y: 40, width: 3.5, height: 52, rx: 1 });
    part('sidepod', i, 'rect', { x: x(14, 10), y: 44, width: 10, height: 32, rx: 3 });
    part('mirror', i, 'rect', { x: x(15, 6), y: 37, width: 6, height: 3, rx: 1 });
  }
  part('engine', null, 'rect', { x: 26, y: 74, width: 8, height: 22, rx: 2 });
  part('rearWing', null, 'rect', { x: 15, y: 112, width: 30, height: 8, rx: 1.5 }, DAMAGE.rearWingBreak);
  [0, 1, 2, 3].forEach((c) => {
    const left = c % 2 === 0, front = c < 2;
    const y = front ? 26 : 94;
    part('suspension', c, 'line', { x1: left ? 12 : 36, x2: left ? 24 : 48, y1: y, y2: y });
    part('tyre', c, 'rect', { x: left ? 3 : 48, y: y - (front ? 9 : 10), width: 9, height: front ? 18 : 20, rx: 2 });
  });
  return parts;
}

/** Damage colour: green intact, through amber, to red about to fall off (d = 0..1). */
function damageColor(d) {
  const stops = [[0, [63, 163, 77]], [0.35, [245, 196, 0]], [1, [255, 42, 42]]];
  const k = Math.min(1, Math.max(0, d));
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (k <= t1) {
      const u = (k - t0) / (t1 - t0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * u))})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1]})`;
}

/** Tread temperature colour: blue cold, green in the window (~100-115 °C), red hot. */
function tyreColor(t) {
  const stops = [[60, [76, 141, 255]], [90, [90, 200, 230]], [105, [60, 200, 90]], [118, [250, 200, 40]], [135, [240, 60, 50]]];
  if (t <= stops[0][0]) return `rgb(${stops[0][1]})`;
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k))})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1]})`;
}
