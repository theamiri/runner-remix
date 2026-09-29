// Pixel-art sprite compiler.
// Sprites are authored as ASCII rows: '.' = transparent, any other char = a palette key.
// compileSprite() adds an automatic 1px outline, builds a canvas and a collision mask.

export function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

const colorCache = new Map();
export function parseColor(str) {
  if (colorCache.has(str)) return colorCache.get(str);
  let s = str.replace('#', '');
  if (s.length === 3 || s.length === 4) s = s.split('').map(c => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  const rgba = [(n >> 16) & 255, (n >> 8) & 255, n & 255, s.length === 8 ? parseInt(s.slice(6, 8), 16) : 255];
  colorCache.set(str, rgba);
  return rgba;
}

export function toHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function mixColor(a, b, t) {
  const A = parseColor(a), B = parseColor(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export function normalize(rows) {
  const w = Math.max(...rows.map(r => r.length));
  return rows.map(r => r.padEnd(w, '.'));
}

// ---------- grid helpers (operate on ASCII rows) ----------

export function flipH(rows) {
  return normalize(rows).map(r => r.split('').reverse().join(''));
}

export function rot90(rows) {
  const g = normalize(rows);
  const h = g.length, w = g[0].length;
  const out = [];
  for (let x = 0; x < w; x++) {
    let line = '';
    for (let y = h - 1; y >= 0; y--) line += g[y][x];
    out.push(line);
  }
  return out;
}

// Replace the eye ('e') with a knocked-out X for the crash frame.
export function crashify(rows) {
  const g = normalize(rows).map(r => r.split(''));
  const eyes = [];
  g.forEach((row, y) => row.forEach((c, x) => { if (c === 'e') eyes.push([x, y]); }));
  if (!eyes.length) return rows;
  for (const [x, y] of eyes) {
    const left = g[y][x - 1];
    g[y][x] = left && left !== '.' && left !== 'e' ? left : (g[y][x + 1] || '.');
  }
  const cx = Math.round(eyes.reduce((s, e) => s + e[0], 0) / eyes.length);
  const cy = Math.round(eyes.reduce((s, e) => s + e[1], 0) / eyes.length);
  for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) {
    const y = cy + dy, x = cx + dx;
    if (g[y] && g[y][x] !== undefined && g[y][x] !== '.') g[y][x] = 'x';
  }
  return g.map(r => r.join(''));
}

// ---------- compile ----------

const HOLE_CHARS = new Set(['e', 'x']); // punched out in monochrome mode

export function compileSprite(rows, palette = {}, opts = {}) {
  const { outline = null, solidMask = false, bold = false } = opts;
  rows = normalize(rows);
  const pad = outline ? 1 : 0;
  const w = rows[0].length + pad * 2;
  const h = rows.length + pad * 2;
  const chars = new Array(w * h).fill('.');
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++) chars[(y + pad) * w + x + pad] = rows[y][x];

  const filled = i => chars[i] !== '.' && chars[i] !== '#';
  if (outline) {
    const orig = chars.slice();
    const isF = (x, y) => x >= 0 && y >= 0 && x < w && y < h && orig[y * w + x] !== '.';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (orig[y * w + x] !== '.') continue;
      let n = isF(x - 1, y) || isF(x + 1, y) || isF(x, y - 1) || isF(x, y + 1);
      if (!n && bold) n = isF(x - 1, y - 1) || isF(x + 1, y - 1) || isF(x - 1, y + 1) || isF(x + 1, y + 1);
      if (n) chars[y * w + x] = '#';
    }
  }

  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const mask = new Uint8Array(w * h);
  const pal = { x: outline || '#222222', ...palette };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '.') continue;
    const col = ch === '#' ? outline : pal[ch];
    if (!col) continue;
    const [r, g, b, a] = parseColor(col);
    img.data.set([r, g, b, a], i * 4);
    if (filled(i)) mask[i] = 1;
  }
  ctx.putImageData(img, 0, 0);
  if (solidMask) fillEnclosed(mask, w, h);
  return { w, h, canvas, mask, chars, looks: new Map() };
}

// Treat anything not reachable from the border as solid (for scribbly sprites like tumbleweeds).
function fillEnclosed(mask, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (outside[i] || mask[i]) return;
    outside[i] = 1; stack.push(i);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  for (let i = 0; i < mask.length; i++) if (!outside[i]) mask[i] = 1;
}

// A sprite from an uploaded (already downscaled) image.
export function spriteFromImage(image) {
  const w = image.width, h = image.height;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  const chars = new Array(w * h).fill('.');
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 127) { mask[i] = 1; chars[i] = 'o'; }
  return { w, h, canvas, mask, chars, looks: new Map() };
}

// ---------- looks (monochrome / night tint), cached per sprite ----------

export function monoLook(sprite, color) {
  const key = 'm' + color;
  let c = sprite.looks.get(key);
  if (c) return c;
  c = makeCanvas(sprite.w, sprite.h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(sprite.w, sprite.h);
  const [r, g, b] = parseColor(color);
  for (let i = 0; i < sprite.chars.length; i++) {
    const ch = sprite.chars[i];
    if (ch === '.' || HOLE_CHARS.has(ch)) continue;
    img.data.set([r, g, b, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  sprite.looks.set(key, c);
  return c;
}

export function tintLook(sprite, color) {
  const key = 't' + color;
  let c = sprite.looks.get(key);
  if (!c) { c = tintCanvas(sprite.canvas, color); sprite.looks.set(key, c); }
  return c;
}

// Multiply every pixel by a colour (used to make night versions of art).
export function tintCanvas(src, color, amount = 1) {
  const w = src.width, h = src.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const [tr, tg, tb] = parseColor(color);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    d[i] = d[i] + (d[i] * tr / 255 - d[i]) * amount;
    d[i + 1] = d[i + 1] + (d[i + 1] * tg / 255 - d[i + 1]) * amount;
    d[i + 2] = d[i + 2] + (d[i + 2] * tb / 255 - d[i + 2]) * amount;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Pixel-perfect overlap test between two compiled sprites placed at integer positions.
export function masksOverlap(a, ax, ay, b, bx, by, minHits = 1) {
  const x0 = Math.max(ax, bx), x1 = Math.min(ax + a.w, bx + b.w);
  const y0 = Math.max(ay, by), y1 = Math.min(ay + a.h, by + b.h);
  if (x0 >= x1 || y0 >= y1) return false;
  let hits = 0;
  for (let y = y0; y < y1; y++) {
    const ra = (y - ay) * a.w - ax, rb = (y - by) * b.w - bx;
    for (let x = x0; x < x1; x++) {
      if (a.mask[ra + x] && b.mask[rb + x] && ++hits >= minHits) return true;
    }
  }
  return false;
}
