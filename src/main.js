import * as THREE from 'three/webgpu';
import { Track } from './track.js';
import { TRACKS } from './tracks/index.js';
import { Car, MIRROR_LAYER, PARKED } from './car.js';
import { CarPhysics } from './physics.js';
import { Input } from './input.js';
import { bindTouch } from './touch.js';
import { MOBILE, TOUCH, GRAPHICS, AdaptiveResolution } from './quality.js';
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
import { Race, LEVELS as AI_LEVELS, AIDriver, Entry, racingLine, STYLES } from './ai.js';
import { FreeCam } from './freecam.js';
import { IncidentMonitor } from './incidents.js';
import { Director } from './director.js';
import { PauseMenu } from './pause.js';

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
  // Graphics (Settings): High draws at the screen's resolution (up to 2x); Auto does too but
  // steps the resolution down while the frame rate is low; Low starts at 1x and adapts as well
  const maxRatio = Math.min(devicePixelRatio, GRAPHICS === 'low' ? 1 : 2);
  renderer.setPixelRatio(maxRatio);
  renderer.setSize(innerWidth, innerHeight);
  const adaptive = GRAPHICS === 'high' ? null : new AdaptiveResolution(renderer, maxRatio, GRAPHICS === 'low' ? 0.5 : 0.6);
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
  sun.shadow.mapSize.setScalar(MOBILE ? 1024 : 2048);
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
  const freecam = new FreeCam(camera, renderer.domElement);
  // free cam: a picture-in-picture monitor pops up for crashes, spins and retirements, and
  // replays them (src/incidents.js). The camera joins the scene to carry the monitor's quad.
  scene.add(camera);
  const carOf = (e) => (e.isPlayer ? car : e.car);
  const monitor = new IncidentMonitor(camera, carOf);
  monitor.onPick = (e) => watch(e);
  // M: director mode, the view as a monitor wall: the main view on one car, every car's
  // onboard monitor and the highlights (src/director.js). Click a monitor to switch cars.
  const director = new Director(camera);
  director.onPick = (e) => watch(e);
  /** V: free camera on / off (C also leaves it, back to the view it left). */
  function toggleFree() {
    if (freecam.active) {
      freecam.stop();
      rig.initialised = false;
      timer.flash = { text: `${rig.mode.toUpperCase()} CAMERA`, until: timer.time + 1.2 };
    } else {
      freecam.start();
      timer.flash = { text: 'FREE CAM · WASD FLY · SPACE UP · SHIFT DOWN · DRAG TO LOOK · YOUR CAR DRIVES ITSELF', until: timer.time + 4 };
    }
  }
  // free cam: the driving keys fly the camera, so the player's car drives itself on the AI's
  // line (a race's, or one worked out for the circuit the first time it's needed)
  let autopilot = null;
  let soloLine = null;
  function autopilotStep(dt) {
    if (!autopilot || autopilot.race !== race || autopilot.physics !== physics || autopilot.path !== track.path) {
      if (!race && soloLine?.path !== track.path) soloLine = { path: track.path, line: racingLine(track.path) };
      const entry = race?.player ?? new Entry({ team: car.team, physics, isPlayer: true });
      autopilot = {
        race, physics, path: track.path, field: race?.entries ?? [entry],
        driver: new AIDriver(entry, race?.line ?? soloLine.line, { pace: 0.9, reaction: 0, seed: 4242, style: { ...STYLES.smooth, mistakes: 0 } }),
      };
    }
    return autopilot.driver.drive(autopilot.field, race ? race.sinceGreen : startLights.holding ? 0 : 99, dt);
  }

  // ---- watching another car: in free cam, click it in the timing tower. The camera views
  // (C) ride on that car instead, [ and ] step to the car ahead / behind, G takes the wheel
  // (your own car drives itself meanwhile) and V goes back to free cam ----
  let watching = null; // the race entry being watched (an AI car), or null
  let driving = false; // the player is driving the watched car
  let aidsKept = null; // the watched car's own assists, while the player drives it with theirs
  function takeWheel(on) {
    if (!watching || on === driving) return;
    const p = watching.physics;
    if (on) {
      if (watching.retired || watching.finished) {
        timer.flash = { text: `${watching.team.name.toUpperCase()} IS ${watching.retired ? 'OUT' : 'FINISHED'}`, until: timer.time + 1.5, warn: true };
        return;
      }
      aidsKept = { tc: p.tc, abs: p.abs };
      p.tc = settings.get('tc');
      p.abs = settings.get('abs');
    } else {
      Object.assign(p, aidsKept);
      watching.driver.resume(); // its AI carries on from here
    }
    driving = on;
    timer.flash = on
      ? { text: `YOU'RE DRIVING THE ${watching.team.name.toUpperCase()} · G HANDS IT BACK`, until: timer.time + 3 }
      : { text: `${watching.team.name.toUpperCase()} BACK TO ITS DRIVER`, until: timer.time + 1.5 };
  }
  /** Watch race entry e (null or the player's own entry: back to your car). */
  function watch(e) {
    if (e === watching) return;
    takeWheel(false);
    watching?.car.setDriverView(false);
    rig.initialised = false;
    if (!e || e.isPlayer) {
      watching = hud.watching = null;
      if (e) timer.flash = { text: 'BACK TO YOUR CAR', until: timer.time + 1.5 };
      return;
    }
    watching = hud.watching = e;
    freecam.stop();
    timer.flash = { text: `WATCHING ${e.team.name.toUpperCase()} · G TO DRIVE IT`, until: timer.time + 3 };
  }
  /** [ / ]: watch the car one place ahead (-1) or behind (+1) of the one being watched. */
  function watchNext(step) {
    const order = race.order.filter((e) => !e.retired);
    const i = order.indexOf(watching);
    const next = order[(i + step + order.length) % order.length];
    watch(next.isPlayer ? order[(i + 2 * step + order.length) % order.length] : next);
  }
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
  let race = null; // AI opponents (src/ai.js), or null for a solo run

  // tyre compound for the next stop: keys 1-3 in the race, or click the HUD tyres
  const pickCompound = (c) => {
    (driving ? watching.pitStop : pitStop).nextCompound = c;
  };
  hud.onCompound = pickCompound;
  // a car clicked in the timing tower: watch it (from free cam, or another one already watched)
  hud.onPick = (e) => {
    if (freecam.active || watching || director.on) watch(e);
    else timer.flash = { text: 'PRESS V FOR FREE CAM, THEN CLICK A CAR TO WATCH IT', until: timer.time + 2.5 };
  };
  // front wing change at the next stop: key F in the race, or click the HUD button
  const toggleWing = () => {
    const p = driving ? watching.pitStop : pitStop;
    p.nextWing = !p.nextWing;
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
  upright.addEventListener('change', (e) => sound.setPaused(e.matches || paused));
  /** Push the saved settings onto the car physics (a new track makes a new CarPhysics). */
  const applySettings = () => {
    physics.tc = settings.get('tc');
    physics.abs = settings.get('abs');
    physics.damageOn = settings.get('damage');
  };
  const SETTING_NAMES = { tc: 'TRACTION CONTROL', abs: 'ABS', damage: 'DAMAGE', music: 'MUSIC', sound: 'SOUND EFFECTS', ai: 'AI OPPONENTS', aiLevel: 'AI DIFFICULTY', laps: 'RACE LAPS', noResets: 'NO RESETS', chaos: 'AI CHAOS', graphics: 'GRAPHICS' };
  settings.onChange = (id, on) => {
    if (id === 'music') sound.setMusic(on);
    if (id === 'sound') sound.setSfx(on);
    if (!physics) return;
    applySettings();
    // switching damage off also repairs the car, and clears the bits it left on the track
    if (id === 'damage' && !on) {
      physics.damage.reset();
      car.clearDebris();
      for (const e of race?.ai ?? []) {
        e.physics.damage.reset();
        e.car.clearDebris();
      }
    }
    // a new field (or none) means a fresh start from the grid
    if (id === 'ai' || id === 'aiLevel' || id === 'laps') resetCar();
    if (id === 'chaos') race?.setChaos(raceOptions().chaos); // live, mid-race too
    // the graphics profile is read as the game starts (the scenery is built for it)
    if (id === 'graphics') setTimeout(() => location.reload(), 400);
    const value = on === true ? 'ON' : on === false ? 'OFF' : String(on).toUpperCase();
    timer.flash = { text: `${SETTING_NAMES[id]} ${value}`, until: timer.time + 1.5 };
  };

  // ---- AI opponents: ?ai=<count> (0 = none), ?laps=<n>, ?difficulty=easy|normal|hard|expert,
  // ?chaos=0..100 and ?resets=0 (no-resets mode) override Settings ----
  const query = new URLSearchParams(location.search);
  function raceOptions() {
    const opponents = query.has('ai') ? Math.max(0, Math.min(10, +query.get('ai') || 0)) : settings.get('ai') ? (TOUCH && MOBILE ? 5 : 10) : 0;
    const laps = Math.max(1, +(query.get('laps') ?? settings.get('laps')) || 5);
    const level = query.get('difficulty') ?? settings.get('aiLevel');
    const chaos = Math.max(0, Math.min(100, +(query.get('chaos') ?? settings.get('chaos')) || 0)) / 100;
    return { opponents, laps, level: AI_LEVELS[level] ? level : 'normal', chaos };
  }
  // no-resets mode: crashed AI cars aren't put back on the track (applies at once, mid-race too)
  const aiResets = () => (query.has('resets') ? query.get('resets') !== '0' : !settings.get('noResets'));
  const raceKey = (o) => `${track.def.id}|${car.team.id}|${o.opponents}|${o.laps}|${o.level}`;

  // AI cars by team, kept between races: a car doesn't depend on the track, and building
  // one means building its shaders again (most of the extra load time of a full grid)
  const aiCars = new Map();
  const aiCar = (team) => {
    if (!aiCars.has(team.id)) aiCars.set(team.id, new Car(team, { ai: true }));
    return aiCars.get(team.id);
  };

  /** Build (or clear) the AI field for the current track, team and settings. */
  function buildRace() {
    monitor.reset();
    watch(null);
    for (const e of race?.ai ?? []) {
      scene.remove(e.car.group, e.car.debris);
      e.car.clearDebris();
    }
    race = null;
    const opts = raceOptions();
    if (opts.opponents > 0) {
      race = new Race(track.path, car.team, physics, TEAMS, opts);
      race.key = raceKey(opts);
      race.pitStops = race.ai.filter((e) => e.pitStop.box).map((e) => ({ k: e.pitStop.box.k, pitStop: e.pitStop, car: e.physics }));
      for (const e of race.ai) {
        e.car = aiCar(e.team);
        scene.add(e.car.group, e.car.debris);
      }
      race.onFinish = (e, place) => {
        if (e.isPlayer) timer.flash = { text: place === 1 ? 'YOU WIN!' : `FINISHED P${place}`, until: timer.time + 6, best: place === 1 };
        else if (place === 1 && !race.player.finished) timer.flash = { text: `CHEQUERED FLAG · ${e.team.name.toUpperCase()} WINS`, until: timer.time + 3 };
      };
      race.onRetire = (e) => {
        monitor.retired(e, freecam.active);
        timer.flash = { text: `${e.team.name.toUpperCase()} RETIRES`, until: timer.time + 2.5, warn: true };
      };
    }
    physics.wearScale = race?.wearScale ?? 1; // tyre wear for the race distance; normal alone
    hud.setRace(race);
  }

  /** The player's starting spot: their grid slot in a race, pole when driving alone. */
  const playerGrid = () => (race ? race.playerGrid() : track.path.gridPose(0));

  /** Animate the pit crews, then draw the car (on the jacks / wheels off mid stop). */
  function syncCar(dt) {
    crews.update(dt, performance.now() / 1000, pitStop, physics, teamGarage(car.team), race?.pitStops);
    car.update(physics, dt, crews.lift);
    car.setWing(physics.damage, crews.wingMode, physics);
    car.setDamage(physics.damage, physics, dt);
    car.setWingProps(crews.wingProps);
    car.updateDebris(dt);
    car.setCompound(crews.carCompound ?? physics.compound);
    crews.wheelOn.forEach((on, i) => car.setWheelVisible(i, on));
    for (const e of race?.ai ?? []) {
      const c = e.car, p = e.physics;
      // in its box: on the jacks, wheels coming off and on (its crew's doing)
      const out = e.pitStop.box ? crews.out(e.pitStop.box.k) : null;
      // near the main camera or the incident monitor's live one: full detail
      // (and with the onboard monitors on, near any car: every car is a camera then)
      const mc = monitor.liveCam;
      let dist = Math.hypot(p.position.x - camera.position.x, p.position.z - camera.position.z);
      if (mc) dist = Math.min(dist, Math.hypot(p.position.x - mc.position.x, p.position.z - mc.position.z));
      for (const v of director.viewpoints ?? []) if (v !== p.position) dist = Math.min(dist, Math.hypot(p.position.x - v.x, p.position.z - v.z));
      c.setLod(dist);
      c.update(p, dt, out?.lift ?? 0);
      c.setWing(p.damage, 'car', p);
      c.setDamage(p.damage, p, dt);
      c.updateDebris(dt);
      c.setCompound(out?.compound ?? p.compound);
      for (let i = 0; i < 4; i++) c.setWheelVisible(i, out ? out.wheelOn[i] : true);
    }
  }

  /**
   * The pit wall on the radio as the tyres wear: once when they start to go off, and again
   * at the cliff (see wearGrip in tyres.js), when it's time to box.
   */
  let tyreCalled = 0;
  function tyreCall() {
    const wear = physics.wheels.reduce((a, w) => Math.max(a, w.wear), 0);
    if (wear < 0.5) tyreCalled = 0; // a new set
    const call = wear >= 0.72 ? 2 : wear >= 0.6 ? 1 : 0;
    if (call <= tyreCalled) return;
    tyreCalled = call;
    if (!track.path.pit) return;
    timer.flash = call === 2
      ? { text: `TYRES ARE GONE · ${Math.round((1 - wear) * 100)}% LEFT · BOX, BOX`, until: timer.time + 3, warn: true }
      : { text: `TYRES GOING OFF · ${Math.round((1 - wear) * 100)}% LEFT · PIT SOON`, until: timer.time + 2.5 };
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
    setPaused(false);
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
    buildRace();
    physics.reset(playerGrid());
    applySettings();
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
    monitor.reset();
    watch(null);
    // a different team, field size, length or difficulty needs a new field
    if ((race?.key ?? null) !== (raceOptions().opponents > 0 ? raceKey(raceOptions()) : null)) buildRace();
    else race?.reset();
    for (const e of race?.ai ?? []) e.car.clearDebris();
    physics.reset(playerGrid());
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
    setPaused(false);
    menu.show(trackId);
    setUrlParams({ track: null });
  };

  // ---- pause: Esc / P in a race (MENU on touch screens), or the window losing focus ----
  let paused = false;
  const pauseMenu = new PauseMenu({
    resume: () => setPaused(false),
    restart: () => {
      setPaused(false);
      resetCar();
    },
    settings: () => settings.toggle(true),
    quit: () => showMenu(track.def.id),
  });
  /** Freeze (or unfreeze) the race: no simulation, camera or sound while paused. */
  function setPaused(on) {
    if (paused === on) return;
    if (on && (!track || menu.visible || compiling)) return; // only a race in progress pauses
    paused = on;
    if (on) pauseMenu.show(pauseInfo());
    else {
      pauseMenu.hide();
      settings.toggle(false);
      acc = 0; // pick up where it left off, not with the time spent paused
    }
    sound.setPaused(on || upright.matches);
  }
  /** One line about the race so far, for the pause menu. */
  function pauseInfo() {
    const where = track.def.name;
    if (race) {
      const me = race.player;
      const lap = me.finished ? 'Finished' : me.lap === 0 ? 'Out lap' : `Lap ${Math.min(me.lap, race.laps)} of ${race.laps}`;
      return `${where} · ${lap} · P${me.position} of ${race.entries.length}`;
    }
    return `${where} · ${timer.lap === 0 ? 'Out lap' : `Lap ${timer.lap}`} · Best ${formatTime(timer.best)}`;
  }
  // switching tab or window mid-race pauses it
  addEventListener('blur', () => setPaused(true));
  document.addEventListener('visibilitychange', () => document.hidden && setPaused(true));
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
      monitor.hide();
      menu.handleKeys(input);
      if (freecam.active) freecam.stop();
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
    } else if (paused) {
      pauseMenu.handleKeys(input); // the race stays frozen; the cars hold their poses
      syncCar(0);
    } else {
      if (input.hit('Escape') || input.hit('KeyP')) setPaused(true);
      if (input.hit('KeyV')) {
        if (watching) {
          watch(null); // free cam again, from where the camera is now
          toggleFree();
        } else toggleFree();
      }
      if (input.hit('KeyC')) {
        if (freecam.active) toggleFree();
        else rig.next();
      }
      if (watching && input.hit('KeyG')) takeWheel(!driving);
      if (watching && input.hit('BracketLeft')) watchNext(-1);
      if (watching && input.hit('BracketRight')) watchNext(1);
      if (input.hit('KeyR')) {
        if (driving) watching.driver.respawn(race.entries); // the car you're driving, back on the line
        else resetCar();
      }
      COMPOUND_LIST.forEach((c, i) => input.hit(`Digit${i + 1}`) && pickCompound(c));
      if (input.hit('KeyF')) toggleWing();
      if (input.hit('KeyM')) {
        if (!race) timer.flash = { text: 'DIRECTOR MODE NEEDS AI OPPONENTS', until: timer.time + 2, warn: true };
        else {
          director.toggle();
          if (director.on) {
            // the main view on a car: the one being watched, or the leader
            freecam.stop();
            if (!watching) watch(race.order[0]);
            rig.initialised = false;
            timer.flash = { text: 'DIRECTOR MODE · CLICK A MONITOR TO SWITCH CARS · C VIEWS', until: timer.time + 3 };
          } else {
            watch(null);
            timer.flash = { text: 'DIRECTOR MODE OFF', until: timer.time + 1.5 };
          }
        }
      }
      if (input.hit('KeyB') && freecam.active && !monitor.replayLast(true)) {
        timer.flash = { text: 'NO CRASH TO REPLAY YET', until: timer.time + 1.5 };
      }

      acc += dt;
      const controls = input.state;
      while (acc >= FIXED) {
        startLights.update(FIXED);
        // your car drives itself while you watch (free cam, another car, director mode)
        const own = freecam.active || watching || director.on ? autopilotStep(FIXED) : controls;
        const held = pitStop.update(physics, own, FIXED);
        physics.step(startLights.holding ? { ...held, hold: true } : held, FIXED);
        damageFlash();
        if (pitStop.released) {
          timer.flash = { text: `PIT STOP ${pitStop.lastStop.toFixed(1)} s`, until: timer.time + 2.5 };
          if (race) race.player.stops++;
        }
        if (!watching) tyreCall();
        const prevBest = timer.best;
        timer.update(physics.trackS, track.path.length, FIXED);
        if (timer.best !== prevBest && timer.best !== null) {
          saveBest(track.def.id, timer.best);
          menu.refreshBest(track.def.id);
        }
        // the AI cars, then car-to-car contact (after the timer, so a finish flash wins)
        race?.stepAI(startLights.holding, FIXED, { damage: settings.get('damage'), resets: aiResets(), takeover: driving ? watching : null, controls });
        acc -= FIXED;
      }
      syncCar(dt);
      monitor.inGame = freecam.active || director.on;
      monitor.update(race?.entries, dt, monitor.inGame, watching ? watching.physics : physics);
      if (freecam.active) freecam.update(input, dt);
      else if (watching) rig.update(watching.physics, dt, watching.car);
      else rig.update(physics, dt, car);
    }
    if (menu.visible && watching) watch(null);
    const camMode = freecam.active ? 'free' : rig.mode;
    // the car the camera, HUD and sound follow: yours, or the one being watched
    const view = watching ?? race?.player;
    const viewed = watching ? watching.physics : physics;
    // driver view: hide the helmet the eye sits in and run the steering wheel's display
    const driverView = !menu.visible && camMode === 'driver';
    if (driverView && watching) watching.car.ensureWheel();
    (watching?.car ?? car).setDriverView(driverView, driverView && {
      car: viewed,
      dt: paused ? 0 : dt,
      info: view ? { position: view.position, cars: race.entries.length, lap: view.lap, laps: race.laps } : { lap: timer.lap },
    });
    if (watching) car.setDriverView(false);
    input.endFrame();

    // keep the shadow frustum centred on the car
    const p = viewed.position;
    const py = viewed.height;
    sun.position.set(p.x + keyDir[0] * 100, py + keyDir[1] * 100, p.z + keyDir[2] * 100);
    sun.target.position.set(p.x, py, p.z);
    floods.update(camera.position, track?.floodStrength);

    boxMarker.update(dt, pitStop, !menu.visible && !driving);
    const label = watching ? `${camMode} · ${watching.team.name}${driving ? ' · YOU' : ''}` : camMode;
    hud.update(viewed, timer, label, driving ? watching.pitStop : watching ? null : pitStop);
    hud.updateRace(now / 1000);
    sound.update(viewed, { camera, mode: camMode, racing: !menu.visible && !paused });
    if (import.meta.env.DEV) {
      window.__game = { rig, freecam, monitor, race, physics, timer, startLights, track, pitStop, crews, loadTrack, TRACKS, menu, car, setTeam, TEAMS, scene, sun, floods, renderer, sound };
      // automated screenshots can pin the camera: window.__fixedCam = { x, y, z, tx, ty, tz }
      const fc = window.__fixedCam;
      if (fc) {
        camera.position.set(fc.x, fc.y, fc.z);
        camera.lookAt(fc.tx, fc.ty, fc.tz);
      }
    }
    // the incident monitor's and director mode's pictures first (reusing last frame's shadow
    // map), then the view
    if (menu.visible && director.on) director.toggle(false);
    director.update(race, now / 1000, watching ?? race?.player, freecam.active ? 'free cam' : rig.mode);
    if (monitor.shown || director.on) {
      sun.shadow.autoUpdate = false;
      monitor.render(renderer, scene, race ? race.entries.map(carOf) : [car], paused || menu.visible ? 0 : dt);
      director.render(renderer, scene, carOf);
      sun.shadow.autoUpdate = true;
    }
    adaptive?.update(paused || menu.visible ? 0 : dt);
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
