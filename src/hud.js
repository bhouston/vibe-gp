// DOM-based heads-up display.
import { formatTime } from './race.js';
import { COMPOUND_LIST, TYRE } from './tyres.js';

/** Pirelli-style tyre badge: black tyre, compound-coloured ring and letter. */
function compoundIcon(c) {
  return `<svg viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="18" fill="#141518"/>
    <circle cx="20" cy="20" r="13" fill="none" stroke="${c.css}" stroke-width="3.2"/>
    <text x="20" y="21" text-anchor="middle" dominant-baseline="middle" fill="${c.css}" font-size="13" font-weight="900" font-style="italic">${c.letter}</text>
  </svg>`;
}

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
    };
    this.onCompound = null; // set by main: (compound) => void
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

  update(car, timer, camMode, pitStop = null) {
    const e = this.el;
    if (this.mapCar) {
      this.mapCar.setAttribute('cx', car.position.x.toFixed(1));
      this.mapCar.setAttribute('cy', car.position.z.toFixed(1));
    }
    e.speed.textContent = Math.round(Math.abs(car.speed) * 3.6);
    e.gear.textContent = car.gear;
    e.rpm.style.width = `${(car.rpm * 100).toFixed(1)}%`;
    e.rpm.classList.toggle('redline', car.rpm > 0.93);
    e.lap.textContent = timer.lap === 0 ? 'OUT' : timer.lap;
    e.current.textContent = formatTime(timer.current);
    e.last.textContent = formatTime(timer.last);
    e.best.textContent = formatTime(timer.best);
    e.cam.textContent = camMode.toUpperCase();
    const dirt = car.wheels.reduce((a, w) => a + w.dirt, 0) / 4;
    e.surface.textContent = pitText(pitStop, car) ?? (car.inPitLane ? 'PIT LIMITER 80' : car.onPitLane ? 'PIT LANE' : car.surface === 'grass' ? 'OFF TRACK' : dirt > 0.15 ? 'DIRTY TYRES' : '');
    const next = pitStop?.state === 'service' ? pitStop.fitting : pitStop?.nextCompound;
    for (const { c, b } of this.compoundButtons) b.classList.toggle('selected', c === next);
    const comp = car.compound;
    const wear = car.wheels.reduce((a, w) => Math.max(a, w.wear), 0);
    const fitted = `<i style="color:${comp.css}">${comp.letter}</i> ${Math.round((1 - wear) * 100)}%`;
    if (fitted !== this.lastFitted) e.fitted.innerHTML = this.lastFitted = fitted;
    car.wheels.forEach((w, i) => {
      const el = e.tyres[i];
      el.textContent = Math.round(w.temp);
      // colour by the compound's own window: softs are happy cooler than hards
      el.style.background = tyreColor(w.temp + TYRE.tOpt - comp.tOpt);
      el.classList.toggle('slide', w.slide > 1.05);
      el.classList.toggle('kerb', w.surface.name === 'kerb');
      el.classList.toggle('grass', w.surface.name === 'grass');
    });
    e.tc.classList.toggle('on', car.tc);
    e.tc.classList.toggle('active', car.tc && car.tcActive);
    e.abs.classList.toggle('on', car.abs);
    e.abs.classList.toggle('active', car.abs && car.absActive);
    const f = timer.flash;
    if (f && timer.time < f.until) {
      e.flash.textContent = f.text;
      e.flash.classList.add('show');
      e.flash.classList.toggle('best', !!f.best);
    } else e.flash.classList.remove('show');
  }
}

/** Pit box guidance while the player's box is ahead, on the marks or being serviced. */
function pitText(p, car) {
  if (!p) return null;
  switch (p.state) {
    case 'approach': return `${car.inPitLane ? 'PIT LIMITER 80' : 'PIT LANE'} · YOUR BOX ${Math.round(p.distance)} M`;
    case 'inBox': return 'IN THE BOX · STOP';
    case 'service': return `PIT STOP ${p.elapsed.toFixed(1)} s · ${p.fitting.name}S`;
    default: return null;
  }
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
