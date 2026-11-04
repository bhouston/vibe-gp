// Tyre and surface traction model.
//
// Each tyre's force comes from a Pacejka "Magic Formula" curve,
//   F = D · sin(C · atan(B·x − E·(B·x − atan(B·x))))
// applied to a *combined, normalised* slip, so braking/traction and cornering
// share one friction budget (the friction ellipse) instead of adding up.
//
// The physical effects modelled here:
//  - Load sensitivity: peak force grows sub-linearly with vertical load,
//    Fmax ∝ Fz^n with n ≈ 0.7–0.9, so the friction coefficient falls as aero
//    load and load transfer pile on. This is why a car loses total grip when
//    weight shifts onto one side, and why μ at 300 km/h is lower than at 80 km/h.
//  - Slip curves: force builds linearly with slip angle / slip ratio, peaks
//    (slicks: ~5° slip angle, ~10% slip ratio), then falls into a slide.
//  - Surfaces: asphalt, painted kerb and grass each have their own μ, curve
//    shape, peak slip and rolling resistance. Grass is not "asphalt × 0.5": a
//    slick has no tread to bite into turf, so its μ is low in absolute terms,
//    the curve is flat (sliding ≈ gripping) and the peak sits at large slip.
//  - Tyre temperature: grip vs temperature around a narrow window (Pirelli: peak
//    around 105 °C, ~1% loss below 100 °C or above 115 °C).
//  - Contamination: driving on grass leaves dirt and clippings on the tread,
//    costing grip until it scrubs off on clean asphalt.
//  - Compounds and wear: soft / medium / hard trade peak grip and a cooler working
//    window against how fast the tread wears away (see COMPOUNDS).

/** Normalised Magic Formula: x is slip / peak slip, so the peak is at x = 1. */
export class SlipCurve {
  constructor(C, E) {
    this.C = C;
    this.E = E;
    this.B = solvePeakB(C, E);
  }

  /** Force fraction of the peak (0..1, sign follows x). */
  at(x) {
    const { B, C, E } = this;
    const bx = B * x;
    return Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
  }

  /** Slope at x = 0, in units of peak force per unit normalised slip. */
  get stiffness() {
    return this.B * this.C;
  }
}

/** B such that the curve peaks at x = 1 (C·atan(...) = π/2 there). */
function solvePeakB(C, E) {
  // inner(B) = B − E(B − atan B) must equal tan(π / 2C); it is monotonic in B for E < 1
  const target = Math.tan(Math.PI / (2 * C));
  let lo = 0, hi = 100;
  for (let k = 0; k < 80; k++) {
    const B = (lo + hi) / 2;
    const v = B - E * (B - Math.atan(B));
    if (v < target) lo = B;
    else hi = B;
  }
  return (lo + hi) / 2;
}

/**
 * Surfaces. mu is the peak friction coefficient at the reference load FZ0;
 * loadExp is the load-sensitivity exponent n in Fmax = mu·FZ0·(Fz/FZ0)^n.
 *
 * asphalt: dry, rubbered-in circuit. Racing slicks reach μ ≈ 1.6–1.8 here,
 *          which gives ~1.8 g of mechanical grip at low speed and, with the
 *          aero model, ~4–5 g in fast corners, matching F1 telemetry.
 * kerb:    painted concrete. F1 circuits use non-slip paint, so dry μ is only a
 *          little lower; the bigger losses are the ridged profile, which makes
 *          the load on the tyre fluctuate (bump), and ride-height changes that
 *          stall the floor and cut downforce (aeroLoss).
 * grass:   dry turf. Measured street-tyre μ is ~0.35 on dry grass against ~0.72
 *          on asphalt. A slick has no tread, so we use μ ≈ 0.4 absolute, a flat
 *          curve (low C), a large peak slip, high rolling resistance from the
 *          soft ground, aero loss from the uneven surface, and dirt pick-up.
 */
export const SURFACES = {
  asphalt: {
    name: 'asphalt',
    mu: 1.8,
    loadExp: 0.85,
    peakAlpha: 0.09, // rad (~5.2°)
    peakKappa: 0.1,
    lat: new SlipCurve(1.35, -0.6),
    long: new SlipCurve(1.6, -0.4),
    crr: 0.013, // rolling resistance coefficient
    bump: 0, // relative vertical-load fluctuation
    aeroLoss: 0, // fraction of downforce lost (per wheel on this surface / 4)
    dirt: 0, // dirt pick-up per metre (negative = cleaning)
  },
  kerb: {
    name: 'kerb',
    mu: 1.6,
    loadExp: 0.85,
    peakAlpha: 0.09,
    peakKappa: 0.1,
    lat: new SlipCurve(1.4, -0.4), // a touch peakier: less forgiving past the limit
    long: new SlipCurve(1.6, -0.4),
    crr: 0.02,
    bump: 0.35,
    bumpWavelength: 1.1, // m between ridges
    aeroLoss: 0.2,
    dirt: 0,
  },
  grass: {
    name: 'grass',
    mu: 0.55,
    loadExp: 0.95, // soil shear is closer to Coulomb friction
    peakAlpha: 0.2, // rad (~11°): the turf has to shear before it lets go
    peakKappa: 0.22,
    lat: new SlipCurve(1.12, 0.2), // flat: sliding gives almost the same force as gripping
    long: new SlipCurve(1.15, 0.2),
    crr: 0.035,
    bump: 0.12,
    bumpWavelength: 2.7,
    aeroLoss: 0.2,
    dirt: 0.03,
  },
};

export const TYRE = {
  FZ0: 2500, // N, reference load (≈ static corner load with fuel and driver)
  muLongScale: 1.25, // longitudinal grip relative to lateral: stronger braking and traction
  // temperature (°C)
  tOpt: 105,
  tAmbient: 25,
  tTrack: 38,
  tBlanket: 70, // F1 tyre blankets are limited to 70 °C
  tCold: 60, // conservative tread temperature for the exported grip summary (physics.js)
  coldWidth: 25, // with tempLossMax gives 1% loss at 100 °C
  hotWidth: 50, // ... and 1% loss at 115 °C
  tempLossMax: 0.25, // grip lost when far outside the window
  heatCapacity: 9000, // J/°C of the working tread layer
  slipHeat: 0.3, // fraction of sliding power that heats the tread (the rest goes into the track)
  flexHeat: 0.024, // carcass hysteresis: W per (N·m/s) of load × speed
  coolBase: 18, // W/°C convective cooling at rest
  coolSpeed: 2.6, // extra W/°C per m/s of airflow
  coolGrass: 60, // W/°C extra conduction into cool grass
  dirtGripLoss: 0.08, // grip lost with fully dirty tyres
  dirtCleanLength: 120, // m of clean asphalt to scrub most of it off
  wearGripLoss: 0.12, // grip lost with a fully worn tread
  wearSlide: 2.5, // extra wear per unit of slide past 80% of the limit
};

/**
 * Dry tyre compounds, in Pirelli's sidewall colours. grip scales the peak force, tOpt
 * moves the temperature window (softer rubber works cooler) and wear is the fraction of
 * the tread used per km of clean driving (sliding wears it faster).
 */
export const COMPOUNDS = {
  soft: { id: 'soft', name: 'SOFT', letter: 'S', hex: 0xe8202a, css: '#e8202a', grip: 1.04, tOpt: 96, wear: 0.05 },
  medium: { id: 'medium', name: 'MEDIUM', letter: 'M', hex: 0xf5c400, css: '#f5c400', grip: 1.0, tOpt: 105, wear: 0.028 },
  hard: { id: 'hard', name: 'HARD', letter: 'H', hex: 0xeeeeee, css: '#eeeeee', grip: 0.965, tOpt: 112, wear: 0.016 },
};
export const COMPOUND_LIST = [COMPOUNDS.soft, COMPOUNDS.medium, COMPOUNDS.hard];

/** Grip multiplier from tread temperature (tOpt: the compound's window centre). */
export function tempGrip(T, tOpt = TYRE.tOpt) {
  const d = T - tOpt;
  const w = d < 0 ? TYRE.coldWidth : TYRE.hotWidth;
  return 1 - TYRE.tempLossMax * (1 - Math.exp(-((d / w) ** 2)));
}

/** Peak force (N) for a tyre on a surface at vertical load Fz. */
export function peakForce(surface, Fz) {
  if (Fz <= 0) return 0;
  return surface.mu * TYRE.FZ0 * Math.pow(Fz / TYRE.FZ0, surface.loadExp);
}

/**
 * Combined-slip tyre forces in the wheel frame.
 *   kappa: longitudinal slip ratio (+ = driving / wheelspin)
 *   tanAlpha: tan of the slip angle, as vy / |vx| (+ = contact patch sliding left)
 *   Fz: vertical load (N); grip: extra multiplier (temperature, dirt)
 * Returns { fx, fy, slide } where fy opposes the sliding direction and slide is
 * the combined slip relative to the peak (>1 = past the limit).
 */
export function tyreForce(surface, kappa, tanAlpha, Fz, grip) {
  const sx = kappa / surface.peakKappa;
  const sy = tanAlpha / Math.tan(surface.peakAlpha);
  const s = Math.hypot(sx, sy);
  if (s < 1e-9 || Fz <= 0) return { fx: 0, fy: 0, slide: s };
  const fmax = peakForce(surface, Fz) * grip;
  // curve shape blends between the longitudinal and lateral curves by slip direction
  const wx = (sx * sx) / (s * s);
  const mag = (wx * surface.long.at(s) + (1 - wx) * surface.lat.at(s)) * fmax;
  // friction ellipse: the longitudinal axis is slightly longer than the lateral one
  return {
    fx: mag * TYRE.muLongScale * (sx / s),
    fy: -mag * (sy / s),
    slide: s,
  };
}

/**
 * Longitudinal stiffness dFx/dkappa in the linear region (N per unit slip ratio),
 * used by the implicit wheel-spin solver.
 */
export function longStiffness(surface, Fz, grip) {
  return (surface.long.stiffness * peakForce(surface, Fz) * grip * TYRE.muLongScale) / surface.peakKappa;
}
