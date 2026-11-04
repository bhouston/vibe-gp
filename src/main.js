import * as THREE from 'three/webgpu';
import { Track } from './track.js';
import { TRACKS } from './tracks/index.js';
import { TrackPath } from './trackPath.js';
import { Car, MIRROR_LAYER } from './car.js';
import { CarPhysics } from './physics.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { LapTimer, formatTime } from './race.js';
import { Hud } from './hud.js';
import { skyNode } from './materials.js';
import { TEAMS, teamById, teamCarSvg, teamGarage } from './teams.js';
import { BoxMarker } from './boxMarker.js';
import { PitStop } from './pitStop.js';
import { PitCrews } from './pitCrew.js';
import { COMPOUND_LIST } from './tyres.js';

const SUN_DIR = [0.45, 0.8, 0.35];

const bestKey = (id) => `vibegp.best.${id}`;
function loadBest(id) {
  try {
    const v = parseFloat(localStorage.getItem(bestKey(id)));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
const TEAM_KEY = 'vibegp.team';
function loadTeam() {
  const fromUrl = new URLSearchParams(location.search).get('team');
  if (TEAMS.some((t) => t.id === fromUrl)) return teamById(fromUrl);
  try {
    return teamById(localStorage.getItem(TEAM_KEY));
  } catch {
    return TEAMS[0];
  }
}

/**
 * Mirror the current team / race track in the query string (?team=…&track=…) so a reload
 * (e.g. Vite HMR after an edit) drops straight back into the same race. `track: null`
 * removes the param, which is what the menu does, so reloading there shows the menu.
 */
function setUrlParams(params) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  if (url.href !== location.href) history.replaceState(history.state, '', url);
}
function saveTeam(id) {
  try {
    localStorage.setItem(TEAM_KEY, id);
  } catch {
    /* storage unavailable: team choice just isn't remembered */
  }
}

function saveBest(id, t) {
  try {
    localStorage.setItem(bestKey(id), String(t));
  } catch {
    /* storage unavailable: best lap just isn't remembered */
  }
}

async function start() {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.getElementById('app').appendChild(renderer.domElement);
  await renderer.init();

  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 (fallback)';
  document.getElementById('backend').textContent = backend;

  const scene = new THREE.Scene();
  scene.backgroundNode = skyNode(SUN_DIR);
  // aerial perspective: exponential haze in the sky's horizon colour, so distant hills
  // and woods fade into the sky (~40% at 1 km, ~85% at 2 km) instead of ending at a line
  scene.fog = new THREE.FogExp2(0xcadfee, 0.0007);
  // Image-based lighting: the prefiltered sky dome is the main light for every surface
  // (diffuse irradiance + glossy reflections). The sun disc is left out of the environment;
  // the directional light below supplies it instead, so it can cast shadows without being
  // counted twice.
  const envScene = new THREE.Scene();
  envScene.backgroundNode = skyNode(SUN_DIR, { sunDisc: false });
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.0, 0.1, 100, { size: 512 }).texture;
  scene.environmentIntensity = 1.0;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 4000);
  camera.layers.enable(MIRROR_LAYER); // mirror glass is only drawn by the main view

  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 300;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const input = new Input();
  const rig = new CameraRig(camera);
  const timer = new LapTimer();
  const hud = new Hud();
  const pitStop = new PitStop();
  const boxMarker = new BoxMarker(); // big green arrow in the pit lane beside the player's box
  scene.add(boxMarker.group);

  let track = null;
  let physics = null;
  let car = null;
  let crews = null;

  // tyre compound for the next stop: keys 1-3 in the race, or click the HUD tyres
  const pickCompound = (c) => {
    pitStop.nextCompound = c;
  };
  hud.onCompound = pickCompound;

  /** Animate the pit crews, then draw the car (on the jacks / wheels off mid stop). */
  function syncCar(dt) {
    crews.update(dt, performance.now() / 1000, pitStop, physics, teamGarage(car.team));
    car.update(physics, dt, crews.lift);
    car.setCompound(crews.carCompound ?? physics.compound);
    crews.wheelOn.forEach((on, i) => car.setWheelVisible(i, on));
  }

  /** Point the pit stop logic and the minimap at the player's team's box on this track. */
  function syncBox() {
    if (!track || !car) return;
    pitStop.setBox(track.path.pit, teamGarage(car.team));
    hud.setBox(pitStop.box);
    boxMarker.setBox(pitStop.box, track.path.pit);
  }

  function setTeam(team) {
    if (car?.team.id === team.id) return;
    if (car) {
      scene.remove(car.group);
      car.dispose();
    }
    car = new Car(team);
    scene.add(car.group);
    if (physics) car.update(physics, 0);
    saveTeam(team.id);
    setUrlParams({ team: team.id });
    hud.setTeam(team);
    syncBox();
  }
  setTeam(loadTeam());

  function loadTrack(def) {
    if (track) {
      scene.remove(track.group, crews.group);
      track.dispose();
      crews.dispose();
    }
    track = new Track(def);
    crews = new PitCrews(track.path.pit);
    scene.add(track.group, crews.group);
    physics = new CarPhysics(track.path, track.path.gridPose(0));
    rig.tvCams = track.tvCams;
    rig.track = track.path;
    rig.initialised = false;
    timer.reset();
    timer.best = loadBest(def.id);
    hud.setTrack(track.path, def);
    syncBox();
  }

  function resetCar() {
    physics.reset(track.path.gridPose(0));
    const best = timer.best;
    timer.reset();
    timer.best = best;
    pitStop.reset();
    rig.initialised = false;
  }

  // ---- team + track selector ----
  const menu = new Menu(TEAMS, TRACKS, car.team, {
    onTeam: setTeam,
    onTrack: (def) => {
      if (!track || track.def.id !== def.id) loadTrack(def);
      else resetCar();
      menu.hide();
      setUrlParams({ team: car.team.id, track: def.id });
    },
  });
  const showMenu = (trackId) => {
    menu.show(trackId);
    setUrlParams({ track: null });
  };
  // ?track=<id> skips the menu and starts that race directly (team comes from ?team=)
  const urlTrack = TRACKS.find((t) => t.id === new URLSearchParams(location.search).get('track'));
  if (urlTrack) {
    loadTrack(urlTrack);
    menu.hide();
  } else {
    showMenu();
    loadTrack(TRACKS[0]); // something to look at behind the menu
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const FIXED = 1 / 120;
  let acc = 0;
  let last = performance.now();
  let orbit = 0;
  let closeUp = 1; // 1 = orbit tight around the car (team row), 0 = wide circuit view

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (menu.visible) {
      menu.handleKeys(input);
      // slow orbit behind the menu: close on the car while picking a team, wide for circuits
      closeUp += ((menu.row === 'team' ? 1 : 0) - closeUp) * Math.min(dt * 2.5, 1);
      orbit += dt * (0.12 + closeUp * 0.18);
      const s = track.path.poseAt(0);
      const p = physics.position;
      const cx = s.x + (p.x - s.x) * closeUp, cz = s.z + (p.z - s.z) * closeUp;
      const cy = s.y + (physics.height - s.y) * closeUp;
      const r = 60 + (7 - 60) * closeUp, h = 22 + (2.2 - 22) * closeUp;
      camera.position.set(cx + Math.cos(orbit) * r, cy + h, cz + Math.sin(orbit) * r);
      camera.lookAt(cx, cy + 0.5 * closeUp, cz);
      syncCar(0);
    } else {
      if (input.hit('Escape')) showMenu(track.def.id);
      if (input.hit('KeyC')) rig.next();
      if (input.hit('KeyR')) resetCar();
      COMPOUND_LIST.forEach((c, i) => input.hit(`Digit${i + 1}`) && pickCompound(c));

      acc += dt;
      const controls = input.state;
      while (acc >= FIXED) {
        physics.step(pitStop.update(physics, controls, FIXED), FIXED);
        if (pitStop.released) timer.flash = { text: `PIT STOP ${pitStop.lastStop.toFixed(1)} s`, until: timer.time + 2.5 };
        const prevBest = timer.best;
        timer.update(physics.trackS, track.path.length, FIXED);
        if (timer.best !== prevBest && timer.best !== null) {
          saveBest(track.def.id, timer.best);
          menu.refreshBest(track.def.id);
        }
        acc -= FIXED;
      }
      syncCar(dt);
      rig.update(physics, dt, car);
    }
    input.endFrame();

    // keep the shadow frustum centred on the car
    const p = physics.position;
    const py = physics.height;
    sun.position.set(p.x + SUN_DIR[0] * 100, py + SUN_DIR[1] * 100, p.z + SUN_DIR[2] * 100);
    sun.target.position.set(p.x, py, p.z);

    boxMarker.update(dt, pitStop, !menu.visible);
    hud.update(physics, timer, rig.mode, pitStop);
    if (import.meta.env.DEV) {
      window.__game = { physics, timer, track, pitStop, crews, loadTrack, TRACKS, menu, car, setTeam, TEAMS, scene, sun };
      // automated screenshots can pin the camera: window.__fixedCam = { x, y, z, tx, ty, tz }
      const fc = window.__fixedCam;
      if (fc) {
        camera.position.set(fc.x, fc.y, fc.z);
        camera.lookAt(fc.tx, fc.ty, fc.tz);
      }
    }
    renderer.render(scene, camera);
    // mirrors show up next frame; skip them when the view is too far away to see them.
    // The shadow map was just drawn for this frame, so reuse it instead of redrawing per mirror.
    if (camera.position.distanceTo(car.group.position) < 40) {
      sun.shadow.autoUpdate = false;
      car.renderMirrors(renderer, scene);
      sun.shadow.autoUpdate = true;
    }
  });
}

/** Full-screen menu: a row of team cards above a row of circuit cards. */
class Menu {
  constructor(teams, tracks, team, { onTeam, onTrack }) {
    this.teams = teams;
    this.tracks = tracks;
    this.onTeam = onTeam;
    this.onTrack = onTrack;
    this.el = document.getElementById('menu');
    this.rows = {
      team: document.getElementById('menu-teams'),
      track: document.getElementById('menu-tracks'),
    };
    this.row = 'team';
    this.index = { team: 0, track: 0 };

    this.teamCards = teams.map((t, i) => {
      const card = document.createElement('button');
      card.className = 'team-card';
      // card highlight uses the team's most legible colour on a dark background
      card.style.setProperty('--c1', t.id === 'redbull' ? t.ui.secondary : t.ui.primary);
      card.style.setProperty('--c3', t.ui.accent);
      card.innerHTML = `
        ${teamCarSvg(t)}
        <div class="team-name track-name">${t.name}</div>
        <div class="track-meta">${t.car} · #${t.number}</div>
        <div class="team-swatches">${[t.ui.primary, t.ui.secondary, t.ui.accent]
          .map((c) => `<i style="background:${c}"></i>`).join('')}</div>`;
      card.addEventListener('click', () => this.pickTeam(i));
      card.addEventListener('mouseenter', () => this.focus('team', i));
      this.rows.team.appendChild(card);
      return card;
    });

    this.trackCards = tracks.map((def, i) => {
      const path = new TrackPath(def);
      const b = path.bounds();
      const pad = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.08;
      const vb = `${b.minX - pad} ${b.minZ - pad} ${b.maxX - b.minX + pad * 2} ${b.maxZ - b.minZ + pad * 2}`;
      const sw = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 45;
      const start = path.poseAt(0);
      const card = document.createElement('button');
      card.className = 'track-card';
      card.innerHTML = `
        <svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet">
          <path d="${path.svgPath(3)}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"/>
          <circle cx="${start.x}" cy="${start.z}" r="${sw * 1.1}" fill="#e10600"/>
        </svg>
        <div class="track-name">${def.name}</div>
        <div class="track-meta">${def.country} · ${(path.length / 1000).toFixed(3)} km${path.elevationRange >= 1 ? ` · ${path.elevationRange.toFixed(0)} m elevation change` : ''}</div>
        <div class="track-best">Best <span>${formatTime(loadBest(def.id))}</span></div>`;
      card.addEventListener('click', () => this.onTrack(def));
      card.addEventListener('mouseenter', () => this.focus('track', i));
      this.rows.track.appendChild(card);
      return card;
    });

    this.selectedTeam = Math.max(0, teams.findIndex((t) => t.id === team.id));
    this.focus('track', 0);
    this.focus('team', this.selectedTeam);
    this.markTeam();
  }

  get visible() {
    return !this.el.hidden;
  }

  cardsOf(row) {
    return row === 'team' ? this.teamCards : this.trackCards;
  }

  show(currentId) {
    const i = this.tracks.findIndex((t) => t.id === currentId);
    if (i >= 0) this.focus('track', i);
    this.focus('team', this.selectedTeam);
    this.el.hidden = false;
    document.getElementById('hud').classList.add('menu-open');
  }

  hide() {
    this.el.hidden = true;
    document.getElementById('hud').classList.remove('menu-open');
  }

  focus(row, i) {
    this.row = row;
    const cards = this.cardsOf(row);
    this.index[row] = (i + cards.length) % cards.length;
    cards.forEach((c, k) => c.classList.toggle('focused', k === this.index[row]));
    cards[this.index[row]].scrollIntoView?.({ block: 'nearest' }); // the circuit list can be longer than the screen
    for (const [name, el] of Object.entries(this.rows)) el.classList.toggle('active', name === row);
  }

  pickTeam(i) {
    this.selectedTeam = (i + this.teams.length) % this.teams.length;
    this.focus('team', this.selectedTeam);
    this.markTeam();
    this.onTeam(this.teams[this.selectedTeam]);
  }

  markTeam() {
    this.teamCards.forEach((c, k) => c.classList.toggle('selected', k === this.selectedTeam));
  }

  refreshBest(id) {
    const i = this.tracks.findIndex((t) => t.id === id);
    if (i >= 0) this.trackCards[i].querySelector('.track-best span').textContent = formatTime(loadBest(id));
  }

  handleKeys(input) {
    if (input.hit('ArrowDown') || input.hit('KeyS')) this.focus('track', this.index.track);
    if (input.hit('ArrowUp') || input.hit('KeyW')) this.focus('team', this.index.team);
    const onTeams = this.row === 'team';
    const step = (input.hit('ArrowRight') || input.hit('KeyD') ? 1 : 0) - (input.hit('ArrowLeft') || input.hit('KeyA') ? 1 : 0);
    if (step) {
      if (onTeams) this.pickTeam(this.index.team + step);
      else this.focus('track', this.index.track + step);
    }
    const n = this.cardsOf(this.row).length;
    for (let k = 0; k < n && k < 9; k++) {
      if (!input.hit(`Digit${k + 1}`)) continue;
      if (onTeams) this.pickTeam(k);
      else this.focus('track', k);
    }
    if (input.hit('Enter') || input.hit('Space')) {
      if (onTeams) this.focus('track', this.index.track); // team confirmed: move on to circuits
      else this.onTrack(this.tracks[this.index.track]);
    }
  }
}

start().catch((err) => {
  console.error(err);
  document.getElementById('error').textContent = `Failed to start: ${err.message}`;
});
