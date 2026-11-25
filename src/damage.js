// Collision damage for the whole car. Every part that can break has a damage level from
// 0 (intact) to 1 (destroyed / broken off):
//   wing[2]        front wing halves (left, right): front downforce. Break off at wingBreak.
//   rearWing       rear wing: rear downforce and drag. Breaks off at rearWingBreak.
//   floor[2]       floor edges (left, right): downforce from the floor (both axles).
//   sidepod[2]     sidepods: drag, and cooling (a crushed radiator costs engine power).
//   mirror[2]      mirrors: break off, taking that mirror's view with them.
//   suspension[4]  per corner (FL, FR, RL, RR): a bent arm knocks the wheel out of line
//                  (toe and camber), costing grip and pulling the car to one side.
//   tyre[4]        per corner: cut or flat-spotted, grips less and drags.
//   engine         power unit and gearbox (rear-end hits, and heavy hits anywhere): power.
// The monocoque and halo are the survival cell: they never break.
//
// Damage comes from wall impacts (physics.js, impact()), from other cars (ai.js,
// hitPart(): only the parts whose collision boxes touched) and from landings (landing()). Each part is described by its outermost
// points on the car. The wall touches the car at whichever point sticks out furthest
// towards it, and the hit then crushes into the car to a depth that grows with the
// speed into the wall: every part with a point inside that depth is hit, harder the
// nearer it is to the first contact. So a head-on hit breaks the front wing, a harder one
// reaches the front tyres; a side swipe catches the wing endplate, both tyres on that
// side and the floor edge, and only a heavy one crushes the sidepod and takes a mirror;
// reversing into a wall breaks the rear wing and then the gearbox.
//
// In the pits: new tyres (every stop) clear tyre damage, and a wing change (key F) fits a
// new front wing. Nothing else can be fixed in a stop; a reset (R) gives a fresh car, and
// switching damage off (B) repairs everything.

export const DAMAGE = {
  minSpeed: 3, // m/s into the wall before anything breaks (a gentle scrape is free)
  fullSpeed: 22, // m/s into the wall (≈ 80 km/h): a fragile part right at the contact is destroyed
  crushMin: 0.25, // m the car is crushed into at the gentlest damaging hit ...
  crushPerHit: 0.9, // ... plus this per unit of hit (1 = a full-speed hit)

  // front wing
  wingBreak: 0.7, // a wing half this damaged falls off
  wingAeroShare: 0.6, // share of its side's front downforce made by each half of the front wing
  bentAeroLoss: 0.6, // fraction of a half's downforce lost per unit damage while still attached
  wingDrag: 0.04, // fraction of the car's drag that comes from the whole front wing
  // rear wing
  rearWingBreak: 0.75,
  rearWingAeroShare: 0.45, // share of the rear axle's downforce made by the rear wing
  rearWingDrag: 0.25, // fraction of the car's drag from the rear wing (lost when it's gone)
  // floor
  floorAeroShare: 0.5, // share of all downforce made by the floor
  floorLoss: 0.6, // fraction of one side's floor downforce lost at full damage
  // sidepods
  sidepodDrag: 0.05, // extra drag per crushed sidepod
  sidepodCooling: 0.08, // engine power lost per crushed sidepod (overheating, de-rated)
  // suspension
  suspToe: 0.035, // rad of toe-out at full damage (pulls the car toward that side)
  suspCamber: 0.3, // rad of camber shown at full damage
  suspGripLoss: 0.3, // grip lost by the wheel at full damage (wrong camber and toe)
  suspCrr: 0.04, // extra rolling resistance (a dragging, misaligned wheel)
  // tyres
  tyreGripLoss: 0.45,
  tyreCrr: 0.05, // extra rolling resistance coefficient at full damage
  // engine and gearbox
  enginePowerLoss: 0.5, // power lost at full damage
  // undrivable (wrecked): a car with either can't race on
  suspensionBroken: 0.6, // any corner's suspension this damaged
  engineDead: 0.95, // the engine this damaged
  // car-to-car contact (hitPart)
  sidepodCrush: 0.25, // a side hit into the body crushes the sidepod only past this much hit ...
  mirrorCrush: 0.5, // ... and takes the mirror past this much
  noseWing: 0.5, // share of a hit on the nose's tip that each front wing half takes
  diffuser: 0.5, // share of a hit on the gearbox that the floor (diffuser) on that side takes
  wingCrush: 0.1, // m a wing is crushed past its limit (ai.js) for a full hit: a fast clip snaps it, a steady shove bends it
  // landings (landing()): how hard a corner was hit, as the speed of a quarter of the car
  // landing on it (physics.js: the push it took over a quarter of the car's mass)
  landMin: 3, // m/s: softer than this is free (≈ a 0.5 m drop: the suspension takes it)
  landFull: 8.5, // m/s: a full hit (≈ a 3.7 m drop)
  landTilt: 1.5, // a landing tilted from flat is worse: × (1 + this × sin(tilt))
  landSuspension: 0.8, // a tyre's corner: its suspension, per unit of hit ...
  landFloor: 0.35, // ... the floor on that side (the plank bottoms out) ...
  landTyre: 0.5, // ... and its tyre, by the hit past this
  landShare: 0.3, // share of a tyre's hit the anti-roll bar passes to the other tyre on its axle
};

/**
 * The outermost points (car frame: x forward from the CoG, y left) of each part that can
 * be damaged, and how fragile it is (k: damage at the first contact point of a
 * full-speed hit). i: index into the part's array (side 0 left / 1 right, or corner).
 */
const D = DAMAGE;
const sideY = (s) => (s ? -1 : 1);
export const PARTS = [
  // front wing: endplate tip, the endplate's outer face and the mainplane's leading edge
  ...[0, 1].map((s) => ({ part: 'wing', i: s, k: 1.4, pts: [[2.98, 0.98], [2.3, 0.98], [2.98, 0.35]].map(([x, y]) => [x, y * sideY(s)]) })),
  // rear wing: endplates and the trailing edge
  { part: 'rearWing', i: null, k: 1.2, pts: [[-2.74, 0.5], [-2.74, -0.5], [-2.45, 0.51], [-2.45, -0.51]] },
  // power unit / gearbox: behind it only the rear crash structure and the wing
  { part: 'engine', i: null, k: 0.6, pts: [[-2.52, 0], [-2.2, 0.2], [-2.2, -0.2]] },
  // floor edge, from ahead of the sidepod to the diffuser
  ...[0, 1].map((s) => ({ part: 'floor', i: s, k: 0.55, pts: [[1.2, 0.36], [0.85, 0.85], [-0.6, 0.85], [-1.3, 0.55], [-2.3, 0.52]].map(([x, y]) => [x, y * sideY(s)]) })),
  ...[0, 1].map((s) => ({ part: 'sidepod', i: s, k: 0.9, pts: [[0.6, 0.72], [0.0, 0.72], [-0.6, 0.66]].map(([x, y]) => [x, y * sideY(s)]) })),
  ...[0, 1].map((s) => ({ part: 'mirror', i: s, k: 1.8, pts: [[0.7, 0.56 * sideY(s)]] })),
  // wheels: the tyre's outer face, front and back; the suspension behind it
  ...[0, 1, 2, 3].flatMap((c) => {
    const front = c < 2, x = front ? 1.75 : -1.65, r = front ? 0.34 : 0.36, y = (front ? 0.95 : 1.0) * sideY(c % 2);
    const pts = [[x + r, y], [x, y], [x - r, y], [x + (front ? r : -r), y * 0.82]];
    return [{ part: 'tyre', i: c, k: 0.9, pts }, { part: 'suspension', i: c, k: 0.75, pts }];
  }),
];

const K = {}; // fragility of each part
for (const p of PARTS) K[p.part] ??= p.k;
const span = (part) => {
  const xs = PARTS.filter((p) => p.part === part).flatMap((p) => p.pts.map(([x]) => x));
  return [Math.min(...xs), Math.max(...xs)];
};
const SIDEPOD = span('sidepod'), MIRROR = span('mirror'), WING = span('wing');

/** Damage state of one car. Side index 0 = left, 1 = right; corners in wheel order (FL, FR, RL, RR). */
export class CarDamage {
  constructor() {
    this.reset();
  }

  reset() {
    this.wing = [0, 0];
    this.rearWing = 0;
    this.floor = [0, 0];
    this.sidepod = [0, 0];
    this.mirror = [0, 0];
    this.suspension = [0, 0, 0, 0];
    this.tyre = [0, 0, 0, 0];
    this.engine = 0;
    this.events = []; // { part, side, before, level } of hits since the last read (for the HUD)
  }

  repairWing() {
    this.wing[0] = this.wing[1] = 0;
  }

  repairTyres() {
    this.tyre.fill(0);
  }

  broken(side) {
    return this.wing[side] >= D.wingBreak;
  }

  get rearWingBroken() {
    return this.rearWing >= D.rearWingBreak;
  }

  /** Fraction of one front wing half's downforce that is lost (0..1). */
  wingLoss(side) {
    const d = this.wing[side];
    return d >= D.wingBreak ? 1 : d * D.bentAeroLoss;
  }

  /** Fraction of the rear wing's downforce that is lost (0..1). */
  get rearWingLoss() {
    return this.rearWingBroken ? 1 : this.rearWing * D.bentAeroLoss;
  }

  /** Front wing health as a single number for the HUD (1 = perfect, 0 = both halves gone). */
  get wingHealth() {
    return 1 - (this.wingLoss(0) + this.wingLoss(1)) / 2;
  }

  /** Multipliers the physics applies (aero, drag, power), all 1 on an undamaged car. */
  get aero() {
    const floor = 1 - D.floorAeroShare * D.floorLoss * (this.floor[0] + this.floor[1]) / 2;
    return {
      floor, // all downforce
      rear: 1 - D.rearWingAeroShare * this.rearWingLoss, // rear downforce
      drag: 1 - D.wingDrag * (this.wingLoss(0) + this.wingLoss(1)) / 2 - D.rearWingDrag * this.rearWingLoss
        + D.sidepodDrag * (this.sidepod[0] + this.sidepod[1]),
      power: (1 - D.enginePowerLoss * this.engine) * (1 - D.sidepodCooling * (this.sidepod[0] + this.sidepod[1])),
    };
  }

  /**
   * Wrecked: too badly damaged to race on, and it can't pit for it (broken suspension or a
   * dead engine). The one definition of a wrecked car: ai.js retires or respawns an AI car,
   * and main.js tells the player. How the car is lying (pitch, roll) doesn't come into it.
   */
  get undrivable() {
    return this.suspension.some((x) => x >= D.suspensionBroken) || this.engine >= D.engineDead;
  }

  /** Is anything at all damaged? */
  get any() {
    return this.wing.some((d) => d > 0) || this.rearWing > 0 || this.floor.some((d) => d > 0) || this.sidepod.some((d) => d > 0)
      || this.mirror.some((d) => d > 0) || this.suspension.some((d) => d > 0) || this.tyre.some((d) => d > 0) || this.engine > 0;
  }

  /**
   * A wall impact. fwd / left: the wall normal (pointing from the car into the wall)
   * in the car's frame, as forward and left components; speed: m/s into the wall.
   */
  impact(fwd, left, speed) {
    const hit = Math.min(1.5, (speed - D.minSpeed) / (D.fullSpeed - D.minSpeed));
    if (hit <= 0) return;
    // how far each point reaches towards the wall; the furthest one touches it first
    const reach = ([x, y]) => x * fwd + y * left;
    let first = -Infinity;
    for (const p of PARTS) for (const q of p.pts) first = Math.max(first, reach(q));
    const depth = D.crushMin + D.crushPerHit * hit;
    for (const p of PARTS) {
      let e = 0; // 1 = at the first contact, 0 = just beyond the crush depth
      for (const q of p.pts) e = Math.max(e, 1 - (first - reach(q)) / depth);
      if (e > 0) this.add(p.part, p.i, hit * p.k * e);
    }
    // a big hit anywhere shakes the power unit and the gearbox
    if (hit > 0.6) this.add('engine', null, (hit - 0.6) * 0.25);
  }

  /**
   * Another car hit one of this car's parts: one of the collision boxes in carShape.js.
   * part and side as in BOXES ('body', 'gearbox', 'nose', 'wing', 'rearWing' or 'tyre';
   * side 0 left / 1 right, or the corner for a tyre); amount: how hard (0 = too slow to
   * break anything, 1 = a full-speed hit right on it), scaled here by each part's
   * fragility; x: where along the car it landed (m forward of the CoG).
   *   body     the floor edge on that side; a harder hit also crushes the sidepod, and
   *            takes the mirror if it lands beside the cockpit
   *   gearbox  the power unit and gearbox, and the diffuser (floor) on that side
   *   nose     the survival cell doesn't break, but a hit on its tip, over the front
   *            wing, bends both wing halves
   *   wing, rearWing  that wing;  tyre  the tyre and its suspension
   */
  hitPart(part, side, amount, x = 0) {
    if (!(amount > 0)) return;
    switch (part) {
      case 'wing':
      case 'rearWing':
        this.add(part, part === 'wing' ? side : null, amount * K[part]);
        break;
      case 'tyre':
        this.add('tyre', side, amount * K.tyre);
        this.add('suspension', side, amount * K.suspension);
        break;
      case 'body':
        this.add('floor', side, amount * K.floor);
        if (x > SIDEPOD[0] - 0.3 && x < SIDEPOD[1] + 0.1) this.add('sidepod', side, (amount - D.sidepodCrush) * K.sidepod);
        if (x > MIRROR[0] - 0.5 && x < MIRROR[1] + 0.5) this.add('mirror', side, (amount - D.mirrorCrush) * K.mirror);
        break;
      case 'gearbox':
        this.add('engine', null, amount * K.engine);
        this.add('floor', side, amount * D.diffuser * K.floor);
        break;
      case 'nose':
        if (x > WING[0]) for (const s of [0, 1]) this.add('wing', s, amount * D.noseWing * K.wing);
        break;
    }
  }

  /**
   * The car came down on the road at one of its ground points (GROUND in carShape.js);
   * speed: how hard (m/s). For a tyre, the push its suspension took, as the speed of a
   * quarter of the car landing there (physics.js shares it with the other tyre on the axle
   * first); for the tail or a wing tip, the speed it hit the road at. tilt (rad): how far
   * from flat it was against the road, the larger of pitch and roll. Suspension and the floor take a landing first, the tyre too on a hard
   * one; a tilted landing (nose first, on one wheel) puts it all through fewer points and is
   * worse. On a tail or wing tip: the floor (diffuser) or that wing.
   */
  landing(point, speed, tilt = 0, from = 0) {
    // from: a hit this corner has already been charged for in the same landing (it's growing)
    const k = 1 + D.landTilt * Math.sin(Math.min(Math.abs(tilt), Math.PI / 2));
    const hitAt = (v) => Math.min(1.5, Math.max(0, (v * k - D.landMin) / (D.landFull - D.landMin)));
    const hit = hitAt(speed), was = hitAt(from);
    if (hit <= was) return;
    const past = (x, t) => Math.max(0, x - t);
    if (point.wheel !== null) {
      const c = point.wheel;
      this.add('suspension', c, (hit - was) * D.landSuspension);
      this.add('floor', c % 2, (hit - was) * D.landFloor);
      this.add('tyre', c, (past(hit, D.landTyre) - past(was, D.landTyre)) * K.tyre);
    } else if (point.part === 'floor') {
      this.add('floor', point.side, (hit - was) * K.floor);
      this.add('engine', null, (past(hit, 0.6) - past(was, 0.6)) * 0.25); // a hard hit on the tail shakes the gearbox
    } else if (point.part === 'wing') this.add('wing', point.side, (hit - was) * K.wing);
  }

  add(part, side, amount) {
    if (amount < 0.02) return;
    const get = () => (side === null ? this[part] : this[part][side]);
    const before = get();
    let after = Math.min(1, before + amount);
    // broken off: nothing left to bend
    if ((part === 'wing' && after >= D.wingBreak) || (part === 'rearWing' && after >= D.rearWingBreak) || (part === 'mirror' && after >= 0.6)) after = 1;
    if (after === before) return;
    if (side === null) this[part] = after;
    else this[part][side] = after;
    this.events.push({ part, side, before, level: after });
  }
}
