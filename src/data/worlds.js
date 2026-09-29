// Worlds (environments). Each one is painted procedurally into seamless parallax tiles.
//   sky        vertical colour stops (day / night)
//   nightMode  'tint'  = darken art with night.tint and fade to the night sky
//              'invert'= flip the whole canvas (classic look)
//              'none'  = no day/night cycle
//   layers     back-to-front parallax strips: paint(ctx, T, rng) and optional lights() for night
//   ground     painter for the running surface (scrolls 1:1 with obstacles)
//   obstacles  ids used when obstacle mode is "match world"
import { GROUND, H } from '../consts.js';
import { TAU, wave, peaks, columns, disc, ellipse, pine, palm, skyline, speckle, wrapRect } from '../paint.js';
import { rint } from '../rng.js';

// ---------------------------------------------------------------- classic
function classicGround(ctx, T, r) {
  const c = '#535353';
  ctx.fillStyle = c;
  let x = 0;
  while (x < T) {
    const seg = Math.min(T - x, rint(r, 18, 60));
    ctx.fillRect(x, GROUND, seg, 1);
    x += seg;
    if (x >= T - 8) continue;
    const w = rint(r, 3, 7);
    if (r() < 0.55) { ctx.fillRect(x, GROUND - 1, w, 1); ctx.fillRect(x - 1, GROUND, 1, 1); ctx.fillRect(x + w, GROUND, 1, 1); }
    else ctx.fillRect(x, GROUND + 1, w, 1);
    x += w;
  }
  for (let i = 0; i < 90; i++) ctx.fillRect(rint(r, 0, T - 4), rint(r, GROUND + 3, H - 3), rint(r, 1, 3), 1);
}

// ---------------------------------------------------------------- desert
function mesas(ctx, T, r) {
  const h = new Float32Array(T);
  let x = 0;
  while (x < T) {
    const w = rint(r, 26, 72);
    const tall = r() < 0.6 && x > 14 && x + w < T - 14;
    const top = tall ? rint(r, 13, 27) : rint(r, 3, 6);
    for (let i = x; i < Math.min(T, x + w); i++) h[i] = top;
    x += w;
  }
  for (let i = 0; i < 10; i++) { h[i] = 4; h[T - 1 - i] = 4; }
  for (let i = 1; i < T; i++) h[i] = Math.min(h[i], h[i - 1] + 3);
  for (let i = T - 2; i >= 0; i--) h[i] = Math.min(h[i], h[i + 1] + 3);
  const tops = columns(ctx, T, i => GROUND - h[i], '#e2a676');
  for (let i = 0; i < T; i++) {
    if (h[i] < 10) continue;
    ctx.fillStyle = '#efc194'; ctx.fillRect(i, tops[i], 1, 1);
    ctx.fillStyle = '#d4956a'; ctx.fillRect(i, tops[i] + 4, 1, 1); ctx.fillRect(i, tops[i] + 9, 1, 1);
    if (h[(i + 1) % T] < h[i]) { ctx.fillStyle = '#d4956a'; ctx.fillRect(i, tops[i] + 1, 1, GROUND - tops[i]); }
  }
}
function dunes(ctx, T, r) {
  const p = [r() * TAU, r() * TAU, r() * TAU];
  const tops = columns(ctx, T, x => GROUND - 7 + wave(x, T, [[3, 2, p[0]], [2, 5, p[1]], [1, 11, p[2]]]), '#efbc76');
  for (let x = 0; x < T; x++) {
    const rising = tops[(x + 1) % T] < tops[x];
    ctx.fillStyle = rising ? '#f8d69f' : '#e5ad68';
    ctx.fillRect(x, tops[x], 1, 1);
  }
  for (let i = 0; i < 4; i++) {
    const x = rint(r, 10, T - 12), hh = rint(r, 6, 10), base = tops[x] + 2;
    ctx.fillStyle = '#cf9152';
    ctx.fillRect(x, base - hh, 2, hh);
    ctx.fillRect(x - 2, base - hh + 3, 1, 3); ctx.fillRect(x - 2, base - hh + 5, 2, 1);
    ctx.fillRect(x + 3, base - hh + 2, 1, 3); ctx.fillRect(x + 2, base - hh + 4, 2, 1);
  }
}
function sand(ctx, T, r) {
  ctx.fillStyle = '#f4cc8a'; ctx.fillRect(0, GROUND, T, H - GROUND);
  ctx.fillStyle = '#d49c56'; ctx.fillRect(0, GROUND, T, 1);
  ctx.fillStyle = '#fbe0ad'; ctx.fillRect(0, GROUND + 1, T, 1);
  speckle(ctx, T, r, 50, '#fbe0ad', GROUND + 3, H - 2, 6);
  speckle(ctx, T, r, 140, '#e3b56f', GROUND + 2, H - 1, 1);
  for (let i = 0; i < 22; i++) {
    const x = rint(r, 0, T - 3), y = rint(r, GROUND + 3, H - 3);
    ctx.fillStyle = '#b8844a'; ctx.fillRect(x, y, 2, 1);
    ctx.fillStyle = '#9a6a38'; ctx.fillRect(x, y + 1, 2, 1);
  }
}

// ---------------------------------------------------------------- forest
const hazeMountains = (c, l, base, amp) => (ctx, T, r) => {
  const p = [r() * TAU, r() * TAU, r() * TAU];
  const tops = columns(ctx, T, x => GROUND - base - wave(x, T, [[amp, 1, p[0]], [amp * 0.7, 3, p[1]], [amp * 0.3, 8, p[2]]]), c);
  ctx.fillStyle = l;
  for (let x = 0; x < T; x++) if (tops[(x + 1) % T] <= tops[x]) ctx.fillRect(x, tops[x], 1, 2);
};
function hillPines(ctx, T, r) {
  const p = [r() * TAU, r() * TAU];
  const tops = columns(ctx, T, x => GROUND - 10 + wave(x, T, [[3, 2, p[0]], [1.5, 7, p[1]]]), '#7faf89');
  let x = rint(r, 0, 5);
  while (x < T) {
    pine(ctx, x, tops[x % T] + 2, rint(r, 9, 17), '#5f9672');
    x += rint(r, 5, 11);
  }
}
function bigPines(ctx, T, r) {
  let x = rint(r, 10, 40);
  const opts = { trunk: '#5b4632', light: '#4f8a63' };
  while (x < T) {
    pine(ctx, x, GROUND + 1, rint(r, 24, 38), '#3f7753', opts);
    if (r() < 0.5) { x += rint(r, 8, 14); pine(ctx, x, GROUND + 1, rint(r, 16, 26), '#3f7753', opts); }
    x += rint(r, 45, 110);
  }
}
function grassDirt(ctx, T, r) {
  ctx.fillStyle = '#7a5435'; ctx.fillRect(0, GROUND, T, H - GROUND);
  ctx.fillStyle = '#5fae4f'; ctx.fillRect(0, GROUND, T, 3);
  ctx.fillStyle = '#86cf63'; ctx.fillRect(0, GROUND, T, 1);
  ctx.fillStyle = '#4c9340'; ctx.fillRect(0, GROUND + 3, T, 1);
  for (let x = 0; x < T; x += rint(r, 2, 5)) { ctx.fillStyle = '#4c9340'; ctx.fillRect(x, GROUND + 4, 1, rint(r, 0, 2)); }
  for (let i = 0; i < 40; i++) {
    const x = rint(r, 0, T - 3);
    ctx.fillStyle = '#5fae4f';
    ctx.fillRect(x, GROUND - 1, 1, 1); ctx.fillRect(x + 2, GROUND - 1, 1, 1); ctx.fillRect(x + 1, GROUND - 2, 1, 2);
  }
  speckle(ctx, T, r, 90, '#664329', GROUND + 5, H - 1, 2);
  for (let i = 0; i < 16; i++) {
    const x = rint(r, 0, T - 3), y = rint(r, GROUND + 6, H - 3);
    ctx.fillStyle = '#a19282'; ctx.fillRect(x, y, 3, 2);
    ctx.fillStyle = '#c2b5a6'; ctx.fillRect(x, y, 2, 1);
  }
}

// ---------------------------------------------------------------- snow
function snowPeaks(ctx, T, r) {
  const p = [r() * TAU, r() * TAU];
  const f = x => GROUND - 12 - peaks(x, T, [[20, 3, p[0]], [9, 8, p[1]]]);
  const tops = columns(ctx, T, f, '#a7bedb');
  // light comes from the left: shade the far side of each big mountain (ignores small bumps)
  const big = x => 1 - Math.abs(Math.sin((Math.PI * 3 * x) / T + p[0]));
  for (let x = 0; x < T; x++) {
    const y = tops[x], hh = GROUND - y;
    const shaded = big(x + 1) < big(x - 1);
    if (shaded) { ctx.fillStyle = '#90a9ca'; ctx.fillRect(x, y, 1, hh); }
    if (hh > 24) {
      ctx.fillStyle = shaded ? '#dce8f5' : '#f8fbff';
      ctx.fillRect(x, y, 1, Math.round((hh - 24) * 0.8) + 2);
    }
  }
}
function snowyHills(ctx, T, r) {
  const p = [r() * TAU, r() * TAU];
  const tops = columns(ctx, T, x => GROUND - 8 + wave(x, T, [[3, 3, p[0]], [1.5, 8, p[1]]]), '#e1ecf6');
  ctx.fillStyle = '#f8fbff';
  for (let x = 0; x < T; x++) ctx.fillRect(x, tops[x], 1, 1);
  let x = rint(r, 0, 20);
  while (x < T) {
    if (r() < 0.65) pine(ctx, x, tops[x % T] + 2, rint(r, 10, 18), '#4d6d84', { snow: '#f4f9fd' });
    x += rint(r, 7, 26);
  }
}
function snowGround(ctx, T, r) {
  ctx.fillStyle = '#f5fafe'; ctx.fillRect(0, GROUND, T, H - GROUND);
  ctx.fillStyle = '#bcd3e7'; ctx.fillRect(0, GROUND, T, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, GROUND + 1, T, 1);
  speckle(ctx, T, r, 60, '#d9e7f3', GROUND + 3, H - 1, 5);
  speckle(ctx, T, r, 40, '#e8f1f9', GROUND + 2, H - 1, 3);
  for (let i = 0; i < 6; i++) {
    const x = rint(r, 0, T - 12), y = rint(r, GROUND + 4, H - 4);
    ctx.fillStyle = '#cfe8f7'; ctx.fillRect(x, y, rint(r, 6, 12), 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y, 2, 1);
  }
}

// ---------------------------------------------------------------- beach
function sea(ctx, T, r) {
  const HZ = 58;
  ctx.fillStyle = '#2ea6d6'; ctx.fillRect(0, HZ, T, GROUND - HZ);
  ctx.fillStyle = '#5cc3e8'; ctx.fillRect(0, HZ, T, 3);
  ctx.fillStyle = '#8fdaf2'; ctx.fillRect(0, HZ, T, 1);
  const ix = rint(r, 80, T - 140);
  for (let dx = -20; dx <= 20; dx++) {
    const hh = Math.round(5 * Math.sqrt(1 - (dx / 21) ** 2));
    ctx.fillStyle = '#3f9a8a'; ctx.fillRect(ix + dx, HZ - hh, 1, hh);
  }
  palm(ctx, ix + 4, HZ - 4, 9, { trunk: '#3f9a8a', trunkDark: '#3f9a8a', leaf: '#3f9a8a', leafDark: '#3f9a8a', lean: 1 });
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = r() < 0.5 ? '#8fd8f0' : '#d8f5fc';
    ctx.fillRect(rint(r, 0, T - 5), rint(r, HZ + 4, GROUND - 5), rint(r, 2, 5), 1);
  }
  for (let x = 0; x < T; x++) {
    const f = Math.round(1.5 + Math.sin((x / T) * TAU * 20) * 1.2 + Math.sin((x / T) * TAU * 7) * 0.8);
    ctx.fillStyle = '#e6f8fd'; ctx.fillRect(x, GROUND - f - 1, 1, f + 1);
  }
}
function palms(ctx, T, r) {
  let x = rint(r, 20, 60);
  while (x < T - 10) {
    palm(ctx, x, GROUND + 1, rint(r, 24, 34), { trunk: '#b08556', trunkDark: '#8a6440', leaf: '#39b36a', leafDark: '#23864c', nut: '#6b4a2a', lean: r() < 0.5 ? 1 : -1 });
    x += rint(r, 90, 170);
  }
}
function beachSand(ctx, T, r) {
  ctx.fillStyle = '#f5dca4'; ctx.fillRect(0, GROUND, T, H - GROUND);
  ctx.fillStyle = '#dcbb7a'; ctx.fillRect(0, GROUND, T, 1);
  ctx.fillStyle = '#fbeac4'; ctx.fillRect(0, GROUND + 1, T, 1);
  ctx.fillStyle = '#ead096'; ctx.fillRect(0, H - 4, T, 4);
  speckle(ctx, T, r, 100, '#e8cc90', GROUND + 2, H - 1, 2);
  for (let i = 0; i < 16; i++) {
    const x = rint(r, 0, T - 3), y = rint(r, GROUND + 3, H - 2);
    ctx.fillStyle = r() < 0.5 ? '#ffb0bf' : '#fff7ea'; ctx.fillRect(x, y, 2, 1);
    ctx.fillStyle = '#e8a8a8'; ctx.fillRect(x + 1, y + 1, 1, 1);
  }
}

// ---------------------------------------------------------------- city
function farSkyline(ctx, T, r) {
  return skyline(ctx, T, r, { color: '#5b4a8c', base: GROUND, minH: 22, maxH: 46, minW: 10, maxW: 22, win: '#6a5a9c', gap: [0, 2] });
}
function farLights(ctx, T, wins) {
  for (const [x, y, k] of wins) if (k < 0.45) { ctx.fillStyle = k < 0.08 ? '#9fe3ff' : '#ffd98a'; wrapRect(ctx, T, x, y, 1, 1); }
}
function nearSkyline(ctx, T, r) {
  const wins = skyline(ctx, T, r, { color: '#33284f', base: GROUND, minH: 12, maxH: 32, minW: 12, maxW: 26, win: '#43375f', gap: [3, 14], roof: true });
  const signs = [];
  for (let i = 0; i < 3; i++) {
    const [x, y] = wins[rint(r, 0, wins.length - 1)] || [0, 0];
    const c = ['#ff4fa3', '#4ff0ff', '#b6ff5c'][i % 3];
    ctx.fillStyle = '#5a3f6e'; ctx.fillRect(x, y, 6, 3);
    signs.push([x, y, c]);
  }
  return { wins, signs };
}
function nearLights(ctx, T, { wins, signs }) {
  for (const [x, y, k] of wins) if (k < 0.55) { ctx.fillStyle = k < 0.12 ? '#ff9ecf' : '#ffe7a0'; wrapRect(ctx, T, x, y, 1, 1); }
  for (const [x, y, c] of signs) {
    ctx.fillStyle = c;
    wrapRect(ctx, T, x, y, 6, 1); wrapRect(ctx, T, x, y + 2, 6, 1); wrapRect(ctx, T, x, y, 1, 3); wrapRect(ctx, T, x + 5, y, 1, 3);
  }
}
function lamps(ctx, T, r) {
  const xs = [];
  for (let x = rint(r, 10, 40); x < T - 8; x += rint(r, 70, 120)) {
    ctx.fillStyle = '#261d3a';
    ctx.fillRect(x, GROUND - 24, 1, 25); ctx.fillRect(x, GROUND - 24, 5, 1); ctx.fillRect(x + 4, GROUND - 24, 2, 2);
    xs.push(x);
  }
  return xs;
}
function lampLights(ctx, T, xs) {
  for (const x of xs) {
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffe28a';
    wrapRect(ctx, T, x + 2, GROUND - 26, 6, 6);
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff6c0';
    wrapRect(ctx, T, x + 4, GROUND - 24, 2, 2);
  }
}
function street(ctx, T, r) {
  ctx.fillStyle = '#8f8ba7'; ctx.fillRect(0, GROUND, T, 4);
  ctx.fillStyle = '#b3afc8'; ctx.fillRect(0, GROUND, T, 1);
  ctx.fillStyle = '#76728f'; for (let x = 0; x < T; x += 16) ctx.fillRect(x, GROUND + 1, 1, 3);
  ctx.fillStyle = '#5b5775'; ctx.fillRect(0, GROUND + 4, T, 1);
  ctx.fillStyle = '#34324a'; ctx.fillRect(0, GROUND + 5, T, H - GROUND - 5);
  ctx.fillStyle = '#e6c14d'; for (let x = 0; x < T; x += 32) ctx.fillRect(x, GROUND + 10, 12, 1);
  speckle(ctx, T, r, 50, '#3f3d56', GROUND + 6, H - 1, 2);
}

// ---------------------------------------------------------------- space
function spaceFar(ctx, T, r) {
  const p = [r() * TAU, r() * TAU];
  const tops = columns(ctx, T, x => GROUND - 14 - peaks(x, T, [[10, 4, p[0]], [5, 9, p[1]]]), '#2b2646');
  ctx.fillStyle = '#3c3662';
  for (let x = 0; x < T; x++) if (tops[(x + 1) % T] < tops[x]) ctx.fillRect(x, tops[x], 1, 2);
}
function spaceRidge(ctx, T, r) {
  const p = [r() * TAU, r() * TAU];
  const tops = columns(ctx, T, x => GROUND - 7 + wave(x, T, [[3, 3, p[0]], [2, 8, p[1]]]), '#48426e');
  ctx.fillStyle = '#625b92';
  for (let x = 0; x < T; x++) ctx.fillRect(x, tops[x], 1, 1);
  for (let i = 0; i < 4; i++) {
    const x = rint(r, 10, T - 10), rr = rint(r, 3, 5), base = tops[x] + 1;
    ctx.fillStyle = '#7a73a8';
    for (let dy = 0; dy <= rr; dy++) {
      const hw = Math.round(Math.sqrt(rr * rr - dy * dy));
      ctx.fillRect(x - hw, base - dy, hw * 2 + 1, 1);
    }
    ctx.fillStyle = '#a8a2d6'; ctx.fillRect(x - (rr >> 1), base - rr + 1, 1, 1);
    ctx.fillStyle = '#9ff3ff'; ctx.fillRect(x + 1, base - 1, 1, 1); ctx.fillRect(x - 1, base - 1, 1, 1);
  }
}
function moonDust(ctx, T, r) {
  ctx.fillStyle = '#b6b2ca'; ctx.fillRect(0, GROUND, T, H - GROUND);
  ctx.fillStyle = '#dcd9ea'; ctx.fillRect(0, GROUND, T, 1);
  for (let i = 0; i < 9; i++) {
    const cx = rint(r, 6, T - 7), cy = rint(r, GROUND + 5, H - 4), rx = rint(r, 3, 6), ry = Math.max(1, Math.round(rx / 3));
    ellipse(ctx, cx, cy, rx, ry, '#8f8aa8');
    ctx.fillStyle = '#d4d0e3'; ctx.fillRect(cx - rx + 1, cy + ry, rx * 2 - 1, 1);
    ctx.fillStyle = '#77728f'; ctx.fillRect(cx - rx + 1, cy - ry, rx * 2 - 1, 1);
  }
  speckle(ctx, T, r, 80, '#a19cb8', GROUND + 2, H - 1, 2);
  speckle(ctx, T, r, 40, '#cfcbe0', GROUND + 2, H - 1, 1);
}

// ---------------------------------------------------------------- ocean
function lightRays(ctx, T, r) {
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 7; i++) {
    const x0 = rint(r, 0, T - 1), w = rint(r, 6, 14), len = rint(r, 45, 75);
    ctx.globalAlpha = 0.05 + r() * 0.06;
    for (let y = 0; y < len; y++) ctx.fillRect(x0 + Math.round(y * 0.45), y, w, 1);
  }
  ctx.globalAlpha = 1;
}
function reefFar(ctx, T, r) {
  const p = [r() * TAU, r() * TAU, r() * TAU];
  const tops = columns(ctx, T, x => GROUND - 10 - wave(x, T, [[4, 2, p[0]], [3, 6, p[1]], [1.5, 15, p[2]]]), '#1d77a3');
  for (let i = 0; i < 14; i++) { const x = rint(r, 4, T - 5); disc(ctx, x, tops[x] - 1, rint(r, 2, 4), '#1d77a3'); }
}
function kelp(ctx, T, r) {
  for (let i = 0; i < 22; i++) {
    const x0 = rint(r, 2, T - 4), hh = rint(r, 16, 46), ph = r() * TAU;
    ctx.fillStyle = r() < 0.5 ? '#2c8c68' : '#237d5d';
    for (let y = 0; y < hh; y++) {
      const off = Math.round(Math.sin(y * 0.25 + ph) * 2);
      ctx.fillRect(x0 + off, GROUND - y, 2, 1);
      if (y % 6 === 3) ctx.fillRect(x0 + off + 2, GROUND - y, 2, 1);
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = rint(r, 6, T - 8);
    ctx.fillStyle = '#1b6d8a';
    ctx.fillRect(x, GROUND - 9, 2, 10); ctx.fillRect(x - 3, GROUND - 7, 3, 1); ctx.fillRect(x - 3, GROUND - 10, 1, 3);
    ctx.fillRect(x + 2, GROUND - 5, 3, 1); ctx.fillRect(x + 4, GROUND - 9, 1, 4);
  }
}
function seabed(ctx, T, r) {
  ctx.fillStyle = '#e4d1a0'; ctx.fillRect(0, GROUND, T, H - GROUND);
  ctx.fillStyle = '#c8b27a'; ctx.fillRect(0, GROUND, T, 1);
  ctx.fillStyle = '#f1e3bb'; ctx.fillRect(0, GROUND + 1, T, 1);
  for (let i = 0; i < 34; i++) {
    const x = rint(r, 0, T - 8), y = rint(r, GROUND + 4, H - 2);
    ctx.fillStyle = '#d2bd88';
    for (let k = 0; k < 7; k++) ctx.fillRect(x + k, y + (k % 3 === 1 ? -1 : 0), 1, 1);
  }
  for (let i = 0; i < 10; i++) {
    const x = rint(r, 0, T - 3), y = rint(r, GROUND + 3, H - 2);
    ctx.fillStyle = r() < 0.5 ? '#ff9f8a' : '#fff4e0'; ctx.fillRect(x, y, 2, 1); ctx.fillRect(x, y - 1, 1, 1);
  }
}

// ---------------------------------------------------------------- the list
export const WORLDS = [
  {
    id: 'classic', name: 'Classic', blurb: 'Monochrome, like the original offline page',
    sky: { day: ['#f7f7f7'] }, nightMode: 'invert', mono: '#535353',
    hud: '#535353', page: '#f7f7f7', pageDark: false,
    moon: { x: 262, y: 10, color: '#535353', crater: '#a0a0a0' },
    stars: { count: 12, color: '#535353' },
    clouds: { count: 3, palette: { c: '#f7f7f7', s: '#f7f7f7' }, outline: '#c9c9c9', y: [8, 42], parallax: 0.2 },
    layers: [], ground: classicGround,
    dust: '#535353', gravity: 1, obstacles: ['cactus', 'rock', 'bird'],
  },
  {
    id: 'desert', name: 'Desert Dunes', blurb: 'Mesas, dunes and rolling tumbleweeds',
    sky: { day: ['#86cde9', '#bfe3ea', '#fde0b0'], night: ['#0c1a3a', '#1f2352', '#40306a'] },
    nightMode: 'tint', night: { tint: '#6070b8', sprite: '#b4bcea' },
    hud: '#8a4b1c', hudNight: '#f3ecff', page: '#fbe8c9', pageDark: false,
    sun: { x: 250, y: 24, r: 10, color: '#fff3c8', halo: '#ffe6a6' },
    moon: { x: 262, y: 12, color: '#f5f0cf', crater: '#d8d1a6' },
    stars: { count: 40, color: '#fff8e0' },
    clouds: { count: 2, palette: { c: '#fffaf0', s: '#f6e6cc' }, outline: '#e8c9a0', y: [8, 28], parallax: 0.12 },
    layers: [{ parallax: 0.06, paint: mesas }, { parallax: 0.22, paint: dunes }],
    ground: sand, ambient: ['wind'], dust: '#e8bd82', gravity: 1,
    obstacles: ['cactus', 'tumbleweed', 'rock', 'bird'],
  },
  {
    id: 'forest', name: 'Pine Forest', blurb: 'Logs, mushrooms, bees — fireflies at night',
    sky: { day: ['#94d2f0', '#c8ecf2', '#e8f7e8'], night: ['#08142a', '#12263a', '#1f3a40'] },
    nightMode: 'tint', night: { tint: '#5068a0', sprite: '#aab6e2' },
    hud: '#2f5a3a', hudNight: '#e8f5ff', page: '#e6f3e7', pageDark: false,
    sun: { x: 64, y: 18, r: 8, color: '#fffbe3', halo: '#fff3b8' },
    moon: { x: 70, y: 12, color: '#f2f4ff', crater: '#cfd4ea' },
    stars: { count: 36, color: '#f0f6ff' },
    clouds: { count: 3, palette: { c: '#ffffff', s: '#e6f0f6' }, outline: '#c4d8e4', y: [6, 32], parallax: 0.1 },
    layers: [
      { parallax: 0.05, paint: hazeMountains('#a9c7da', '#c3dae6', 24, 7) },
      { parallax: 0.18, paint: hillPines },
      { parallax: 0.42, paint: bigPines },
    ],
    ground: grassDirt, ambient: ['leaves', 'fireflies'], dust: '#8c6a45', gravity: 1,
    obstacles: ['log', 'mushroom', 'rock', 'bee', 'bat'],
  },
  {
    id: 'snow', name: 'Snowy Peaks', blurb: 'Ice spikes and snowmen in falling snow',
    sky: { day: ['#a9d6f2', '#d4ecf8', '#f0f8fc'], night: ['#0a1430', '#1a2a55', '#2e4070'] },
    nightMode: 'tint', night: { tint: '#6070c0', sprite: '#b8c0f0' },
    hud: '#35587a', hudNight: '#eef4ff', page: '#eef6fc', pageDark: false,
    sun: { x: 236, y: 20, r: 8, color: '#fffdf2', halo: '#fff6d6' },
    moon: { x: 244, y: 12, color: '#f4f6ff', crater: '#d2d8ee' },
    stars: { count: 44, color: '#f4f8ff' },
    clouds: { count: 2, palette: { c: '#ffffff', s: '#e9f0f7' }, outline: '#c9d7e6', y: [6, 26], parallax: 0.1 },
    layers: [{ parallax: 0.05, paint: snowPeaks }, { parallax: 0.2, paint: snowyHills }],
    ground: snowGround, ambient: ['snow'], dust: '#c6d9ea', gravity: 1,
    obstacles: ['icespike', 'snowman', 'rock', 'bird'],
  },
  {
    id: 'beach', name: 'Tropical Beach', blurb: 'Crabs, sandcastles and seagulls',
    sky: { day: ['#3cb6ee', '#86d8f5', '#c9f1fb'], night: ['#061634', '#0f2f5a', '#1d4a74'] },
    nightMode: 'tint', night: { tint: '#5068b0', sprite: '#a8b8e6' },
    hud: '#16557a', hudNight: '#eef6ff', page: '#dff4fa', pageDark: false,
    sun: { x: 70, y: 22, r: 10, color: '#fff6c8', halo: '#fff0a8' },
    moon: { x: 70, y: 14, color: '#f6f3dc', crater: '#d9d4b4' },
    stars: { count: 40, color: '#f4f8ff' },
    clouds: { count: 3, palette: { c: '#ffffff', s: '#e6f4fa' }, outline: '#bfe0ee', y: [6, 30], parallax: 0.1 },
    layers: [{ parallax: 0.02, paint: sea }, { parallax: 0.35, paint: palms }],
    ground: beachSand, ambient: [], dust: '#efd39a', gravity: 1,
    obstacles: ['crab', 'sandcastle', 'bird'],
  },
  {
    id: 'city', name: 'Neon City', blurb: 'Cones, hydrants and drones at sunset',
    sky: { day: ['#3a2d6a', '#8e4a86', '#e9867a', '#fbb77a'], night: ['#05071a', '#0f1030', '#221a48'] },
    nightMode: 'tint', night: { tint: '#4a4ea0', sprite: '#aeb2e4' },
    hud: '#fff1df', hudNight: '#fff1df', page: '#1d1733', pageDark: true,
    sun: { x: 212, y: 58, r: 15, color: '#ffc27a', halo: '#ffa66a' },
    moon: { x: 250, y: 12, color: '#f4efe0', crater: '#d6cfb8' },
    stars: { count: 24, color: '#fff4ea' },
    clouds: { count: 2, palette: { c: '#f7c4c4', s: '#e6a3b4' }, outline: '#b77a9c', y: [8, 30], parallax: 0.08 },
    layers: [
      { parallax: 0.07, paint: farSkyline, lights: farLights },
      { parallax: 0.22, paint: nearSkyline, lights: nearLights },
      { parallax: 0.5, paint: lamps, lights: lampLights },
    ],
    ground: street, ambient: [], dust: '#a8a4bd', gravity: 1,
    obstacles: ['cone', 'hydrant', 'drone', 'bird'],
  },
  {
    id: 'space', name: 'Moon Base', blurb: 'Low gravity, crystals and UFOs',
    sky: { day: ['#05030c', '#0f0a26', '#221a4a'] }, nightMode: 'none',
    hud: '#e9e4ff', page: '#07050f', pageDark: true,
    planet: { x: 76, y: 28, r: 13, colors: ['#e89a5a', '#d17c44', '#f3c08a'], ring: '#f5d7a6' },
    moonlet: { x: 254, y: 16, r: 4, color: '#c9c6dc', shade: '#9d99b8' },
    stars: { count: 80, color: '#ffffff', always: true },
    layers: [{ parallax: 0.04, paint: spaceFar }, { parallax: 0.16, paint: spaceRidge }],
    ground: moonDust, ambient: ['shooting'], dust: '#d6d3e6', gravity: 0.6,
    obstacles: ['crystal', 'rock', 'ufo'],
  },
  {
    id: 'ocean', name: 'Coral Reef', blurb: 'Underwater: floaty jumps and jellyfish',
    sky: { day: ['#42c3e6', '#1f96c4', '#0c6696'], night: ['#0b3656', '#06243f', '#02142a'] },
    nightMode: 'tint', night: { tint: '#4060a0', sprite: '#94abe2' },
    hud: '#eafcff', hudNight: '#eafcff', page: '#063049', pageDark: true,
    layers: [
      { parallax: 0.03, paint: lightRays },
      { parallax: 0.1, paint: reefFar },
      { parallax: 0.28, paint: kelp },
    ],
    ground: seabed, ambient: ['bubbles'], dust: '#efe0bb', gravity: 0.65,
    obstacles: ['coral', 'crab', 'jellyfish'],
  },
];
