// Teams: one file per team in src/teams/<id>.js holds its livery (procedural TSL paint of
// the body panels), sponsor decals and car shape overrides. Shared paint/decal helpers
// live in src/teams/livery.js.
//
// Livery: `body(part)` paints the lofted body panels as a function of the panel's local
// position (car body frame: +Z forward, +Y up, +X = car's left) and the loft's uv (uv.x
// runs around the cross-section: 0.25 = top centre, 0.75 = underside). Parts:
// 'monocoque' (nose + chassis), 'sidepod', 'engine' (airbox + engine cover), 'fin'.
// Sponsor logos are decals (src/decals.js) drawn from src/logos.js.
//
// Shape: optional `shape` overrides parts of DEFAULT_SHAPE in src/car.js (nose/chassis,
// sidepods, engine cover, fin, wing endplates) so each car follows its real silhouette.
import redbull from './teams/redbull.js';
import ferrari from './teams/ferrari.js';
import mclaren from './teams/mclaren.js';
import mercedes from './teams/mercedes.js';
import williams from './teams/williams.js';
import racingbulls from './teams/racingbulls.js';
import astonmartin from './teams/astonmartin.js';
import haas from './teams/haas.js';
import audi from './teams/audi.js';
import alpine from './teams/alpine.js';
import cadillac from './teams/cadillac.js';

const TEAM_DEFS = [redbull, ferrari, mclaren, mercedes, williams, racingbulls, astonmartin, haas, audi, alpine, cadillac];

/**
 * The 2026 grid, in order of the 2025 constructors' championship (Cadillac, the new
 * entry, last). This is the menu order and the garage order down the pit lane.
 */
const GRID = [
  'mclaren', 'mercedes', 'redbull', 'ferrari', 'williams', 'racingbulls',
  'astonmartin', 'haas', 'audi', 'alpine', 'cadillac',
];
export const TEAMS = GRID.map((id) => TEAM_DEFS.find((t) => t.id === id));

export const teamById = (id) => TEAMS.find((t) => t.id === id) ?? TEAMS[0];

/**
 * Each team's designated garage and pit box, counted from the pit entry: one per
 * team, in TEAMS order. Garages past the last team stay closed.
 */
export const teamGarage = (team) => TEAMS.findIndex((t) => t.id === team.id);
export const garageTeam = (k) => TEAMS[k] ?? null;

/** The team's logo drawn into a canvas (cssW x cssH CSS pixels), for the menu cards. */
export function teamLogoCanvas(team, cssW = 158, cssH = 56) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const c = document.createElement('canvas');
  c.className = 'team-logo';
  c.width = Math.round(cssW * dpr);
  c.height = Math.round(cssH * dpr);
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', `${team.name} logo`);
  // logos.js builds Path2D objects when it loads, so it is only imported in the browser,
  // when a logo is drawn (Node scripts import this module too)
  import('./logos.js').then(({ drawLogo }) => {
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    drawLogo(g, team.logo, 0, 0, cssW, cssH);
  });
  return c;
}
