/**
 * Generates the 15 CWO cinematic intro frames.
 *
 *   node scripts/gen-cwo-intro.mjs
 *
 * Each frame is a 2:1 cyberpunk plate that gets masked inside the CWO
 * letterforms, so they are drawn punchy — dark base, neon accents, high
 * contrast — and rasterised to PNG with a 256-colour palette so the whole
 * set stays small enough to ship.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "..", "public", "cwo-intro");

const W = 1024;
const H = 512;

/* ---- palette ---- */
const DEEP = "#05030c";
const VIOLET = "#a855f7";
const FUCHSIA = "#ff2fb9";
const CYAN = "#22d3ee";
const AMBER = "#fbbf24";
const WHITE = "#ffffff";

/* deterministic PRNG so the set is reproducible */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x5eed);
const range = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

/* ---- svg helpers ---- */
const rect = (x, y, w, h, fill, o = 1, extra = "") =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(
    1,
  )}" fill="${fill}" opacity="${o}" ${extra}/>`;

const line = (x1, y1, x2, y2, stroke, w = 1, o = 1) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(
    1,
  )}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${w}" opacity="${o}"/>`;

const circle = (cx, cy, r, fill, o = 1, extra = "") =>
  `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(
    1,
  )}" fill="${fill}" opacity="${o}" ${extra}/>`;

const ring = (cx, cy, r, stroke, w = 2, o = 1) =>
  `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(
    1,
  )}" fill="none" stroke="${stroke}" stroke-width="${w}" opacity="${o}"/>`;

function wrap(body, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}<rect width="${W}" height="${H}" fill="${DEEP}"/>${body}</svg>`;
}

const glow = (id, color, blur = 18) =>
  `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter>`;

/* ---- the 15 frames ---- */

const frames = [];

/* 1 — TV static */
frames.push(() => {
  let b = "";
  for (let i = 0; i < 1400; i++) {
    const g = Math.floor(range(40, 255));
    b += rect(range(0, W), range(0, H), range(1, 4), range(1, 3), `rgb(${g},${g},${g})`, range(0.15, 0.5));
  }
  b += rect(0, 0, W, H, VIOLET, 0.12);
  return wrap(b);
});

/* 2 — glitch bars */
frames.push(() => {
  let b = "";
  for (let i = 0; i < 46; i++) {
    const y = range(0, H);
    const h = range(3, 26);
    const x = range(-120, W * 0.6);
    const c = pick([FUCHSIA, CYAN, WHITE, VIOLET]);
    b += rect(x, y, range(120, 620), h, c, range(0.2, 0.85));
  }
  b += rect(0, H * 0.46, W, 3, CYAN, 0.7);
  b += rect(0, H * 0.53, W, 2, FUCHSIA, 0.5);
  return wrap(b);
});

/* 3 — neon perspective grid */
frames.push(() => {
  const hz = H * 0.46;
  let b = "";
  for (let i = -14; i <= 14; i++) {
    b += line(W / 2 + i * 26, hz, W / 2 + i * 220, H, VIOLET, 1.4, 0.5);
  }
  for (let i = 1; i <= 12; i++) {
    const y = hz + Math.pow(i / 12, 2.2) * (H - hz);
    b += line(0, y, W, y, FUCHSIA, 1.3, 0.42);
  }
  b += rect(0, hz - 2, W, 4, CYAN, 0.85, 'filter="url(#g1)"');
  b += circle(W / 2, hz, 70, CYAN, 0.16, 'filter="url(#g1)"');
  return wrap(b, glow("g1", CYAN, 22));
});

/* 4 — plasma swirl */
frames.push(() => {
  let b = "";
  const cx = W * 0.5;
  const cy = H * 0.5;
  for (let i = 0; i < 30; i++) {
    const r = 18 + i * 17;
    const o = 0.5 * (1 - i / 32);
    const c = i % 3 === 0 ? CYAN : i % 3 === 1 ? FUCHSIA : VIOLET;
    b += `<ellipse cx="${cx}" cy="${cy}" rx="${(r * range(0.9, 1.5)).toFixed(
      1,
    )}" ry="${(r * range(0.55, 1.05)).toFixed(1)}" fill="none" stroke="${c}" stroke-width="${range(
      1.5,
      5,
    ).toFixed(1)}" opacity="${o.toFixed(2)}" transform="rotate(${range(
      -40,
      40,
    ).toFixed(1)} ${cx} ${cy})"/>`;
  }
  b += circle(cx, cy, 46, WHITE, 0.5, 'filter="url(#g2)"');
  return wrap(b, glow("g2", FUCHSIA, 26));
});

/* 5 — data rain */
frames.push(() => {
  let b = "";
  for (let c = 0; c < 46; c++) {
    const x = (c / 46) * W + range(-6, 6);
    const count = Math.floor(range(4, 12));
    for (let i = 0; i < count; i++) {
      const y = range(0, H);
      const h = range(8, 30);
      const o = range(0.25, 0.95);
      const col = i % 4 === 0 ? WHITE : i % 3 === 0 ? CYAN : FUCHSIA;
      b += rect(x, y, range(4, 11), h, col, o);
    }
  }
  return wrap(b);
});

/* 6 — chromatic rings */
frames.push(() => {
  let b = "";
  const cols = [CYAN, FUCHSIA, VIOLET, AMBER];
  for (let i = 0; i < 7; i++) {
    const c = cols[i % cols.length];
    const cx = range(W * 0.2, W * 0.8);
    const cy = range(H * 0.2, H * 0.8);
    const r = range(60, 220);
    b += ring(cx, cy, r, c, range(3, 9), range(0.3, 0.8));
  }
  b += rect(0, 0, W, H, VIOLET, 0.14);
  return wrap(b, glow("g3", VIOLET, 30));
});

/* 7 — wireframe torus */
frames.push(() => {
  let b = "";
  const cx = W / 2;
  const cy = H / 2;
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const rx = 190 - Math.abs(t - 0.5) * 120;
    const ry = 190 - Math.abs(t - 0.5) * 120;
    const c = i % 2 === 0 ? CYAN : FUCHSIA;
    b += `<ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(
      1,
    )}" fill="none" stroke="${c}" stroke-width="1.8" opacity="${(
      0.25 +
      0.55 * (1 - Math.abs(t - 0.5) * 2)
    ).toFixed(2)}" transform="rotate(${(i * 22.5).toFixed(1)} ${cx} ${cy})"/>`;
  }
  b += circle(cx, cy, 40, WHITE, 0.4, 'filter="url(#g4)"');
  return wrap(b, glow("g4", CYAN, 24));
});

/* 8 — radiating data burst */
frames.push(() => {
  let b = "";
  const cx = W / 2;
  const cy = H / 2;
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + range(-0.02, 0.02);
    const r0 = range(20, 90);
    const r1 = range(200, 620);
    const c = i % 3 === 0 ? CYAN : i % 3 === 1 ? FUCHSIA : WHITE;
    b += line(
      cx + Math.cos(a) * r0,
      cy + Math.sin(a) * r0 * 0.6,
      cx + Math.cos(a) * r1,
      cy + Math.sin(a) * r1 * 0.6,
      c,
      range(0.8, 3.2),
      range(0.2, 0.85),
    );
  }
  b += circle(cx, cy, 120, FUCHSIA, 0.3, 'filter="url(#g5)"');
  return wrap(b, glow("g5", FUCHSIA, 34));
});

/* 9 — scanline sweep */
frames.push(() => {
  let b = "";
  for (let y = 0; y < H; y += 8) b += line(0, y, W, y, VIOLET, 1, 0.16);
  b += rect(0, H * 0.3, W, 90, CYAN, 0.35, 'filter="url(#g6)"');
  b += rect(0, H * 0.32, W, 3, WHITE, 0.8);
  b += rect(0, H * 0.47, W, 2, CYAN, 0.6);
  return wrap(b, glow("g6", CYAN, 26));
});

/* 10 — fractal circles */
frames.push(() => {
  let b = "";
  const rand2 = mulberry32(99);
  const branch = (x, y, r, depth) => {
    if (depth <= 0 || r < 4) return;
    const c = depth % 2 === 0 ? FUCHSIA : CYAN;
    b += ring(x, y, r, c, 2, 0.16 + depth * 0.07);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand2() * 1.4;
      const d = r * 0.52;
      branch(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.56, depth - 1);
    }
  };
  branch(W / 2, H / 2, 200, 5);
  return wrap(b, glow("g7", VIOLET, 20));
});

/* 11 — lightning */
frames.push(() => {
  let b = "";
  for (let i = 0; i < 5; i++) {
    let x = range(0, W);
    let y = 0;
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    while (y < H) {
      x += range(-46, 46);
      y += range(18, 52);
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    const c = i % 2 === 0 ? CYAN : FUCHSIA;
    b += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${range(
      1.4,
      3.4,
    ).toFixed(1)}" opacity="${range(0.5, 0.95).toFixed(2)}"/>`;
  }
  b += rect(0, 0, W, H, VIOLET, 0.12);
  return wrap(b, glow("g8", CYAN, 18));
});

/* 12 — binary columns */
frames.push(() => {
  let b = "";
  for (let c = 0; c < 64; c++) {
    const x = (c / 64) * W + 4;
    for (let i = 0; i < 16; i++) {
      if (rand() > 0.45) continue;
      const y = (i / 16) * H + range(-4, 4);
      const on = rand() > 0.72;
      b += rect(x, y, 9, 14, on ? WHITE : i % 3 === 0 ? CYAN : FUCHSIA, range(0.3, 0.9));
    }
  }
  b += rect(0, 0, W, H, DEEP, 0.25);
  return wrap(b);
});

/* 13 — tunnel */
frames.push(() => {
  let b = "";
  const cx = W / 2;
  const cy = H / 2;
  for (let i = 12; i >= 1; i--) {
    const s = (i / 12) * 520;
    const c = i % 2 === 0 ? FUCHSIA : CYAN;
    b += `<rect x="${(cx - s / 2).toFixed(1)}" y="${(cy - s / 3).toFixed(
      1,
    )}" width="${s.toFixed(1)}" height="${((s * 2) / 3).toFixed(
      1,
    )}" fill="none" stroke="${c}" stroke-width="${(1 + i * 0.35).toFixed(
      1,
    )}" opacity="${(0.12 + i * 0.05).toFixed(2)}"/>`;
  }
  b += circle(cx, cy, 34, WHITE, 0.55, 'filter="url(#g9)"');
  return wrap(b, glow("g9", WHITE, 20));
});

/* 14 — shockwave */
frames.push(() => {
  let b = "";
  const cx = W / 2;
  const cy = H / 2;
  for (let i = 0; i < 9; i++) {
    const r = 40 + i * 72;
    const c = i % 2 === 0 ? FUCHSIA : CYAN;
    b += ring(cx, cy, r, c, range(2, 7), (0.75 - i * 0.07).toFixed(2));
  }
  b += circle(cx, cy, 60, WHITE, 0.35, 'filter="url(#g10)"');
  return wrap(b, glow("g10", FUCHSIA, 28));
});

/* 15 — the final burst */
frames.push(() => {
  let b = "";
  const cx = W / 2;
  const cy = H / 2;
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r1 = range(120, 700);
    const c = i % 4 === 0 ? CYAN : i % 4 === 1 ? FUCHSIA : WHITE;
    b += line(cx, cy, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, c, range(1, 5), range(0.25, 0.9));
  }
  b += circle(cx, cy, 190, WHITE, 0.75, 'filter="url(#g11)"');
  b += circle(cx, cy, 320, FUCHSIA, 0.3, 'filter="url(#g11)"');
  return wrap(b, glow("g11", WHITE, 40));
});

/* ---- render ---- */
mkdirSync(OUT_DIR, { recursive: true });

let total = 0;
for (let i = 0; i < frames.length; i++) {
  const svg = frames[i]();
  const out = join(OUT_DIR, `cwo-intro-${i + 1}.png`);
  const buf = await sharp(Buffer.from(svg))
    .png({ palette: true, quality: 92, effort: 9, dither: 0.7 })
    .toBuffer();
  writeFileSync(out, buf);
  total += buf.length;
  console.log(`cwo-intro-${i + 1}.png  ${(buf.length / 1024).toFixed(0)} KB`);
}
console.log(
  `\n15 frames · ${(total / 1048576).toFixed(2)} MB total -> ${OUT_DIR}`,
);
