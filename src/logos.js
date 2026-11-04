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

// A charging bull facing right, head down and horns forward, in a 100 x 60 box.
function bullPath(g) {
  g.beginPath();
  g.moveTo(15, 20); // tail root
  g.bezierCurveTo(10, 14, 6, 9, 3, 9); // tail swinging up and back
  g.lineTo(1, 12);
  g.bezierCurveTo(5, 13, 8, 17, 12, 24);
  g.bezierCurveTo(12, 30, 14, 36, 20, 41); // rump
  g.lineTo(3, 55); // hind leg kicking back
  g.lineTo(5, 59);
  g.lineTo(30, 47);
  g.bezierCurveTo(42, 50, 54, 50, 62, 48); // belly
  g.lineTo(62, 58); // folded foreleg
  g.lineTo(68, 58);
  g.lineTo(70, 49);
  g.lineTo(95, 58); // foreleg reaching forward
  g.lineTo(98, 54);
  g.lineTo(76, 43);
  g.bezierCurveTo(80, 46, 86, 50, 92, 49); // throat to muzzle
  g.bezierCurveTo(95, 46, 94, 40, 90, 34); // face
  g.lineTo(88, 30);
  g.bezierCurveTo(92, 26, 96, 20, 99, 12); // horn sweeping forward
  g.bezierCurveTo(94, 18, 88, 22, 82, 24);
  g.bezierCurveTo(76, 16, 68, 10, 58, 7); // neck up to the hump
  g.bezierCurveTo(44, 3, 28, 6, 20, 12); // back
  g.closePath();
}

// A rearing horse facing left, in a 60 x 80 box.
function horsePath(g) {
  g.beginPath();
  g.moveTo(16, 1); // ear
  g.lineTo(20, 7);
  g.bezierCurveTo(26, 10, 30, 18, 32, 26); // crest of the neck
  g.bezierCurveTo(36, 30, 42, 34, 46, 40); // back to the rump
  g.bezierCurveTo(50, 30, 54, 18, 56, 6); // tail flung up
  g.bezierCurveTo(60, 10, 60, 22, 56, 32);
  g.bezierCurveTo(54, 38, 52, 42, 50, 46);
  g.bezierCurveTo(52, 52, 54, 60, 58, 74); // kicking hind leg
  g.lineTo(52, 78);
  g.bezierCurveTo(50, 70, 46, 62, 42, 56);
  g.bezierCurveTo(38, 60, 36, 68, 38, 78); // standing hind leg
  g.lineTo(31, 79);
  g.bezierCurveTo(30, 68, 30, 60, 30, 54);
  g.bezierCurveTo(26, 52, 24, 48, 22, 42); // belly to chest
  g.lineTo(12, 42); // lower foreleg, raised
  g.lineTo(10, 52);
  g.lineTo(5, 50);
  g.lineTo(8, 37);
  g.lineTo(20, 36);
  g.lineTo(18, 32);
  g.lineTo(8, 30); // upper foreleg, raised high
  g.lineTo(4, 35);
  g.lineTo(1, 31);
  g.lineTo(7, 24);
  g.lineTo(18, 26);
  g.bezierCurveTo(17, 22, 15, 20, 12, 19); // throat
  g.lineTo(4, 18); // muzzle
  g.bezierCurveTo(2, 15, 4, 11, 8, 9);
  g.bezierCurveTo(10, 6, 12, 4, 16, 1); // forehead
  g.closePath();
}

/**
 * Two bulls charging at a sun, in the top ~70% of a 175 x 100 box. The sun keeps its
 * colour even in single-colour use, so the bulls still read against it.
 */
function bullsAndSun(g, ink, bull, sun) {
  g.fillStyle = sun;
  g.beginPath();
  g.arc(87.5, 32, 21, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = pick(ink, bull);
  for (const [x, sx] of [[5, 1], [170, -1]]) {
    g.save();
    g.translate(x, 16);
    g.scale(0.7 * sx, 0.7);
    bullPath(g);
    g.fill();
    g.restore();
  }
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
      text(g, 'Red Bull', 87.5, 80, { size: 30, font: GEO, weight: 800, maxW: 150, stretch: 'condensed' });
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
      // shield: tricolore band, yellow field with a black prancing horse, "S F" below
      const w = 72;
      const shield = () => {
        g.beginPath();
        g.moveTo(3, 3); g.lineTo(w - 3, 3); g.lineTo(w - 3, 60);
        g.quadraticCurveTo(w - 3, 86, w / 2, 98);
        g.quadraticCurveTo(3, 86, 3, 60);
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
        g.fillStyle = '#fff200'; g.fillRect(0, 0, w, 100);
        g.fillStyle = '#009246'; g.fillRect(0, 0, w / 3, 13);
        g.fillStyle = '#ffffff'; g.fillRect(w / 3, 0, w / 3, 13);
        g.fillStyle = '#ce2b37'; g.fillRect((2 * w) / 3, 0, w / 3, 13);
        g.restore();
      }
      g.fillStyle = ink ? '#000' : '#111';
      g.save();
      g.translate(17, 15);
      g.scale(0.66, 0.66);
      horsePath(g); g.fill();
      g.restore();
      text(g, 'S', w / 2 - 12, 78, { size: 20, font: SERIF, weight: 700 });
      text(g, 'F', w / 2 + 12, 78, { size: 20, font: SERIF, weight: 700 });
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
      const w = text(g, 'McLaren', 18, 58, { size: 72, font: SANS, weight: 700, maxW: 330, align: 'left' });
      // speedmark swoosh trailing off the top right of the wordmark
      const x = 26 + w;
      g.beginPath();
      g.moveTo(x, 36);
      g.bezierCurveTo(x + 30, 6, x + 66, 6, x + 80, 12);
      g.bezierCurveTo(x + 58, 14, x + 30, 24, x + 8, 46);
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
      // three-pointed star in a ring
      const c = pick(ink, '#c3c7cc');
      g.strokeStyle = c;
      g.lineWidth = 6;
      g.beginPath(); g.arc(50, 50, 45, 0, Math.PI * 2); g.stroke();
      g.fillStyle = c;
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        g.lineTo(50 + Math.cos(a) * 42, 50 + Math.sin(a) * 42);
        g.lineTo(50 + Math.cos(a + Math.PI / 3) * 8, 50 + Math.sin(a + Math.PI / 3) * 8);
      }
      g.closePath(); g.fill();
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
      // feathered wings either side of a name plate
      const c = pick(ink, '#e8eaea');
      g.fillStyle = c;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const y = 16 + i * 10, len = 132 - i * 28;
          g.beginPath();
          g.moveTo(150 + s * 26, y + 8);
          g.lineTo(150 + s * (26 + len), y - 4 + i * 2);
          g.lineTo(150 + s * (20 + len), y + 2 + i * 2);
          g.lineTo(150 + s * 26, y + 14);
          g.closePath(); g.fill();
        }
      }
      g.fillRect(96, 58, 108, 4);
      g.fillRect(96, 88, 108, 4);
      text(g, 'ASTON MARTIN', 150, 75, { size: 22, font: SANS, weight: 700, maxW: 104, spacing: 0.12 });
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
    aspect: 3.4,
    draw(g, ink) {
      // the arrow "A", then the wordmark
      g.fillStyle = pick(ink, '#0090ff');
      g.beginPath();
      g.moveTo(4, 92); g.lineTo(44, 6); g.lineTo(84, 92); g.lineTo(66, 92); g.lineTo(44, 44);
      g.lineTo(30, 74); g.lineTo(52, 74); g.lineTo(46, 88); g.lineTo(22, 88); g.lineTo(20, 92);
      g.closePath(); g.fill();
      text(g, 'ALPINE', 98, 52, { size: 62, font: SANS, weight: 800, maxW: 236, align: 'left', spacing: 0.12 });
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
    aspect: 4,
    draw(g, ink) {
      // W from two chevrons, then the wordmark
      g.fillStyle = pick(ink, '#00a3e0');
      for (const x0 of [4, 46]) {
        g.beginPath();
        g.moveTo(x0, 12); g.lineTo(x0 + 16, 12); g.lineTo(x0 + 30, 62); g.lineTo(x0 + 44, 12); g.lineTo(x0 + 60, 12);
        g.lineTo(x0 + 38, 90); g.lineTo(x0 + 22, 90);
        g.closePath(); g.fill();
      }
      text(g, 'WILLIAMS', 118, 52, { size: 58, font: SANS, weight: 800, maxW: 276, align: 'left', spacing: 0.06 });
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
      g.fillStyle = pick(ink, '#1c3fd0');
      text(g, 'RACING BULLS', 87.5, 82, { size: 22, font: SANS, weight: 900, maxW: 160, spacing: 0.06 });
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
      text(g, 'HAAS', 150, 44, { size: 82, font: BLACK, weight: 900, maxW: 284, spacing: 0.04 });
      g.fillRect(20, 84, 260, 8);
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
      g.strokeStyle = pick(ink, '#c0c3c6');
      g.lineWidth = 7;
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.arc(31 + i * 42.5, 50, 27, 0, Math.PI * 2); g.stroke();
      }
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
      // modern monochrome crest: shield outline over a chequer of blocks
      const c = pick(ink, '#c9ccd1');
      const w = 82;
      const shield = () => {
        g.beginPath();
        g.moveTo(6, 4); g.lineTo(w - 6, 4); g.lineTo(w - 10, 62);
        g.quadraticCurveTo(w / 2 + 6, 90, w / 2, 97);
        g.quadraticCurveTo(w / 2 - 6, 90, 10, 62);
        g.closePath();
      };
      g.save();
      shield(); g.clip();
      g.fillStyle = c;
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < 3; k++) if ((r + k) % 2 === 0) g.fillRect(6 + k * 23.3, 4 + r * 24, 23.3, 24);
      }
      g.restore();
      g.strokeStyle = c;
      g.lineWidth = 5;
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
  g.save();
  g.translate(x + (w - 100 * logo.aspect * k) / 2, y + (h - 100 * k) / 2);
  g.scale(k, k);
  logo.draw(g, ink);
  g.restore();
}
