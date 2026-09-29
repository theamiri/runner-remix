// Pixel painting helpers used by the world painters (src/data/worlds.js).
// Tiles are TILE px wide and wrap seamlessly; anything painted past the right edge
// is folded back onto the left edge by world.js.
import { H } from './consts.js';
import { rint } from './rng.js';

export const TAU = Math.PI * 2;

// Sum of sines with integer frequencies -> periodic over the tile width T.
export function wave(x, T, terms) {
  let v = 0;
  for (const [a, f, p] of terms) v += a * Math.sin((TAU * f * x) / T + p);
  return v;
}

// Sharp mountain peaks (cusps of |sin|), still periodic over T.
export function peaks(x, T, terms) {
  let v = 0;
  for (const [a, f, p] of terms) v += a * (1 - Math.abs(Math.sin((Math.PI * f * x) / T + p)));
  return v;
}

// Fill each column from top(x) down to `bottom`. Returns the tops for reuse.
export function columns(ctx, T, top, color, bottom = H) {
  const tops = new Int16Array(T);
  ctx.fillStyle = color;
  for (let x = 0; x < T; x++) {
    const y = Math.round(top(x));
    tops[x] = y;
    if (y < bottom) ctx.fillRect(x, y, 1, bottom - y);
  }
  return tops;
}

export function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

export function ellipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

export function wrapRect(ctx, T, x, y, w, h) {
  x = ((x % T) + T) % T;
  ctx.fillRect(x, y, w, h);
  if (x + w > T) ctx.fillRect(x - T, y, w, h);
}

// Layered pine tree. Optional snow on each tier and a trunk colour.
export function pine(ctx, cx, baseY, h, color, { snow = null, trunk = null, light = null } = {}) {
  const trunkH = Math.max(1, Math.round(h * 0.12));
  const crownH = h - trunkH;
  const tiers = crownH > 18 ? 3 : crownH > 8 ? 2 : 1;
  const tierH = Math.ceil(crownH / tiers) + 2;
  const top = baseY - h;
  for (let t = 0; t < tiers; t++) {
    const y0 = top + (tiers > 1 ? Math.round((t * (crownH - tierH)) / (tiers - 1)) : 0);
    const maxHW = Math.max(1, Math.round(crownH * (0.13 + 0.07 * t)));
    for (let r = 0; r < tierH; r++) {
      const hw = Math.round((r / Math.max(1, tierH - 1)) * maxHW);
      ctx.fillStyle = color;
      ctx.fillRect(cx - hw, y0 + r, hw * 2 + 1, 1);
      if (light && hw > 1) { ctx.fillStyle = light; ctx.fillRect(cx - hw, y0 + r, 1, 1); }
      if (snow && r < 2) { ctx.fillStyle = snow; ctx.fillRect(cx - hw, y0 + r, hw * 2 + 1, 1); }
      if (snow && r === tierH - 1 && hw > 1) { ctx.fillStyle = snow; ctx.fillRect(cx - hw, y0 + r, 2, 1); ctx.fillRect(cx + hw - 1, y0 + r, 2, 1); }
    }
  }
  ctx.fillStyle = trunk || color;
  ctx.fillRect(cx, baseY - trunkH, 1, trunkH);
}

// Palm tree with a curved trunk and drooping fronds.
export function palm(ctx, x, baseY, h, { trunk, trunkDark, leaf, leafDark, nut = null, lean = 1 }) {
  let tx = x, ty = baseY;
  for (let i = 0; i < h; i++) {
    const off = Math.round(lean * Math.pow(i / h, 2) * h * 0.35);
    ctx.fillStyle = i % 4 === 0 ? trunkDark : trunk;
    ctx.fillRect(x + off, baseY - i - 1, 2, 1);
    tx = x + off; ty = baseY - i - 1;
  }
  const fronds = [[-170, 12], [-140, 13], [-105, 9], [-65, 11], [-30, 13], [-5, 11]];
  for (const [deg, len] of fronds) {
    const a = (deg * Math.PI) / 180;
    for (let s = 1; s <= len; s++) {
      const droop = Math.pow(s / len, 2) * len * 0.55;
      const px = Math.round(tx + 1 + Math.cos(a) * s);
      const py = Math.round(ty + Math.sin(a) * s * 0.75 + droop);
      ctx.fillStyle = leaf; ctx.fillRect(px, py, 1, 1);
      if (s < len - 1) { ctx.fillStyle = leafDark; ctx.fillRect(px, py + 1, 1, 1); }
    }
  }
  if (nut) { ctx.fillStyle = nut; ctx.fillRect(tx, ty + 1, 2, 2); ctx.fillRect(tx + 2, ty + 2, 1, 1); }
}

// A strip of buildings. Returns window positions so a night pass can light them up.
export function skyline(ctx, T, r, { color, base, minH, maxH, minW, maxW, win, gap = [0, 3], roof = false, roofColor }) {
  const windows = [];
  let x = rint(r, 0, 4);
  while (x < T) {
    const w = rint(r, minW, maxW), h = rint(r, minH, maxH);
    ctx.fillStyle = color;
    ctx.fillRect(x, base - h, w, h);
    if (roof) {
      ctx.fillStyle = roofColor || color;
      const k = r();
      if (k < 0.25) ctx.fillRect(x + (w >> 1), base - h - rint(r, 3, 7), 1, 7);          // antenna
      else if (k < 0.45 && w > 7) { ctx.fillRect(x + 2, base - h - 3, 4, 3); ctx.fillRect(x + 2, base - h - 1, 1, 1); } // water tank
      else if (k < 0.6) ctx.fillRect(x + 1, base - h - 1, w - 2, 1);                      // parapet
    }
    for (let wy = base - h + 2; wy < base - 2; wy += 3)
      for (let wx = x + 2; wx < x + w - 1; wx += 3)
        if (r() < 0.75) {
          if (win) { ctx.fillStyle = win; ctx.fillRect(wx, wy, 1, 1); }
          windows.push([wx, wy, r()]);
        }
    x += w + rint(r, gap[0], gap[1]);
  }
  return windows;
}

// Scatter little marks over the ground band.
export function speckle(ctx, T, r, n, color, y0, y1, maxW = 1) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(rint(r, 0, T - 1), rint(r, y0, y1), rint(r, 1, maxW), 1);
}
