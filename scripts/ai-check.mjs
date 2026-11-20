// Headless AI race: every car (the "player" too) driven by the AI on the real physics.
//
//   node scripts/ai-check.mjs <trackId> [laps] [opponents] [level: easy|normal|hard|expert]
//   NORESETS=1 node scripts/ai-check.mjs ...   (no-resets mode: stuck cars recover or retire)
//   CHAOS=0..1 node scripts/ai-check.mjs ...    (the AI chaos setting; default 0.4)
//
// Prints each car's best lap, finishing order, wall contacts, off-track time, respawns and
// its tyres: the compound of each stint (S-M: started on softs, one stop for mediums).
// logos.js builds Path2D objects at import time (browser only): stub it for Node
globalThis.location ??= { search: "" };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
globalThis.Path2D ??= class { constructor() {} addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} arc() {} ellipse() {} rect() {} closePath() {} };
const { TRACKS } = await import('../src/tracks/index.js');
const { TrackPath } = await import('../src/trackPath.js');
const { CarPhysics } = await import('../src/physics.js');
const { TEAMS } = await import('../src/teams.js');
const { Race, AIDriver, teamPace, CONTACTS } = await import('../src/ai.js');
const { formatTime } = await import('../src/race.js');

const id = process.argv[2] || 'suzuka';
const laps = +(process.argv[3] || 3);
const opponents = +(process.argv[4] ?? 10);
const level = process.argv[5] ?? 'normal';
const def = TRACKS.find((t) => t.id === id);
const P = new TrackPath(def);
const playerTeam = TEAMS[TEAMS.length - 1];
const player = new CarPhysics(P, P.gridPose(0));
const t0 = performance.now();
const race = new Race(P, playerTeam, player, TEAMS, { opponents, laps, level, seed: +(process.env.SEED ?? 1), chaos: +(process.env.CHAOS ?? 0.4) });
console.log(`racing line built in ${(performance.now() - t0).toFixed(0)} ms; ${race.entries.length} cars, ${laps} laps of ${def.name} (${P.length.toFixed(0)} m)`);
player.reset(race.playerGrid());
race.player.driver = new AIDriver(race.player, race.line, { pace: teamPace(TEAMS.length - 1, level), seed: 99 });

const stats = new Map(race.entries.map((e) => [e, { wall: 0, off: 0, respawn: 0, lapStart: null, best: Infinity, lastLap: 0 }]));
const origRespawn = AIDriver.prototype.respawn;
AIDriver.prototype.respawn = function (field) {
  stats.get(this.entry).respawn++;
  return origRespawn.call(this, field);
};
const stints = new Map(race.entries.map((e) => [e, [e.physics.compound.letter]]));
race.onPit = (e) => stints.get(e).push(`${e.physics.compound.letter}@${(e.progress / P.length).toFixed(1)}`);
console.log(`tyre wear x${race.wearScale.toFixed(2)} for the race distance`);
const dt = 1 / 120;
let hold = 3.6;
const tSim = performance.now();
let frames = 0;
while (race.finishOrder.length < race.entries.filter((e) => !e.retired).length && race.time < 60 * 20) {
  const holding = hold > 0;
  hold -= dt;
  const ctl = race.player.driver.drive(race.entries, holding ? 0 : race.sinceGreen, dt);
  player.step(holding ? { ...ctl, hold: true } : ctl, dt);
  race.stepAI(holding, dt, { resets: !process.env.NORESETS });
  frames++;
  for (const e of race.entries) {
    const s = stats.get(e);
    if (e.physics.wallHit > 0.05) s.wall++;
    if (['grass', 'gravel', 'runoff'].includes(e.physics.surface)) s.off++;
    if (e.lap !== s.lastLap && e.lap >= 1) {
      if (s.lapStart !== null && !e.finished) s.best = Math.min(s.best, race.time - s.lapStart);
      if (s.lapStart !== null && e.finished && s.lastLap < e.lap) s.best = Math.min(s.best, race.time - s.lapStart);
      s.lapStart = race.time;
      s.lastLap = e.lap;
    }
  }
}
const ms = performance.now() - tSim;
console.log(`car-to-car contacts: ${CONTACTS.touches} (hard, > 5 m/s: ${CONTACTS.hard})`);
console.log(`simulated ${(race.time).toFixed(0)} s in ${(ms / 1000).toFixed(1)} s (${((ms / frames) * 1000 / race.entries.length).toFixed(0)} µs per car-step)`);
for (const e of race.order) {
  const s = stats.get(e);
  console.log(`P${String(e.position).padEnd(3)} ${e.team.name.padEnd(13)} grid ${String(e.slot + 1).padStart(2)}  ${e.finished ? formatTime(e.finishTime) : e.retired ? 'RETIRED  ' : 'DNF      '}  best ${s.best < Infinity ? formatTime(s.best) : '--'}  pace ${e.driver.pace.toFixed(3)} ${(e.style?.name ?? '').padEnd(10)} ${stints.get(e).join('-').padEnd(16)} wear ${Math.round(Math.max(...e.physics.wheels.map((w) => w.wear)) * 100)}%  wall ${String(s.wall).padStart(4)}  off ${(s.off * dt).toFixed(1).padStart(5)} s  respawns ${s.respawn}  mistakes ${e.driver?.mistakes ?? 0}${e.driver?.missedBox ? `  MISSED BOX ${e.driver.missedBox}` : ''}`);
}
