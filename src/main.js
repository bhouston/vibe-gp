import * as THREE from 'three/webgpu';
import { Track } from './track.js';
import { TRACKS } from './tracks/index.js';
import { Car, MIRROR_LAYER, PARKED } from './car.js';
import { CarPhysics } from './physics.js';
import { Input } from './input.js';
import { bindTouch } from './touch.js';
import { MOBILE } from './quality.js';
import { CameraRig } from './camera.js';
import { LapTimer, StartLights, formatTime } from './race.js';
import { Hud } from './hud.js';
import { Settings } from './settings.js';
import { skyNode, nightSkyNode } from './materials.js';
import { setFloodMask, nightU, FloodlightPool } from './night.js';
import { setLandMaps } from './land.js';
import { LoadingBar, nextFrame } from './loading.js';
import { CARDS } from './tracks/cards.js';
import { TEAMS, teamById, teamLogoCanvas, teamGarage } from './teams.js';
import { BoxMarker } from './boxMarker.js';
import { PitStop } from './pitStop.js';
import { PitCrews } from './pitCrew.js';
import { COMPOUND_LIST } from './tyres.js';
import { DAMAGE } from './damage.js';
import { Sound } from './sound.js';

const SUN_DIR = [0.45, 0.8, 0.35];
// Night races: the key light is the floodlights, nearly overhead (short shadows under the
// car, the way an evenly floodlit circuit looks), and a moon low in the sky.
const FLOOD_DIR = [0.12, 1, 0.18];
const MOON_DIR = [-0.5, 0.35, -0.6];

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
  // Image-based lighting: the prefiltered sky dome is the main light for every surface
  // (diffuse irradiance + glossy reflections). The sun disc is left out of the environment;
  // the directional light below supplies it instead, so it can cast shadows without being
  // counted twice. One environment for day races and one for night races.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envOf = (node) => {
    const envScene = new THREE.Scene();
    envScene.backgroundNode = node;
    return pmrem.fromScene(envScene, 0.0, 0.1, 100, { size: 512 }).texture;
  };
  const ATMOSPHERE = {
    day: {
      sky: skyNode(SUN_DIR),
      env: envOf(skyNode(SUN_DIR, { sunDisc: false })),
      envIntensity: 1.0,
      // aerial perspective: exponential haze in the sky's horizon colour, so distant hills
      // and woods fade into the sky (~40% at 1 km, ~85% at 2 km) instead of ending at a line
      fog: [0xcadfee, 0.0007],
      key: { dir: SUN_DIR, color: 0xfff2dd, intensity: 2.2 },
      exposure: 1.0,
    },
    night: {
      sky: nightSkyNode(MOON_DIR),
      env: envOf(nightSkyNode(MOON_DIR, { stars: false })),
      envIntensity: 1.0,
      // dark haze: the unlit land beyond the floodlights melts into the night
      fog: [0x0a0d15, 0.0008],
      key: { dir: FLOOD_DIR, color: 0xf4f6ff, intensity: 1.8 },
      exposure: 1.05,
    },
  };
  pmrem.dispose();
  scene.fog = new THREE.FogExp2(0xcadfee, 0.0007);

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
  let keyDir = SUN_DIR;
  // point lights at the floodlight towers nearest the camera (night races only)
  const floods = new FloodlightPool();
  scene.add(floods.group);

  function setAtmosphere(night) {
    const a = night ? ATMOSPHERE.night : ATMOSPHERE.day;
    scene.backgroundNode = a.sky;
    scene.environment = a.env;
    scene.environmentIntensity = a.envIntensity;
    scene.fog.color.setHex(a.fog[0]);
    scene.fog.density = a.fog[1];
    sun.color.setHex(a.key.color);
    sun.intensity = a.key.intensity;
    keyDir = a.key.dir;
    renderer.toneMappingExposure = a.exposure;
    nightU.value = night ? 1 : 0;
  }

  const input = new Input();
  bindTouch(input);
  const rig = new CameraRig(camera);
  const timer = new LapTimer();
  const startLights = new StartLights();
  const hud = new Hud();
  const pitStop = new PitStop();
  const boxMarker = new BoxMarker(); // big green arrow in the pit lane beside the player's box
  scene.add(boxMarker.group);

  let track = null;
  let physics = null;
  let car = null;
  let crews = null;
  let showroom = null; // the ground under the car in the menu, until the first track loads

  // tyre compound for the next stop: keys 1-3 in the race, or click the HUD tyres
  const pickCompound = (c) => {
    pitStop.nextCompound = c;
  };
  hud.onCompound = pickCompound;
  // front wing change at the next stop: key F in the race, or click the HUD button
  const toggleWing = () => {
    pitStop.nextWing = !pitStop.nextWing;
  };
  hud.onWing = toggleWing;
  // driver aids, collision damage and sound: toggled in the settings panel (gear, top right)
  const settings = new Settings();
  const sound = new Sound();
  sound.setMusic(settings.get('music'));
  sound.setSfx(settings.get('sound'));
  startLights.onStep = (green) => sound.startBeep(green);
  // a phone held upright: the #rotate overlay covers the game (style.css), which waits for it
  const upright = matchMedia('(pointer: coarse) and (orientation: portrait) and (max-width: 600px)');
  sound.setPaused(upright.matches);
  upright.addEventListener('change', (e) => sound.setPaused(e.matches));
  /** Push the saved settings onto the car physics (a new track makes a new CarPhysics). */
  const applySettings = () => {
    physics.tc = settings.get('tc');
    physics.abs = settings.get('abs');
    physics.damageOn = settings.get('damage');
  };
  const SETTING_NAMES = { tc: 'TRACTION CONTROL', abs: 'ABS', damage: 'DAMAGE', music: 'MUSIC', sound: 'SOUND EFFECTS' };
  settings.onChange = (id, on) => {
    if (id === 'music') sound.setMusic(on);
    if (id === 'sound') sound.setSfx(on);
    if (!physics) return;
    applySettings();
    // switching damage off also repairs the car, and clears the bits it left on the track
    if (id === 'damage' && !on) {
      physics.damage.reset();
      car.clearDebris();
    }
    timer.flash = { text: `${SETTING_NAMES[id]} ${on ? 'ON' : 'OFF'}`, until: timer.time + 1.5 };
  };

  /** Animate the pit crews, then draw the car (on the jacks / wheels off mid stop). */
  function syncCar(dt) {
    crews.update(dt, performance.now() / 1000, pitStop, physics, teamGarage(car.team));
    car.update(physics, dt, crews.lift);
    car.setWing(physics.damage, crews.wingMode, physics);
    car.setDamage(physics.damage, physics, dt);
    car.setWingProps(crews.wingProps);
    car.updateDebris(dt);
    car.setCompound(crews.carCompound ?? physics.compound);
    crews.wheelOn.forEach((on, i) => car.setWheelVisible(i, on));
  }

  /**
   * A big warning for the worst thing a hit broke (physics.damage.events since last
   * time): parts falling off first, then the things that hurt the car most.
   */
  function damageFlash() {
    const dmg = physics.damage;
    const ev = dmg.events;
    if (!ev.length) return;
    const SIDE = ['LEFT', 'RIGHT'], CORNER = ['LEFT-FRONT', 'RIGHT-FRONT', 'LEFT-REAR', 'RIGHT-REAR'];
    const crossed = (part, level) => ev.find((e) => e.part === part && e.before < level && e.level >= level);
    const grew = (part, by) => ev.find((e) => e.part === part && e.level - e.before >= by);
    const rules = [
      () => crossed('wing', DAMAGE.wingBreak) && (dmg.broken(0) && dmg.broken(1) ? 'FRONT WING GONE' : `${SIDE[crossed('wing', DAMAGE.wingBreak).side]} FRONT WING BROKEN`),
      () => crossed('rearWing', DAMAGE.rearWingBreak) && 'REAR WING GONE',
      () => crossed('suspension', 0.6) && `${CORNER[crossed('suspension', 0.6).side]} SUSPENSION BROKEN`,
      () => crossed('engine', 0.5) && 'ENGINE DAMAGE · LOSING POWER',
      () => crossed('tyre', 0.5) && `${CORNER[crossed('tyre', 0.5).side]} TYRE DAMAGED`,
      () => crossed('mirror', 1) && `${SIDE[crossed('mirror', 1).side]} MIRROR GONE`,
      () => crossed('floor', 0.4) && 'FLOOR DAMAGE',
      () => crossed('sidepod', 0.4) && `${SIDE[crossed('sidepod', 0.4).side]} SIDEPOD DAMAGED`,
      () => grew('suspension', 0.15) && 'SUSPENSION DAMAGE',
      () => grew('rearWing', 0.15) && 'REAR WING DAMAGE',
      () => grew('wing', 0.1) && 'FRONT WING DAMAGE',
      () => grew('engine', 0.15) && 'ENGINE DAMAGE',
    ];
    let text = null;
    for (const r of rules) if ((text = r())) break;
    ev.length = 0;
    if (text) timer.flash = { text, until: timer.time + 2.2, warn: true };
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
      scene.remove(car.group, car.debris);
      car.dispose();
    }
    car = new Car(team);
    scene.add(car.group, car.debris);
    car.update(physics ?? PARKED, 0);
    saveTeam(team.id);
    setUrlParams({ team: team.id });
    hud.setTeam(team);
    syncBox();
  }
  setTeam(loadTeam());

  // Track loads build in steps behind the shared loading screen; a newer load supersedes
  // one still in progress. While a load runs, `track` is null and the loop idles.
  const loading = new LoadingBar();
  let loadToken = 0;
  let compiling = false; // a load is compiling shaders: the render loop waits for it
  async function loadTrack(def) {
    const token = ++loadToken;
    compiling = true;
    loading.show(def.name);
    await nextFrame();
    if (track) {
      scene.remove(track.group, crews.group);
      track.dispose();
      crews.dispose();
      track = null;
    }
    const built = await Track.create(def, (f, label) => loading.progress(f * 0.85, label));
    if (token !== loadToken) {
      built.dispose(); // another track was picked meanwhile
      return;
    }
    if (showroom) {
      scene.remove(showroom);
      showroom.geometry.dispose();
      showroom.material.dispose();
      showroom = null;
      document.getElementById('menu').classList.remove('showroom');
    }
    track = built;
    crews = new PitCrews(track.path.pit);
    scene.add(track.group, crews.group);
    setAtmosphere(!!def.night);
    setFloodMask(track.floodMask ?? null);
    setLandMaps(track.land ?? null);
    floods.setHeads(track.floodHeads);
    physics = new CarPhysics(track.path, track.path.gridPose(0));
    applySettings();
    sound.setTrack(def);
    car.clearDebris();
    rig.tvCams = track.tvCams;
    rig.track = track.path;
    rig.initialised = false;
    timer.reset();
    startLights.reset(track.startLamps);
    timer.best = loadBest(def.id);
    hud.setTrack(track.path, def);
    syncBox();
    // compile the new materials' shaders now, behind the loading screen, rather than in a
    // stutter on the first frames. The render loop stays paused (`compiling`) until this is
    // done: a frame drawn meanwhile would create every pipeline synchronously, one at a
    // time, ahead of these asynchronous ones, which the GPU process can build in parallel.
    loading.progress(0.86, 'Compiling shaders');
    await nextFrame();
    try {
      await renderer.compileAsync(scene, camera);
    } catch (e) {
      console.warn('shader precompile failed', e);
    }
    if (token !== loadToken) return;
    // the first frames still build what the precompile can't reach (shadow and mirror
    // passes): let them run behind the loading screen, not as a hitch on the grid
    compiling = false;
    loading.progress(0.97, 'Ready');
    for (let k = 0; k < 3; k++) await nextFrame();
    if (token !== loadToken) return;
    loading.progress(1);
    loading.hide();
  }

  function resetCar() {
    physics.reset(track.path.gridPose(0));
    applySettings(); // reset() puts the aids back to their defaults
    const best = timer.best;
    timer.reset();
    timer.best = best;
    startLights.reset(track.startLamps);
    pitStop.reset();
    car.clearDebris();
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
    // no circuit is built until one is picked: the car alone on a plain ground under the day
    // sky, the ground wide enough for the haze to melt its edge into the horizon
    showroom = new THREE.Mesh(new THREE.CircleGeometry(3000, 64), new THREE.MeshStandardNodeMaterial({ color: 0x5c6066, roughness: 0.9 }));
    showroom.rotation.x = -Math.PI / 2;
    showroom.receiveShadow = true;
    scene.add(showroom);
    setAtmosphere(false);
    sun.position.set(keyDir[0] * 100, keyDir[1] * 100, keyDir[2] * 100);
    document.getElementById('menu').classList.add('showroom');
    showMenu();
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
    if (compiling || upright.matches) return; // loading behind the loading screen, or paused
    if (!track) {
      menu.handleKeys(input);
      input.endFrame();
      orbit += dt * 0.3;
      camera.position.set(Math.cos(orbit) * 9.5, 3, Math.sin(orbit) * 9.5);
      camera.lookAt(0, -3, 0); // below the car: it sits in the gap above the menu cards
      renderer.render(scene, camera);
      return;
    }

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
      if (input.hit('KeyF')) toggleWing();

      acc += dt;
      const controls = input.state;
      while (acc >= FIXED) {
        startLights.update(FIXED);
        const held = pitStop.update(physics, controls, FIXED);
        physics.step(startLights.holding ? { ...held, hold: true } : held, FIXED);
        damageFlash();
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
    sun.position.set(p.x + keyDir[0] * 100, py + keyDir[1] * 100, p.z + keyDir[2] * 100);
    sun.target.position.set(p.x, py, p.z);
    floods.update(camera.position, track?.floodStrength);

    boxMarker.update(dt, pitStop, !menu.visible);
    hud.update(physics, timer, rig.mode, pitStop);
    sound.update(physics, { camera, mode: rig.mode, racing: !menu.visible });
    if (import.meta.env.DEV) {
      window.__game = { physics, timer, startLights, track, pitStop, crews, loadTrack, TRACKS, menu, car, setTeam, TEAMS, scene, sun, floods, renderer, sound };
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
    if (!MOBILE && camera.position.distanceTo(car.group.position) < 40) {
      sun.shadow.autoUpdate = false;
      car.renderMirrors(renderer, scene);
      sun.shadow.autoUpdate = true;
    }
  });
}

/** Full-screen two-step menu: pick a car (team), Next, then pick a circuit and GO. */
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
        <div class="team-name track-name">${t.name}</div>
        <div class="track-meta">${t.car} · #${t.number}</div>
        <div class="team-swatches">${[t.ui.primary, t.ui.secondary, t.ui.accent]
          .map((c) => `<i style="background:${c}"></i>`).join('')}</div>`;
      card.prepend(teamLogoCanvas(t));
      card.addEventListener('click', () => this.pickTeam(i));
      // mouse only: iOS fires hover events on a tap, and a change there can swallow the tap
      card.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && this.focus('team', i));
      this.rows.team.appendChild(card);
      return card;
    });

    this.trackCards = tracks.map((def, i) => {
      const card = document.createElement('button');
      card.className = 'track-card';
      const c = CARDS[def.id]; // src/tracks/cards.js: `pnpm cards` after adding a track
      card.innerHTML = `
        <svg preserveAspectRatio="xMidYMid meet" viewBox="${c?.viewBox ?? ''}">
          <path d="${c?.d ?? ''}" fill="none" stroke="currentColor" stroke-width="${c?.stroke}" stroke-linejoin="round"/>
          ${c ? `<circle cx="${c.start[0]}" cy="${c.start[1]}" r="${c.stroke * 1.1}" fill="#e10600"/>` : ''}
        </svg>
        <div class="track-name">${def.name}${def.night ? ' <span class="night-tag">Night</span>' : ''}</div>
        <div class="track-meta">${def.country}${c ? ` · ${c.km} km` : ''}${c?.elevation ? ` · ${c.elevation} m elevation change` : ''}</div>
        <div class="track-best">Best <span>${formatTime(loadBest(def.id))}</span></div>`;
      card.addEventListener('click', () => this.focus('track', i));
      card.addEventListener('dblclick', () => this.go());
      this.rows.track.appendChild(card);
      return card;
    });

    this.steps = {
      team: document.getElementById('step-team'),
      track: document.getElementById('step-track'),
    };
    document.getElementById('btn-next').addEventListener('click', () => this.setStep('track'));
    document.getElementById('btn-back').addEventListener('click', () => this.setStep('team'));
    document.getElementById('btn-go').addEventListener('click', () => this.go());

    this.selectedTeam = Math.max(0, teams.findIndex((t) => t.id === team.id));
    this.focus('track', 0);
    this.focus('team', this.selectedTeam);
    this.markTeam();
    this.setStep('team');
  }

  /** Show one step of the menu: 'team' (pick a car) or 'track' (pick a circuit, then GO). */
  setStep(step) {
    document.activeElement?.blur?.(); // so Enter/Space don't also re-click the button that was just pressed
    for (const [name, el] of Object.entries(this.steps)) el.hidden = name !== step;
    this.focus(step, step === 'team' ? this.selectedTeam : this.index.track);
    this.el.scrollTop = 0;
  }

  go() {
    this.onTrack(this.tracks[this.index.track]);
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
    this.setStep('team');
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
    // build the car after the highlight has painted, so the tap answers straight away
    nextFrame().then(() => this.onTeam(this.teams[this.selectedTeam]));
  }

  markTeam() {
    this.teamCards.forEach((c, k) => c.classList.toggle('selected', k === this.selectedTeam));
  }

  refreshBest(id) {
    const i = this.tracks.findIndex((t) => t.id === id);
    if (i >= 0) this.trackCards[i].querySelector('.track-best span').textContent = formatTime(loadBest(id));
  }

  handleKeys(input) {
    const onTeams = this.row === 'team';
    if (!onTeams && (input.hit('Backspace') || input.hit('Escape'))) {
      this.setStep('team');
      return;
    }
    const step = (input.hit('ArrowRight') || input.hit('KeyD') || input.hit('ArrowDown') || input.hit('KeyS') ? 1 : 0)
      - (input.hit('ArrowLeft') || input.hit('KeyA') || input.hit('ArrowUp') || input.hit('KeyW') ? 1 : 0);
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
      if (onTeams) this.setStep('track'); // car confirmed: move on to circuits
      else this.go();
    }
  }
}

start().catch((err) => {
  console.error(err);
  document.getElementById('error').textContent = `Failed to start: ${err.message}`;
});
