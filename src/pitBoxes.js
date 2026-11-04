// Garage fronts and pit boxes. Each team has its own garage (see teamGarage in
// teams.js): an open door with the team's name board above it, and its pit box
// painted on the working lane in front, in team colours with the stop line where the
// front axle goes. Garages without a team have their shutters down.
import * as THREE from 'three/webgpu';
import { texture, uv, vec2, float } from 'three/tsl';
import { boxGeometry, planeXZ } from './geometry.js';
import { simpleMaterial, layered } from './materials.js';
import { drawLogo } from './logos.js';
import { garageTeam } from './teams.js';
import { PIT } from './trackPath.js';

const FONT = '"Segoe UI", "Arial Black", Arial, sans-serif';

/** White on dark team colours, near-black on light ones (Haas white, Mercedes silver...). */
function inkOn(css) {
  const n = parseInt(css.slice(1), 16);
  const lum = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 165 ? '#141414' : '#ffffff';
}

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function texturedMaterial(tex, roughness, flipU = false) {
  const m = new THREE.MeshStandardNodeMaterial();
  const u = flipU ? uv().x.oneMinus() : uv().x;
  m.colorNode = texture(tex, vec2(u, uv().y)).rgb;
  m.roughnessNode = float(roughness);
  m.metalnessNode = float(0);
  return m;
}

/** Name board above a team's garage door: team colour with its logo and name in white (or black on light colours). */
function boardTexture(team, aspect) {
  const H = 160, W = Math.round(H * aspect);
  return canvasTexture(W, H, (g) => {
    g.fillStyle = team.ui.primary;
    g.fillRect(0, 0, W, H);
    g.fillStyle = team.ui.accent; // accent rules top and bottom
    g.fillRect(0, 0, W, 10);
    g.fillRect(0, H - 10, W, 10);
    const ink = inkOn(team.ui.primary);
    if (team.logoHasName) {
      // the logo already spells out the team name: show it alone, larger
      drawLogo(g, team.logo, W * 0.1, H * 0.12, W * 0.8, H * 0.76, ink);
      return;
    }
    const logoW = H * 2.4;
    g.font = `italic 900 ${H * 0.5}px ${FONT}`;
    const name = team.name.toUpperCase();
    const textW = g.measureText(name).width;
    const x0 = (W - (logoW + H * 0.3 + textW)) / 2;
    drawLogo(g, team.logo, x0, H * 0.14, logoW, H * 0.72, ink);
    g.fillStyle = ink;
    g.textBaseline = 'middle';
    g.fillText(name, x0 + logoW + H * 0.3, H / 2 + 4);
  });
}

/**
 * Pit box paint, seen from above with the car arriving from the bottom: team colour
 * (its dark second colour when the main one is white or silver) with a white border, white marks where the four wheels stop, the stop line across
 * the front axle and the team logo, and the car number by the rear.
 */
function boxTexture(team) {
  const { length: L, width: Wm, stopLine } = PIT.box;
  const ppm = 64; // pixels per metre
  const W = Math.round(Wm * ppm), H = Math.round(L * ppm);
  return canvasTexture(W, H, (g) => {
    const y = (along) => H / 2 - along * ppm; // metres ahead of the box centre -> canvas y
    const bg = inkOn(team.ui.primary) === '#ffffff' ? team.ui.primary : team.ui.secondary;
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#f4f4f4';
    g.lineWidth = 0.14 * ppm;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
    g.fillStyle = '#f4f4f4';
    g.fillRect(0, y(stopLine) - 0.08 * ppm, W, 0.16 * ppm); // front axle stop line
    for (const along of [stopLine, -1.65]) {
      for (const side of [-1, 1]) {
        const cx = W / 2 + side * 0.8 * ppm;
        g.fillRect(cx - 0.25 * ppm, y(along) - 0.36 * ppm, 0.5 * ppm, 0.07 * ppm);
        g.fillRect(cx - 0.25 * ppm, y(along) + 0.29 * ppm, 0.5 * ppm, 0.07 * ppm);
      }
    }
    // logo ahead of the stop line, number behind the rear axle: both read on the approach
    const ink = inkOn(bg);
    drawLogo(g, team.logo, 0.25 * ppm, y(L / 2 - 0.25), W - 0.5 * ppm, (L / 2 - 0.25 - stopLine - 0.25) * ppm, ink);
    g.fillStyle = ink;
    g.font = `italic 900 ${1.1 * ppm}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(team.number), W / 2, y(-2.75));
  });
}

/**
 * Doors, boards and pit boxes for every garage of the lane. `front(j)` is the facade's
 * offset from the lane centre at sample j. Returns the textures made (for disposal).
 */
export function buildGarageFronts(pit, group, front) {
  const o = pit.outer; // garage side, as a sign on the lane's left normal
  const pitch = pit.garagePitch;
  const textures = [];
  const door = simpleMaterial(0x15161a, 0.9);
  const shutter = simpleMaterial(0x9a9da3, 0.55, 0.4);
  const spareBand = simpleMaterial(0x3a3d44, 0.6);
  const boardW = pitch * 0.94, boardH = 1.4;
  for (let k = 0; k < pit.garageCount; k++) {
    const team = garageTeam(k);
    const p = pit.poseAt(pit.garageStart + (k + 0.5) * pitch);
    const grp = new THREE.Group();
    const lat = front(p.j) - 0.1;
    grp.position.set(p.x + pit.leftX(p.j) * o * lat, p.y, p.z + pit.leftZ(p.j) * o * lat);
    grp.rotation.y = p.yaw; // local +X = lane's left, +Z = along the lane
    const d = new THREE.Mesh(boxGeometry(0.2, 4.6, pitch * 0.72), team ? door : shutter);
    d.position.set(0, 2.3, 0);
    const band = new THREE.Mesh(boxGeometry(0.2, boardH, boardW), spareBand);
    band.position.set(0, 5.6, 0);
    grp.add(d, band);
    if (team) {
      // the board faces the lane (local -o X), just proud of the band
      const tex = boardTexture(team, boardW / boardH);
      textures.push(tex);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), texturedMaterial(tex, 0.5));
      board.rotation.y = -o * Math.PI / 2;
      board.position.set(-o * 0.11, 5.6, 0);
      grp.add(board);
    }
    group.add(grp);

    if (team) {
      const b = pit.box(k);
      const tex = boxTexture(team);
      textures.push(tex);
      const { length: L, width: W } = PIT.box;
      // planeXZ's u runs along local +X (the lane's left); the canvas reads left-to-right
      // across the driver's view, so flip it
      const paint = new THREE.Mesh(planeXZ(-W / 2, -L / 2, W / 2, L / 2, 0.035), layered(texturedMaterial(tex, 0.6, true), 3));
      paint.position.set(b.x, b.y, b.z);
      paint.rotation.set(-Math.atan(b.grade), b.yaw, 0, 'YXZ');
      group.add(paint);
    }
  }
  return textures;
}
