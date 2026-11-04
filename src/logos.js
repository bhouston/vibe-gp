// Sponsor and team logos, drawn as vector paths into a 2D canvas.
//
// Each logo has a natural `aspect` (width / height) and a `draw(g, ink)` routine that
// paints it in a box 100 units tall and 100 * aspect units wide (the caller sets the
// transform). With `ink` null the logo is drawn in its own brand colours; with an ink
// colour it's drawn single-colour, the way most logos appear on race-car bodywork.
//
// These are simplified, hand-drawn stand-ins built from basic shapes and system fonts,
// not the brands' artwork.

const SANS = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const BLACK = '"Arial Black", "Segoe UI Black", "Segoe UI", Arial, sans-serif';
const GEO = '"Futura", "Century Gothic", "Segoe UI", Arial, sans-serif';
const COND = 'Bahnschrift, "Arial Narrow", "Segoe UI", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const SCRIPT = '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';

/** Fill `text` centred at (x, y), shrunk to fit `maxW`. Returns the drawn width. */
function text(g, str, x, y, { size, font = SANS, weight = 800, style = '', maxW = Infinity, spacing = 0, align = 'center', stretch = 'normal' }) {
  let px = size;
  const set = () => {
    g.font = `${style} ${weight} ${px}px ${font}`;
    if ('letterSpacing' in g) g.letterSpacing = `${spacing * px}px`;
    if ('fontStretch' in g) g.fontStretch = stretch;
  };
  set();
  // measureText includes trailing letter spacing
  const measure = () => g.measureText(str).width - spacing * px;
  if (measure() > maxW) {
    px *= maxW / measure();
    set();
  }
  const w = measure();
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  // canvas baseline sits at y; centre the cap height on y instead
  g.fillText(str, x0, y + px * 0.36);
  return w;
}

const rr = (g, x, y, w, h, r) => {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
};

/** Pick ink or a brand colour. */
const pick = (ink, brand) => ink ?? brand;

// A charging bull facing right, head down and horns forward, in a 100 x 60 box:
// muscular hump over the shoulders, one foreleg reaching, one folded, hind leg kicking
// back and the tail whipping up.
const BULL = new Path2D(
  'M20 18 C14 14 10 9 8 3 L4 4 L7 9 C10 14 13 18 16 21 ' + // tail whipping up, with its tuft
  'C14 26 15 30 19 33 L3 46 C1 48 2 51 5 51 L25 38 ' + // hind leg kicked back
  'L28 41 L30 55 C30 57 35 57 35 55 L34 40 ' + // planted hind leg
  'C42 40 52 40 60 38 ' + // belly
  'L57 46 C56 50 59 52 63 51 L67 50 L64 46 L65 40 ' + // foreleg folded under
  'L69 41 L88 55 C90 57 93 56 93 53 L90 51 L74 38 ' + // foreleg reaching forward
  'C76 41 80 44 85 46 C90 48 95 46 96 42 C97 38 95 34 92 30 C90 28 89 26 88 24 ' + // lowered head and muzzle
  'C94 19 98 12 99 3 C96 10 91 16 84 19 ' + // horn sweeping forward and up
  'C80 14 74 8 64 4 C54 1 40 4 30 10 C26 13 23 15 20 18 Z' // neck, shoulder hump, sloping back
);

// The prancing horse facing left, rearing on one hind leg, in a 60 x 90 box.
const HORSE = new Path2D(
  'M20 0 L22 5 L24 2 L25 8 C29 14 32 21 34 28 C38 34 43 39 48 44 ' + // ears, arched mane, back
  'C51 38 51 30 52 24 C53 18 56 13 60 10 C58 15 56 20 56 26 C56 33 57 40 53 47 ' + // tail flung up
  'C52 51 51 55 50 58 C53 62 56 66 56 70 C56 73 55 76 54 78 L50 78 L52 74 C52 70 50 66 46 62 ' + // raised hind leg
  'C44 67 43 74 43 80 L43 88 L36 88 L37 80 C37 74 37 69 36 65 ' + // standing hind leg
  'C33 61 30 56 28 52 ' + // belly
  'C24 53 21 55 18 58 L14 62 L11 60 L15 55 C18 52 21 49 23 47 ' + // lower foreleg, raised
  'C19 45 15 44 12 45 L8 48 L5 46 L9 41 C13 39 18 39 22 40 ' + // upper foreleg, raised high
  'C22 35 21 30 19 26 C16 25 13 25 10 26 C7 26 4 25 2 23 C0 21 1 18 3 16 C8 11 13 6 18 3 Z' // throat, long face
);

/**
 * Two bulls charging head to head in front of a sun, in the top ~70% of a 175 x 100
 * box. The sun keeps its colour even in single-colour use, so the bulls still read
 * against it; a thin knock-out outline separates each bull from the sun.
 */
function bullsAndSun(g, ink, bull, sun) {
  g.fillStyle = sun;
  g.beginPath();
  g.arc(87.5, 28, 23, 0, Math.PI * 2);
  g.fill();
  for (const [x, sx] of [[7, 1], [168, -1]]) {
    g.save();
    g.translate(x, 12);
    g.scale(0.78 * sx, 0.78);
    // gap between bull and sun
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 3.5;
    g.lineJoin = 'round';
    g.stroke(BULL);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = pick(ink, bull);
    g.fill(BULL);
    g.restore();
  }
}

/** A light-to-dark vertical chrome gradient over y0..y1, or the ink colour. */
function chrome(g, ink, y0, y1, stops = ['#f4f5f7', '#b9bdc3', '#e3e5e8', '#8d9298']) {
  if (ink) return ink;
  const grad = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
  return grad;
}

/** A plain wordmark logo in one colour. */
const word = (str, colour, { aspect, size = 80, font = SANS, weight = 800, style = '', spacing = 0 }) => ({
  aspect,
  draw(g, ink) {
    g.fillStyle = pick(ink, colour);
    text(g, str, 50 * aspect, 50, { size, font, weight, style, spacing, maxW: 100 * aspect - 8 });
  },
});

export const LOGOS = {
  // ---------------- Red Bull Racing ----------------
  redbull: {
    aspect: 1.75,
    draw(g, ink) {
      // two bulls charging at a sun, with the wordmark underneath
      bullsAndSun(g, ink, '#db0a40', '#ffcc00');
      g.fillStyle = pick(ink, '#db0a40');
      text(g, 'Red Bull', 87.5, 82, { size: 30, font: BLACK, weight: 900, maxW: 128, spacing: -0.02 });
    },
  },
  redbullText: {
    aspect: 4.2,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#db0a40');
      text(g, 'Red Bull', 210, 50, { size: 92, font: GEO, weight: 800, maxW: 410 });
    },
  },
  oracle: {
    aspect: 5.6,
    draw(g, ink) {
      // geometric stroke lettering: stadium O and C, crossbar-less A
      g.strokeStyle = pick(ink, '#c74634');
      g.lineWidth = 13;
      g.lineJoin = 'round';
      g.lineCap = 'butt';
      const top = 18, bot = 82, h = bot - top, mid = 50;
      const W = 70, gap = 18;
      let x = 8;
      const stadium = (x0, open) => {
        const r = h / 2;
        g.beginPath();
        if (open) {
          g.moveTo(x0 + W, top);
          g.lineTo(x0 + r, top);
          g.arc(x0 + r, mid, r, -Math.PI / 2, Math.PI / 2, true);
          g.lineTo(x0 + W, bot);
        } else {
          g.moveTo(x0 + r, top);
          g.lineTo(x0 + W - r, top);
          g.arc(x0 + W - r, mid, r, -Math.PI / 2, Math.PI / 2);
          g.lineTo(x0 + r, bot);
          g.arc(x0 + r, mid, r, Math.PI / 2, -Math.PI / 2);
          g.closePath();
        }
        g.stroke();
      };
      const s = 6.5; // half stroke
      stadium(x + s, false); x += W + gap;
      // R
      g.beginPath();
      g.moveTo(x + s, bot); g.lineTo(x + s, top + s); g.lineTo(x + 38, top + s);
      g.arc(x + 38, (top + s + mid) / 2, (mid - top - s) / 2, -Math.PI / 2, Math.PI / 2);
      g.lineTo(x + s, mid);
      g.moveTo(x + 34, mid); g.lineTo(x + 58, bot);
      g.stroke(); x += 58 + gap;
      // A
      g.beginPath();
      g.moveTo(x, bot); g.lineTo(x + 32, top + s); g.lineTo(x + 64, bot);
      g.stroke(); x += 64 + gap;
      stadium(x + s, true); x += W + gap;
      // L
      g.beginPath();
      g.moveTo(x + s, top); g.lineTo(x + s, bot - s); g.lineTo(x + 52, bot - s);
      g.stroke(); x += 52 + gap;
      // E
      g.beginPath();
      g.moveTo(x + 52, top + s); g.lineTo(x + s, top + s); g.lineTo(x + s, bot - s); g.lineTo(x + 52, bot - s);
      g.moveTo(x + s, mid); g.lineTo(x + 46, mid);
      g.stroke();
    },
  },
  ford: {
    aspect: 2.2,
    draw(g, ink) {
      const w = 220;
      g.save();
      g.beginPath();
      g.ellipse(w / 2, 50, w / 2 - 3, 47, 0, 0, Math.PI * 2);
      if (ink) {
        g.fillStyle = ink;
        g.fill();
        g.clip();
        g.globalCompositeOperation = 'destination-out';
      } else {
        const grad = g.createLinearGradient(0, 0, 0, 100);
        grad.addColorStop(0, '#2a5bb7');
        grad.addColorStop(1, '#0b2a63');
        g.fillStyle = grad;
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = '#d8dde6';
        g.stroke();
      }
      g.fillStyle = '#fff';
      if (ink) {
        // keep a thin rim of ink, knock out the inside line and the script
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(w / 2, 50, w / 2 - 10, 40, 0, 0, Math.PI * 2);
        g.strokeStyle = '#000';
        g.stroke();
        g.fillStyle = '#000';
      }
      text(g, 'Ford', w / 2, 48, { size: 66, font: SCRIPT, weight: 700, style: 'italic', maxW: 168 });
      g.restore();
    },
  },
  mobil1: {
    aspect: 3.6,
    draw(g, ink) {
      g.font = `900 78px ${SANS}`;
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      const parts = [['M', pick(ink, '#0b3d91')], ['o', '#ef3340'], ['bil', pick(ink, '#0b3d91')]];
      const total = parts.reduce((s, [t]) => s + g.measureText(t).width, 0) + 70;
      let x = (360 - total) / 2;
      for (const [t, c] of parts) {
        g.fillStyle = c;
        g.fillText(t, x, 78);
        x += g.measureText(t).width;
      }
      // the "1": slanted bar in red
      g.fillStyle = '#ef3340';
      g.beginPath();
      g.moveTo(x + 22, 78); g.lineTo(x + 40, 78); g.lineTo(x + 62, 18); g.lineTo(x + 44, 18);
      g.lineTo(x + 32, 28); g.lineTo(x + 30, 38); g.lineTo(x + 38, 34);
      g.closePath();
      g.fill();
    },
  },
  bybit: {
    aspect: 3.6,
    draw(g, ink) {
      const w = 360;
      g.font = `900 84px ${BLACK}`;
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      const parts = [['BYB', pick(ink, '#ffffff')], ['I', '#f7a600'], ['T', pick(ink, '#ffffff')]];
      const total = parts.reduce((s, [t]) => s + g.measureText(t).width, 0);
      const k = Math.min(1, (w * 0.94) / total);
      g.save();
      g.translate((w - total * k) / 2, 50 + 30 * k);
      g.scale(k, k);
      let x = 0;
      for (const [t, c] of parts) {
        g.fillStyle = c;
        g.fillText(t, x, 0);
        x += g.measureText(t).width;
      }
      g.restore();
    },
  },
  tagheuer: {
    aspect: 0.82,
    draw(g, ink) {
      // shield: green top with "TAG", red bottom with "Heuer", white border
      const w = 82;
      const shield = () => {
        g.beginPath();
        g.moveTo(4, 4); g.lineTo(w - 4, 4); g.lineTo(w - 4, 66);
        g.quadraticCurveTo(w - 4, 88, w / 2, 97);
        g.quadraticCurveTo(4, 88, 4, 66);
        g.closePath();
      };
      if (ink) {
        g.fillStyle = ink;
        shield(); g.fill();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        g.fillRect(4, 52, w - 8, 2.5);
        text(g, 'TAG', w / 2, 30, { size: 30, font: SANS, weight: 900, maxW: 62 });
        text(g, 'Heuer', w / 2, 70, { size: 18, font: SANS, weight: 700, maxW: 60 });
        g.globalCompositeOperation = 'source-over';
        return;
      }
      g.fillStyle = '#fff';
      shield(); g.fill();
      g.save();
      g.translate(w / 2, 50); g.scale(0.88, 0.88); g.translate(-w / 2, -50);
      shield(); g.clip();
      g.fillStyle = '#00694e';
      g.fillRect(0, 0, w, 52);
      g.fillStyle = '#e2001a';
      g.fillRect(0, 52, w, 60);
      g.restore();
      g.fillStyle = '#fff';
      text(g, 'TAG', w / 2, 30, { size: 30, font: SANS, weight: 900, maxW: 56 });
      text(g, 'Heuer', w / 2, 68, { size: 17, font: SANS, weight: 700, maxW: 54 });
    },
  },
  hardrock: {
    aspect: 4.4,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'HARD ROCK', 220, 52, { size: 70, font: COND, weight: 700, maxW: 420, spacing: 0.04, stretch: 'condensed' });
    },
  },
  castore: {
    aspect: 5,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'CASTORE', 250, 50, { size: 60, font: SANS, weight: 600, maxW: 480, spacing: 0.32 });
    },
  },

  // ---------------- Scuderia Ferrari ----------------
  ferrari: {
    aspect: 0.72,
    draw(g, ink) {
      // Scuderia shield: tricolore band, yellow field, black prancing horse, "S F" below
      const w = 72;
      const shield = () => {
        g.beginPath();
        g.moveTo(3, 3); g.lineTo(w - 3, 3); g.lineTo(w - 3, 56);
        g.bezierCurveTo(w - 3, 76, w - 16, 88, w / 2, 98);
        g.bezierCurveTo(16, 88, 3, 76, 3, 56);
        g.closePath();
      };
      if (ink) {
        g.fillStyle = ink; shield(); g.fill();
        g.globalCompositeOperation = 'destination-out';
      } else {
        g.fillStyle = '#111'; shield(); g.fill();
        g.save();
        g.translate(w / 2, 50); g.scale(0.9, 0.93); g.translate(-w / 2, -50);
        shield(); g.clip();
        g.fillStyle = '#ffd400'; g.fillRect(0, 0, w, 100);
        g.fillStyle = '#009246'; g.fillRect(0, 0, w / 3, 12);
        g.fillStyle = '#ffffff'; g.fillRect(w / 3, 0, w / 3, 12);
        g.fillStyle = '#ce2b37'; g.fillRect((2 * w) / 3, 0, w / 3, 12);
        g.fillStyle = '#111'; g.fillRect(0, 12, w, 1.6);
        g.restore();
      }
      g.fillStyle = ink ? '#000' : '#111';
      g.save();
      g.translate(15, 15);
      g.scale(0.72, 0.62);
      g.fill(HORSE);
      g.restore();
      text(g, 'S', w / 2 - 11, 79, { size: 17, font: SANS, weight: 900 });
      text(g, 'F', w / 2 + 11, 79, { size: 17, font: SANS, weight: 900 });
      g.globalCompositeOperation = 'source-over';
    },
  },
  hp: {
    aspect: 1,
    draw(g, ink) {
      // disc with slanted "hp" knocked out
      g.fillStyle = pick(ink, '#0096d6');
      g.beginPath(); g.arc(50, 50, 47, 0, Math.PI * 2); g.fill();
      g.save();
      if (ink) g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#fff';
      g.transform(1, 0, -0.32, 1, 16, 0); // italic shear
      // h: tall stem + short stem joined by a shoulder
      g.fillRect(24, 16, 10, 62);
      g.fillRect(44, 42, 10, 36);
      g.fillRect(24, 36, 30, 10);
      // p: descending stem + bowl
      g.fillRect(58, 36, 10, 56);
      g.beginPath(); g.roundRect(58, 36, 26, 36, 6); g.lineWidth = 9; g.strokeStyle = '#fff'; g.stroke();
      g.restore();
    },
  },
  shell: {
    aspect: 1.06,
    draw(g, ink) {
      // pecten: scalloped fan on a short base, red outline and ribs
      const cx = 53, cy = 64, R = 46;
      const lobes = 7;
      const outline = () => {
        g.beginPath();
        g.moveTo(cx - 16, 97);
        g.lineTo(cx - 18, 84);
        for (let i = 0; i <= lobes; i++) {
          const a = Math.PI + (i / lobes) * Math.PI;
          const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R * 1.0;
          if (i === 0) g.lineTo(px, py);
          else {
            const am = Math.PI + ((i - 0.5) / lobes) * Math.PI;
            g.quadraticCurveTo(cx + Math.cos(am) * R * 1.12, cy + Math.sin(am) * R * 1.12, px, py);
          }
        }
        g.lineTo(cx + 18, 84);
        g.lineTo(cx + 16, 97);
        g.closePath();
      };
      g.lineJoin = 'round';
      g.fillStyle = pick(ink, '#ffd500');
      outline(); g.fill();
      g.strokeStyle = ink ? 'rgba(0,0,0,1)' : '#dd1d21';
      if (ink) g.globalCompositeOperation = 'destination-out';
      if (!ink) { g.lineWidth = 6; outline(); g.stroke(); }
      g.lineWidth = 3.6;
      g.lineCap = 'round';
      for (let i = 1; i < lobes; i++) {
        const a = Math.PI + (i / lobes) * Math.PI;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 6, 86);
        g.lineTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    },
  },
  shellText: {
    aspect: 3.2,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#dd1d21');
      text(g, 'Shell', 160, 50, { size: 86, font: SANS, weight: 800, maxW: 300 });
    },
  },
  santander: {
    aspect: 4.6,
    draw(g, ink) {
      // flame: two-tongued drop, then the wordmark
      g.fillStyle = pick(ink, '#ec0000');
      g.beginPath();
      g.moveTo(40, 92);
      g.bezierCurveTo(14, 92, 6, 70, 14, 52);
      g.bezierCurveTo(20, 40, 30, 32, 32, 8);
      g.bezierCurveTo(44, 22, 50, 36, 46, 54);
      g.bezierCurveTo(52, 46, 56, 40, 56, 32);
      g.bezierCurveTo(70, 46, 74, 62, 66, 78);
      g.bezierCurveTo(60, 88, 52, 92, 40, 92);
      g.closePath();
      g.fill();
      text(g, 'Santander', 86, 56, { size: 66, font: SANS, weight: 700, maxW: 370, align: 'left' });
    },
  },
  unicredit: {
    aspect: 4.6,
    draw(g, ink) {
      // disc with a "one" figure knocked out, then the wordmark
      g.fillStyle = pick(ink, '#e2001a');
      g.beginPath(); g.arc(44, 50, 40, 0, Math.PI * 2); g.fill();
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(44, 30, 8, 0, Math.PI * 2); g.fill();
      g.beginPath();
      g.moveTo(32, 46); g.lineTo(50, 42); g.lineTo(50, 74); g.lineTo(58, 74); g.lineTo(58, 80);
      g.lineTo(32, 80); g.lineTo(32, 74); g.lineTo(40, 74); g.lineTo(40, 52); g.lineTo(32, 52);
      g.closePath(); g.fill();
      g.restore();
      g.fillStyle = pick(ink, '#e2001a');
      text(g, 'UniCredit', 96, 52, { size: 60, font: SANS, weight: 700, maxW: 360, align: 'left' });
    },
  },
  rayban: {
    aspect: 2.8,
    draw(g, ink) {
      if (!ink) {
        g.fillStyle = '#e10e17';
        rr(g, 2, 2, 276, 96, 14); g.fill();
      }
      g.fillStyle = ink ?? '#ffffff';
      g.save();
      g.translate(140, 50); g.rotate(-0.12); g.translate(-140, -50);
      text(g, 'Ray-Ban', 140, 50, { size: 72, font: SCRIPT, weight: 700, style: 'italic', maxW: 250 });
      g.restore();
    },
  },
  ibm: {
    aspect: 2.4,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#0f62fe');
      text(g, 'IBM', 120, 50, { size: 104, font: BLACK, weight: 900, maxW: 228, spacing: 0.02 });
      // horizontal stripes knocked out of the letters
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      for (let i = 1; i < 8; i++) g.fillRect(0, 13 + i * 9.4 - 2.4, 240, 4.4);
      g.globalCompositeOperation = 'source-over';
    },
  },
  puma: {
    aspect: 3.2,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'PUMA', 120, 52, { size: 86, font: BLACK, weight: 900, maxW: 200 });
      // leaping cat: a stretched arc with tail, trailing the wordmark
      g.beginPath();
      g.moveTo(232, 40);
      g.bezierCurveTo(260, 20, 290, 18, 312, 30);
      g.lineTo(318, 22); g.lineTo(318, 34);
      g.bezierCurveTo(296, 40, 280, 44, 272, 56);
      g.lineTo(290, 78); g.lineTo(282, 80); g.lineTo(262, 60);
      g.bezierCurveTo(250, 58, 240, 54, 232, 40);
      g.closePath(); g.fill();
    },
  },
  richardmille: {
    aspect: 7.5,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'RICHARD MILLE', 375, 50, { size: 64, font: SANS, weight: 400, maxW: 730, spacing: 0.22 });
    },
  },
  aws: {
    aspect: 1.7,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#232f3e');
      text(g, 'aws', 85, 38, { size: 76, font: SANS, weight: 800, maxW: 150 });
      // the smile arrow
      g.strokeStyle = pick(ink, '#ff9900');
      g.fillStyle = pick(ink, '#ff9900');
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(22, 72);
      g.quadraticCurveTo(85, 100, 140, 72);
      g.stroke();
      g.beginPath();
      g.moveTo(128, 64); g.lineTo(152, 66); g.lineTo(144, 88); g.closePath(); g.fill();
    },
  },
  bitdefender: {
    aspect: 5.2,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#ed1c24');
      text(g, 'Bitdefender', 260, 52, { size: 70, font: SANS, weight: 700, maxW: 500 });
    },
  },
  celsius: {
    aspect: 4.4,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'CELSIUS', 220, 50, { size: 80, font: BLACK, weight: 900, style: 'italic', maxW: 420 });
    },
  },

  // ---------------- McLaren ----------------
  mclaren: {
    aspect: 4.4,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#ff8000');
      const w = text(g, 'McLaren', 12, 60, { size: 74, font: SANS, weight: 700, maxW: 330, align: 'left', spacing: -0.01 });
      // speedmark: a crescent swoosh, fat at its right end, tapering to a point at the left
      const x = 12 + w - 16;
      g.beginPath();
      g.moveTo(x, 42);
      g.bezierCurveTo(x + 20, 18, x + 52, 8, x + 86, 10);
      g.bezierCurveTo(x + 90, 14, x + 90, 22, x + 84, 26);
      g.bezierCurveTo(x + 58, 22, x + 28, 28, x, 42);
      g.closePath();
      g.fill();
    },
  },
  okx: {
    aspect: 3.2,
    draw(g, ink) {
      // letters built on 3x3 grids of squares
      g.fillStyle = pick(ink, '#000000');
      const c = 25.5; // cell
      const glyphs = [
        null, // O: square ring drawn below
        [[0, 0], [0, 1], [0, 2], [1, 1], [2, 0], [2, 2]], // K
        [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], // X
      ];
      const y0 = 50 - (c * 3) / 2;
      glyphs.forEach((cells, i) => {
        const x0 = 22 + i * (c * 3 + 22);
        if (!cells) {
          g.fillRect(x0, y0, c * 3, c * 3);
          g.clearRect(x0 + c, y0 + c, c, c);
          return;
        }
        for (const [cx, cy] of cells) g.fillRect(x0 + cx * c, y0 + cy * c, c + 0.4, c + 0.4);
      });
    },
  },
  mastercard: {
    aspect: 1.62,
    draw(g, ink) {
      const r = 46;
      const a = [58, 50], b = [104, 50];
      if (ink) {
        g.fillStyle = ink;
        g.beginPath(); g.arc(...a, r, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(...b, r, 0, Math.PI * 2); g.fill();
        // thin gap tracing the right circle over the left
        g.globalCompositeOperation = 'destination-out';
        g.lineWidth = 3.5;
        g.beginPath(); g.arc(...b, r, Math.PI * 0.62, Math.PI * 1.38); g.stroke();
        g.globalCompositeOperation = 'source-over';
        return;
      }
      g.fillStyle = '#eb001b';
      g.beginPath(); g.arc(...a, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f79e1b';
      g.beginPath(); g.arc(...b, r, 0, Math.PI * 2); g.fill();
      g.save();
      g.beginPath(); g.arc(...a, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#ff5f00';
      g.beginPath(); g.arc(...b, r, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  },
  mastercardText: {
    aspect: 5.6,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'mastercard', 280, 46, { size: 76, font: SANS, weight: 600, maxW: 540 });
    },
  },
  google: {
    aspect: 3.0,
    draw(g, ink) {
      g.font = `500 80px ${GEO}`;
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      const cols = ['#4285f4', '#ea4335', '#fbbc05', '#4285f4', '#34a853', '#ea4335'];
      const letters = [...'Google'];
      const total = letters.reduce((s, l) => s + g.measureText(l).width, 0);
      const k = Math.min(1, 284 / total);
      g.save();
      g.translate((300 - total * k) / 2, 50 + 26 * k);
      g.scale(k, k);
      let x = 0;
      letters.forEach((l, i) => {
        g.fillStyle = ink ?? cols[i];
        g.fillText(l, x, 0);
        x += g.measureText(l).width;
      });
      g.restore();
    },
  },
  dell: {
    aspect: 2.6,
    draw(g, ink) {
      // DELL with the tilted E
      g.fillStyle = pick(ink, '#007db8');
      g.font = `900 78px ${SANS}`;
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      const ws = [...'DELL'].map((l) => g.measureText(l).width);
      const total = ws.reduce((s, v) => s + v, 0) + 12;
      const k = Math.min(1, 236 / total);
      g.save();
      g.translate((260 - total * k) / 2, 50 + 28 * k);
      g.scale(k, k);
      let x = 0;
      [...'DELL'].forEach((l, i) => {
        if (i === 1) {
          g.save();
          g.translate(x + ws[1] / 2 + 4, -28);
          g.rotate(-0.42);
          g.fillText(l, -ws[1] / 2, 28);
          g.restore();
          x += ws[1] + 12;
        } else {
          g.fillText(l, x, 0);
          x += ws[i];
        }
      });
      g.restore();
    },
  },
  monster: {
    aspect: 0.85,
    draw(g, ink) {
      // three ragged claw marks
      g.fillStyle = pick(ink, '#95d600');
      const claw = (x, top, sway) => {
        g.beginPath();
        g.moveTo(x - 4, top);
        g.lineTo(x + 6, top + 2);
        for (let i = 1; i <= 6; i++) {
          const y = top + i * ((96 - top) / 6);
          g.lineTo(x + 6 + (i % 2 ? sway : -sway * 0.4) + i * 0.6, y);
        }
        g.lineTo(x + 2, 98);
        for (let i = 5; i >= 1; i--) {
          const y = top + i * ((96 - top) / 6);
          g.lineTo(x - 5 + (i % 2 ? -sway * 0.3 : sway) + i * 0.4, y);
        }
        g.closePath();
        g.fill();
      };
      claw(18, 4, 3.5);
      claw(42, 8, 2.5);
      claw(66, 2, 3.2);
    },
  },
  gulf: {
    aspect: 1.4,
    draw(g, ink) {
      const cx = 70;
      g.fillStyle = pick(ink, '#002f87');
      g.beginPath(); g.arc(cx, 50, 48, 0, Math.PI * 2); g.fill();
      if (ink) g.globalCompositeOperation = 'destination-out';
      g.fillStyle = ink ? '#000' : '#f58025';
      g.beginPath(); g.arc(cx, 50, 42, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = pick(ink, '#002f87');
      text(g, 'Gulf', cx, 50, { size: 40, font: BLACK, weight: 900, maxW: 74 });
    },
  },
  velo: {
    aspect: 3.4,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'VELO', 170, 50, { size: 86, font: GEO, weight: 800, maxW: 320, spacing: 0.08 });
    },
  },
  estrella: {
    aspect: 4.2,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#c8102e');
      text(g, 'Estrella Galicia', 168, 50, { size: 54, font: SERIF, weight: 700, style: 'italic', maxW: 320 });
      text(g, '0,0', 380, 50, { size: 58, font: SANS, weight: 900, maxW: 70 });
    },
  },
  hilton: {
    aspect: 3.4,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#104c97');
      text(g, 'Hilton', 170, 50, { size: 84, font: SERIF, weight: 400, maxW: 320 });
    },
  },

  // ---------------- Mercedes ----------------
  mercedes: {
    aspect: 1,
    draw(g, ink) {
      // three-pointed star in a ring, each arm faceted light and dark like the chrome badge
      g.strokeStyle = chrome(g, ink, 5, 95);
      g.lineWidth = 5;
      g.beginPath(); g.arc(50, 50, 44, 0, Math.PI * 2); g.stroke();
      const R = 42, r = 6.5;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        const tip = [50 + Math.cos(a) * R, 50 + Math.sin(a) * R];
        for (const side of [-1, 1]) {
          const b = a + side * (Math.PI / 3);
          g.beginPath();
          g.moveTo(50, 50);
          g.lineTo(...tip);
          g.lineTo(50 + Math.cos(b) * r, 50 + Math.sin(b) * r);
          g.closePath();
          g.fillStyle = ink ?? (side < 0 ? '#f2f3f5' : '#9ea3a9');
          g.fill();
        }
      }
    },
  },
  petronas: {
    aspect: 4.8,
    draw(g, ink) {
      // drop-shaped emblem with a wave knocked out, then the wordmark
      const c = pick(ink, '#00a19c');
      g.fillStyle = c;
      g.beginPath(); g.ellipse(40, 50, 28, 40, 0, 0, Math.PI * 2); g.fill();
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(22, 64); g.bezierCurveTo(34, 30, 48, 74, 58, 36); g.stroke();
      g.restore();
      text(g, 'PETRONAS', 80, 52, { size: 64, font: SANS, weight: 800, maxW: 390, align: 'left', spacing: 0.04 });
    },
  },
  ineos: word('INEOS', '#111111', { aspect: 3.6, weight: 700, spacing: 0.22 }),
  microsoft: {
    aspect: 4.6,
    draw(g, ink) {
      const cols = ['#f25022', '#7fba00', '#00a4ef', '#ffb900'];
      [[10, 12], [52, 12], [10, 54], [52, 54]].forEach(([x, y], i) => {
        g.fillStyle = ink ?? cols[i];
        g.fillRect(x, y, 38, 38);
      });
      g.fillStyle = pick(ink, '#737373');
      text(g, 'Microsoft', 108, 52, { size: 64, font: SANS, weight: 600, maxW: 340, align: 'left' });
    },
  },
  crowdstrike: word('CROWDSTRIKE', '#fc0000', { aspect: 6.2, weight: 800, font: BLACK }),
  ubs: word('UBS', '#e60000', { aspect: 2.2, font: SERIF, weight: 700, size: 90 }),
  amg: word('AMG', '#111111', { aspect: 2.6, font: BLACK, weight: 900, style: 'italic', size: 90 }),

  // ---------------- Aston Martin ----------------
  aston: {
    aspect: 3,
    draw(g, ink) {
      // feathered wings sweeping out and up from a name plate
      const c = pick(ink, '#e8eaea');
      g.fillStyle = c;
      const feathers = 7;
      for (const s of [-1, 1]) {
        for (let i = 0; i < feathers; i++) {
          const y = 22 + i * 6.4;
          const len = 134 - i * 16; // upper feathers reach furthest
          const x0 = 150 + s * 10, x1 = 150 + s * (10 + len);
          const lift = 16 - i * 1.6; // tips sweep up
          const t = 4.4; // feather thickness at the root, tapering to a point
          const mx = 150 + s * (10 + len * 0.55);
          g.beginPath();
          g.moveTo(x0, y);
          g.quadraticCurveTo(mx, y - lift * 0.15, x1, y - lift);
          g.quadraticCurveTo(mx, y + t * 0.8 - lift * 0.1, x0, y + t);
          g.closePath(); g.fill();
        }
      }
      // name plate: knocked-out lettering on a solid bar
      rr(g, 92, 66, 116, 22, 2); g.fill();
      g.save();
      g.globalCompositeOperation = 'destination-out';
      text(g, 'ASTON MARTIN', 150, 77, { size: 15, font: SANS, weight: 700, maxW: 104, spacing: 0.14 });
      g.restore();
    },
  },
  aramco: {
    aspect: 4,
    draw(g, ink) {
      // eight-point star in blue and green, then the wordmark
      for (let k = 0; k < 2; k++) {
        g.fillStyle = ink ?? (k ? '#84bd00' : '#00a3e0');
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + k * (Math.PI / 8);
          const r = i % 2 ? 16 : 40;
          g.lineTo(46 + Math.cos(a) * r, 50 + Math.sin(a) * r);
        }
        g.closePath(); g.fill();
      }
      g.fillStyle = pick(ink, '#00a3e0');
      text(g, 'aramco', 100, 50, { size: 76, font: SANS, weight: 700, maxW: 290, align: 'left' });
    },
  },
  honda: {
    aspect: 2.6,
    draw(g, ink) {
      // H in a flared frame, then the wordmark
      const c = pick(ink, '#cc0000');
      g.strokeStyle = c; g.fillStyle = c;
      g.lineWidth = 6;
      g.lineJoin = 'round';
      g.beginPath(); g.moveTo(6, 8); g.lineTo(80, 8); g.lineTo(72, 92); g.lineTo(14, 92); g.closePath(); g.stroke();
      g.beginPath();
      g.moveTo(20, 18); g.lineTo(32, 18); g.lineTo(32, 44); g.lineTo(54, 44); g.lineTo(54, 18); g.lineTo(66, 18);
      g.lineTo(62, 82); g.lineTo(52, 82); g.lineTo(52, 56); g.lineTo(34, 56); g.lineTo(34, 82); g.lineTo(24, 82);
      g.closePath(); g.fill();
      text(g, 'HONDA', 176, 50, { size: 54, font: BLACK, weight: 900, maxW: 166 });
    },
  },
  valvoline: {
    aspect: 4.4,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#0a2d82');
      g.beginPath(); g.moveTo(4, 10); g.lineTo(26, 10); g.lineTo(42, 66); g.lineTo(36, 90); g.closePath(); g.fill();
      g.fillStyle = pick(ink, '#e31837');
      g.beginPath(); g.moveTo(80, 10); g.lineTo(58, 10); g.lineTo(42, 66); g.lineTo(48, 90); g.closePath(); g.fill();
      g.fillStyle = pick(ink, '#0a2d82');
      text(g, 'Valvoline', 94, 52, { size: 66, font: SANS, weight: 800, style: 'italic', maxW: 340, align: 'left' });
    },
  },
  coinbase: {
    aspect: 4.4,
    draw(g, ink) {
      const c = pick(ink, '#0052ff');
      g.fillStyle = c;
      g.beginPath(); g.arc(44, 50, 40, 0, Math.PI * 2); g.fill();
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(44, 50, 24, 0, Math.PI * 2); g.fill();
      g.restore();
      rr(g, 35, 41, 18, 18, 3); g.fill(); // the square in the middle of the ring
      text(g, 'coinbase', 98, 48, { size: 70, font: SANS, weight: 700, maxW: 330, align: 'left' });
    },
  },

  // ---------------- Alpine ----------------
  alpine: {
    aspect: 3.6,
    draw(g, ink) {
      // the "A" mark: two legs meeting in a point, the crossbar an arrow driving to the right
      g.fillStyle = pick(ink, '#2173f6');
      g.beginPath();
      g.moveTo(4, 92); g.lineTo(38, 6); g.lineTo(52, 6); g.lineTo(86, 92); g.lineTo(70, 92); g.lineTo(45, 28);
      g.lineTo(20, 92); g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(26, 60); g.lineTo(78, 60); g.lineTo(72, 50); g.lineTo(94, 66); g.lineTo(72, 82); g.lineTo(78, 72);
      g.lineTo(22, 72); g.closePath(); g.fill();
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'ALPINE', 110, 52, { size: 60, font: GEO, weight: 700, maxW: 240, align: 'left', spacing: 0.2 });
    },
  },
  bwt: word('BWT', '#e6007e', { aspect: 2.2, font: BLACK, weight: 900, size: 92 }),
  mercadolibre: {
    aspect: 3.6,
    draw(g, ink) {
      // navy wordmark on a yellow pill
      if (ink) {
        g.fillStyle = ink;
        rr(g, 4, 10, 352, 80, 40); g.fill();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
      } else {
        g.fillStyle = '#ffe600';
        rr(g, 4, 10, 352, 80, 40); g.fill();
        g.fillStyle = '#2d3277';
      }
      text(g, 'mercado libre', 180, 48, { size: 52, font: SANS, weight: 700, maxW: 300 });
      g.globalCompositeOperation = 'source-over';
    },
  },
  kappa: word('Kappa', '#111111', { aspect: 3, weight: 800, style: 'italic' }),

  // ---------------- Williams ----------------
  williams: {
    aspect: 4.2,
    draw(g, ink) {
      // the W mark: two overlapping chevrons in light and deep blue, then the wordmark
      const stroke = (x0, colour) => {
        g.fillStyle = colour;
        g.beginPath();
        g.moveTo(x0, 14); g.lineTo(x0 + 15, 14); g.lineTo(x0 + 29, 70); g.lineTo(x0 + 43, 14); g.lineTo(x0 + 58, 14);
        g.lineTo(x0 + 36, 88); g.lineTo(x0 + 22, 88);
        g.closePath(); g.fill();
      };
      stroke(4, pick(ink, '#00a0de'));
      stroke(36, pick(ink, '#1868db'));
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'WILLIAMS', 112, 52, { size: 54, font: SANS, weight: 700, maxW: 300, align: 'left', spacing: 0.16 });
    },
  },
  atlassian: {
    aspect: 5.2,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#0052cc');
      // two-stroke triangle mark
      g.beginPath(); g.moveTo(10, 92); g.lineTo(30, 52); g.lineTo(42, 70); g.lineTo(32, 92); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(38, 10); g.lineTo(84, 92); g.lineTo(62, 92); g.lineTo(32, 36); g.closePath(); g.fill();
      text(g, 'ATLASSIAN', 100, 52, { size: 62, font: SANS, weight: 700, maxW: 410, align: 'left', spacing: 0.04 });
    },
  },
  barclays: word('BARCLAYS', '#00aeef', { aspect: 4.6, weight: 600, spacing: 0.08 }),
  duracell: {
    aspect: 4.2,
    draw(g, ink) {
      if (!ink) {
        // copper cap and black body, like the battery
        g.fillStyle = '#b8722c'; rr(g, 2, 2, 416, 30, 6); g.fill();
        g.fillStyle = '#111'; rr(g, 2, 28, 416, 70, 6); g.fill();
      }
      g.fillStyle = ink ?? '#ffffff';
      text(g, 'DURACELL', 210, ink ? 50 : 63, { size: ink ? 82 : 56, font: BLACK, weight: 900, maxW: 390 });
    },
  },
  komatsu: word('KOMATSU', '#140a9a', { aspect: 4.6, font: BLACK, weight: 900 }),
  kraken: word('kraken', '#7132f5', { aspect: 3.4, weight: 800 }),

  // ---------------- Racing Bulls ----------------
  racingbulls: {
    aspect: 1.75,
    draw(g, ink) {
      bullsAndSun(g, ink, '#e30a17', '#ffcc00');
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'RACING BULLS', 87.5, 83, { size: 20, font: BLACK, weight: 900, maxW: 150, spacing: 0.08 });
    },
  },
  visa: word('VISA', '#1a1f71', { aspect: 2.6, font: BLACK, weight: 900, style: 'italic', size: 92 }),
  cashapp: {
    aspect: 3.8,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#00d632');
      rr(g, 4, 6, 88, 88, 22); g.fill();
      g.save();
      g.globalCompositeOperation = 'destination-out';
      text(g, '$', 48, 50, { size: 76, font: SANS, weight: 900 });
      g.restore();
      g.fillStyle = pick(ink, '#111111');
      text(g, 'Cash App', 106, 50, { size: 60, font: SANS, weight: 800, maxW: 270, align: 'left' });
    },
  },

  // ---------------- Haas ----------------
  haas: {
    aspect: 3,
    draw(g, ink) {
      g.fillStyle = pick(ink, '#e6002d');
      text(g, 'HAAS', 150, 38, { size: 78, font: BLACK, weight: 900, style: 'italic', maxW: 280, spacing: 0.02 });
      g.fillStyle = pick(ink, '#ffffff');
      text(g, 'F1 TEAM', 150, 86, { size: 22, font: SANS, weight: 800, maxW: 200, spacing: 0.5 });
    },
  },
  tgr: {
    aspect: 2.6,
    draw(g, ink) {
      // GR-style badge: heavy italic letters over a red slash
      g.fillStyle = ink ? ink : '#eb0a1e';
      g.beginPath(); g.moveTo(30, 82); g.lineTo(250, 82); g.lineTo(240, 96); g.lineTo(20, 96); g.closePath(); g.fill();
      g.fillStyle = pick(ink, '#111111');
      text(g, 'TGR', 130, 42, { size: 84, font: BLACK, weight: 900, style: 'italic', maxW: 240, spacing: 0.02 });
    },
  },
  moneygram: word('MoneyGram', '#da291c', { aspect: 4.4, weight: 800 }),

  // ---------------- Audi ----------------
  audi: {
    aspect: 1.9,
    draw(g, ink) {
      // four interlocking chrome rings, each passing over its right-hand neighbour at the top
      const R = 27, cx = (i) => 31 + i * 42.5;
      const lw = 6.5;
      const ring = (i, a0 = 0, a1 = Math.PI * 2) => {
        g.beginPath(); g.arc(cx(i), 50, R, a0, a1);
        // dark (or knocked-out) edge, then the chrome band
        if (ink) {
          g.save(); g.globalCompositeOperation = 'destination-out';
          g.lineWidth = lw + 3; g.stroke(); g.restore();
          g.strokeStyle = ink;
        } else {
          g.lineWidth = lw + 2; g.strokeStyle = '#3a3d42'; g.stroke();
          g.strokeStyle = chrome(g, null, 50 - R, 50 + R);
        }
        g.lineWidth = lw; g.stroke();
      };
      for (let i = 0; i < 4; i++) ring(i);
      // re-draw where the left ring crosses back over, so they weave
      const a = Math.atan2(Math.sqrt(R * R - 21.25 * 21.25), 21.25);
      for (let i = 0; i < 3; i++) ring(i, -a - 0.28, -a + 0.28);
    },
  },
  revolut: word('Revolut', '#191c1f', { aspect: 3.6, weight: 700 }),
  adidas: {
    aspect: 2.4,
    draw(g, ink) {
      // three slanted stripes of rising height, wordmark below
      g.fillStyle = pick(ink, '#000000');
      [[78, 50], [104, 34], [130, 18]].forEach(([x, top]) => {
        g.beginPath();
        g.moveTo(x, 66); g.lineTo(x + 20, 66); g.lineTo(x + 20 + (66 - top) * 0.55, top); g.lineTo(x + (66 - top) * 0.55, top);
        g.closePath(); g.fill();
      });
      text(g, 'adidas', 120, 84, { size: 34, font: GEO, weight: 700, maxW: 140 });
    },
  },

  // ---------------- Cadillac ----------------
  cadillac: {
    aspect: 0.82,
    draw(g, ink) {
      // monochrome crest: chrome shield outline, quartered, with barred and plain quarters
      const w = 82;
      const shield = () => {
        g.beginPath();
        g.moveTo(5, 4); g.lineTo(w - 5, 4); g.lineTo(w - 9, 60);
        g.quadraticCurveTo(w - 12, 84, w / 2, 97);
        g.quadraticCurveTo(12, 84, 9, 60);
        g.closePath();
      };
      const light = pick(ink, '#d9dce0');
      const dark = '#16181c';
      if (!ink) { g.fillStyle = dark; shield(); g.fill(); }
      g.save();
      shield(); g.clip();
      g.fillStyle = light;
      const mx = w / 2, my = 50;
      // top-left and bottom-right: horizontal bars
      for (let k = 0; k < 4; k++) {
        g.fillRect(5, 8 + k * 11, mx - 7, 5.5);
        g.fillRect(mx + 2, my + 4 + k * 11, mx - 7, 5.5);
      }
      // top-right and bottom-left: a solid block with an open corner square
      g.fillRect(mx + 2, 4, mx, my - 6);
      g.fillRect(0, my + 2, mx - 2, 50);
      if (ink) g.globalCompositeOperation = 'destination-out';
      g.fillStyle = ink ? '#000' : dark;
      g.fillRect(mx + 10, 12, 14, 14);
      g.fillRect(mx - 24, my + 10, 14, 14);
      g.globalCompositeOperation = 'source-over';
      g.restore();
      g.strokeStyle = chrome(g, ink, 4, 97);
      g.lineWidth = 4.5;
      shield(); g.stroke();
    },
  },
  cadillacText: word('CADILLAC', '#c9ccd1', { aspect: 5.4, weight: 600, spacing: 0.3 }),
  tommy: {
    aspect: 4.8,
    draw(g, ink) {
      // flag: navy and red panels around a white band, then the wordmark
      if (ink) {
        g.fillStyle = ink;
        g.fillRect(6, 24, 22, 52); g.fillRect(56, 24, 22, 52);
        g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(6, 24, 72, 52);
      } else {
        g.fillStyle = '#ffffff'; g.fillRect(6, 24, 72, 52);
        g.fillStyle = '#002d62'; g.fillRect(6, 24, 22, 52);
        g.fillStyle = '#cc0c2f'; g.fillRect(56, 24, 22, 52);
      }
      g.fillStyle = pick(ink, '#002d62');
      text(g, 'TOMMY HILFIGER', 92, 52, { size: 46, font: SANS, weight: 700, maxW: 380, align: 'left', spacing: 0.06 });
    },
  },
  twg: word('TWG', '#111111', { aspect: 2.4, weight: 700, spacing: 0.18, size: 86 }),
};

/** Draw logo `id` into box (x, y, w, h) of context `g`, single-colour if `ink` is set. */
export function drawLogo(g, id, x, y, w, h, ink = null) {
  const logo = LOGOS[id];
  if (!logo) throw new Error(`Unknown logo "${id}"`);
  // fit the logo's natural box inside w x h, centred
  const k = Math.min(h / 100, w / (100 * logo.aspect));
  const lw = 100 * logo.aspect * k, lh = 100 * k;
  // Draw on a scratch canvas at the target's resolution first, so the logos' knock-outs
  // (destination-out) cut only the logo, not whatever is already drawn underneath.
  const m = g.getTransform();
  const res = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d), 1);
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(lw * res));
  off.height = Math.max(1, Math.ceil(lh * res));
  const o = off.getContext('2d');
  o.scale(off.width / (100 * logo.aspect), off.height / 100);
  logo.draw(o, ink);
  g.drawImage(off, x + (w - lw) / 2, y + (h - lh) / 2, lw, lh);
}
