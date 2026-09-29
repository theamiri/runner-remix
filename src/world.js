// Turns world definitions into pre-rendered canvases and draws them each frame.
import { W, H, GROUND, TILE } from './consts.js';
import { makeCanvas, compileSprite, tintCanvas, mixColor } from './sprites.js';
import { SCENERY } from './data/obstacles.js';
import { WORLDS } from './data/worlds.js';
import { mulberry32, hashString, rint } from './rng.js';
import { disc } from './paint.js';

export const WORLD_LIST = WORLDS;
export const worldDef = id => WORLDS.find(w => w.id === id) || WORLDS[0];

const FOLD = 96; // painters may overflow the tile by this much; it wraps to the left edge

function paintTile(painter, rng) {
  const wide = makeCanvas(TILE + FOLD, H);
  const data = painter(wide.getContext('2d'), TILE, rng);
  const out = makeCanvas(TILE, H);
  const o = out.getContext('2d');
  o.drawImage(wide, 0, 0);
  o.drawImage(wide, TILE, 0, FOLD, H, 0, 0, FOLD, H);
  return { canvas: out, data };
}

function paintSky(stops) {
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const band = 4;
  for (let y = 0; y < H; y += band) {
    const t = (y / (H - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    ctx.fillStyle = stops.length === 1 ? stops[0] : mixColor(stops[i], stops[i + 1], t - i);
    ctx.fillRect(0, y, W, band);
  }
  return c;
}

function makeSun({ r, color, halo }) {
  const s = (r + 4) * 2 + 1, c = makeCanvas(s, s), ctx = c.getContext('2d'), m = r + 4;
  ctx.globalAlpha = 0.25; disc(ctx, m, m, r + 4, halo);
  ctx.globalAlpha = 0.5; disc(ctx, m, m, r + 2, halo);
  ctx.globalAlpha = 1; disc(ctx, m, m, r, color);
  return c;
}

function makePlanet({ r, colors, ring }) {
  const rx = r + 8, w = rx * 2 + 3, h = r * 2 + 3, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = rx + 1, cy = r + 1;
  const ringRow = (front) => {
    ctx.fillStyle = ring;
    for (let x = -rx; x <= rx; x++) {
      const dy = Math.round(3 * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx))));
      if (front) ctx.fillRect(cx + x, cy + dy, 1, 1); else ctx.fillRect(cx + x, cy - dy, 1, 1);
    }
  };
  ringRow(false);
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    ctx.fillStyle = colors[Math.floor((dy + r) / 4) % colors.length];
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    ctx.fillStyle = 'rgba(20,10,40,0.35)';
    const shade = Math.max(0, Math.round(hw * 0.45));
    ctx.fillRect(cx + hw - shade + 1, cy + dy, shade, 1);
  }
  ringRow(true);
  return c;
}

function makeMoonlet({ r, color, shade }) {
  const s = r * 2 + 1, c = makeCanvas(s, s), ctx = c.getContext('2d');
  disc(ctx, r, r, r, color);
  ctx.fillStyle = shade; ctx.fillRect(r + 1, r - 1, 2, 2); ctx.fillRect(r - 2, r + 1, 1, 1);
  return c;
}

const cache = new Map();

export function compileWorld(id) {
  const def = worldDef(id);
  if (cache.has(def.id)) return cache.get(def.id);
  const seed = hashString(def.id);
  const tint = def.nightMode === 'tint';
  const cw = { id: def.id, def };
  cw.sky = { day: paintSky(def.sky.day), night: def.sky.night ? paintSky(def.sky.night) : null };
  // night versions are built lazily, the first time night actually falls
  cw.layers = def.layers.map((L, i) => {
    const { canvas, data } = paintTile(L.paint, mulberry32(seed + 17 * (i + 1)));
    const layer = { parallax: L.parallax, day: canvas, _night: undefined };
    Object.defineProperty(layer, 'night', {
      get() {
        if (layer._night === undefined) {
          layer._night = tint ? tintCanvas(canvas, def.night.tint) : null;
          if (layer._night && L.lights) L.lights(layer._night.getContext('2d'), TILE, data);
        }
        return layer._night;
      },
    });
    return layer;
  });
  const g = paintTile(def.ground, mulberry32(seed + 999));
  let groundNight;
  cw.ground = { day: g.canvas, get night() { if (groundNight === undefined) groundNight = tint ? tintCanvas(g.canvas, def.night.tint) : null; return groundNight; } };
  const rs = mulberry32(seed + 5);
  cw.stars = def.stars
    ? Array.from({ length: def.stars.count }, () => ({ x: rint(rs, 2, W - 3), y: rint(rs, 2, GROUND - 32), big: rs() < 0.12, ph: rs() * 6.28, sp: 0.02 + rs() * 0.05 }))
    : [];
  if (def.sun) cw.sun = makeSun(def.sun);
  if (def.moon) cw.moon = compileSprite(SCENERY.moon, { m: def.moon.color, c: def.moon.crater }).canvas;
  if (def.planet) cw.planet = makePlanet(def.planet);
  if (def.moonlet) cw.moonlet = makeMoonlet(def.moonlet);
  if (def.clouds) {
    const pal = def.clouds.palette, o = { outline: def.clouds.outline };
    cw.cloudSprites = [compileSprite(SCENERY.cloud, pal, o), compileSprite(SCENERY.cloudSmall, pal, o)];
    if (tint) cw.cloudNight = cw.cloudSprites.map(s => tintCanvas(s.canvas, def.night.tint, 0.85));  // tiny
  }
  cache.set(def.id, cw);
  return cw;
}

function blit(ctx, img, off, y0, h) {
  const first = Math.min(W, TILE - off);
  ctx.drawImage(img, off, y0, first, h, 0, y0, first, h);
  if (first < W) ctx.drawImage(img, 0, y0, W - first, h, first, y0, W - first, h);
}

const nightOf = (cw, night) => (cw.def.nightMode === 'none' ? 0 : night);

export function drawSky(ctx, cw, { night, frame }) {
  const def = cw.def, n = nightOf(cw, night);
  ctx.drawImage(cw.sky.day, 0, 0);
  if (n > 0 && cw.sky.night) { ctx.globalAlpha = n; ctx.drawImage(cw.sky.night, 0, 0); ctx.globalAlpha = 1; }
  const sa = def.stars?.always ? 1 : n;
  if (sa > 0.01 && cw.stars.length) {
    ctx.fillStyle = def.stars.color;
    for (const s of cw.stars) {
      ctx.globalAlpha = sa * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(frame * s.sp + s.ph)));
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.big) { ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.fillRect(s.x, s.y - 1, 1, 3); }
    }
    ctx.globalAlpha = 1;
  }
  if (cw.planet) ctx.drawImage(cw.planet, def.planet.x - (cw.planet.width >> 1), def.planet.y - (cw.planet.height >> 1));
  if (cw.moonlet) ctx.drawImage(cw.moonlet, def.moonlet.x, def.moonlet.y);
  if (cw.sun && n < 1) {
    ctx.globalAlpha = 1 - n;
    ctx.drawImage(cw.sun, def.sun.x - (cw.sun.width >> 1), def.sun.y - (cw.sun.height >> 1));
    ctx.globalAlpha = 1;
  }
  if (cw.moon && n > 0) { ctx.globalAlpha = n; ctx.drawImage(cw.moon, def.moon.x, def.moon.y); ctx.globalAlpha = 1; }
}

export function drawClouds(ctx, cw, clouds, night) {
  if (!cw.cloudSprites) return;
  const n = nightOf(cw, night);
  for (const c of clouds) {
    const x = Math.round(c.x);
    ctx.drawImage(cw.cloudSprites[c.kind].canvas, x, c.y);
    if (n > 0 && cw.cloudNight) { ctx.globalAlpha = n; ctx.drawImage(cw.cloudNight[c.kind], x, c.y); ctx.globalAlpha = 1; }
  }
}

export function drawLayers(ctx, cw, { scroll, night }) {
  const n = nightOf(cw, night);
  for (const L of cw.layers) {
    const off = Math.floor((scroll * L.parallax) % TILE);
    blit(ctx, L.day, off, 0, H);
    if (n > 0 && L.night) { ctx.globalAlpha = n; blit(ctx, L.night, off, 0, H); ctx.globalAlpha = 1; }
  }
}

export function drawGround(ctx, cw, { scroll, night }) {
  const n = nightOf(cw, night);
  const off = Math.floor(scroll % TILE), y0 = GROUND - 4, h = H - y0;
  blit(ctx, cw.ground.day, off, y0, h);
  if (n > 0 && cw.ground.night) { ctx.globalAlpha = n; blit(ctx, cw.ground.night, off, y0, h); ctx.globalAlpha = 1; }
}

export function newClouds(cw, rng = Math.random) {
  const def = cw.def.clouds;
  if (!def) return [];
  return Array.from({ length: def.count }, (_, i) => ({
    x: (W / def.count) * i + rng() * 60,
    y: Math.round(def.y[0] + rng() * (def.y[1] - def.y[0])),
    kind: rng() < 0.5 ? 0 : 1,
    speed: def.parallax * (0.7 + rng() * 0.6),
  }));
}

export function updateClouds(cw, clouds, speed) {
  const def = cw.def.clouds;
  if (!def) return;
  for (const c of clouds) {
    c.x -= c.speed * (speed + 0.6);
    if (c.x < -30) {
      c.x = W + Math.random() * 120;
      c.y = Math.round(def.y[0] + Math.random() * (def.y[1] - def.y[0]));
      c.kind = Math.random() < 0.5 ? 0 : 1;
    }
  }
}
