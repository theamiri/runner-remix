// Compiles (and caches) animals and obstacles from their ASCII definitions.
import { ANIMALS } from './data/animals.js';
import { OBSTACLES } from './data/obstacles.js';
import { compileSprite, crashify, rot90, spriteFromImage, makeCanvas, tintCanvas } from './sprites.js';

export const ANIMAL_LIST = ANIMALS;
export const OBSTACLE_LIST = OBSTACLES;
export const CUSTOM_ID = 'custom';

const animalCache = new Map();
const obstacleCache = new Map();

export function compileAnimal(id) {
  if (animalCache.has(id)) return animalCache.get(id);
  const a = ANIMALS.find(x => x.id === id) || ANIMALS[0];
  const c = rows => compileSprite(rows, a.palette, { outline: a.outline });
  const out = {
    id: a.id, name: a.name,
    run: a.run.map(c), jump: c(a.jump), duck: a.duck.map(c),
    crash: c(crashify(a.run[0])), duckCrash: c(crashify(a.duck[0])),
  };
  out.idle = out.run[1];
  animalCache.set(a.id, out);
  return out;
}

// Custom runner from a small uploaded image (already downscaled to pixel size).
export function compileCustom(img) {
  const w = img.width, h = img.height;
  const frame = (draw, fw, fh) => {
    const cv = makeCanvas(fw, fh);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    return spriteFromImage(cv);
  };
  const base = frame(ctx => ctx.drawImage(img, 0, 0), w, h);
  const bob = frame(ctx => ctx.drawImage(img, 0, 0), w, h + 1);
  const dh = Math.max(4, Math.min(12, Math.round(h * 0.6)));
  const duck = frame(ctx => ctx.drawImage(img, 0, 0, w, h, 0, 0, w + 2, dh), w + 2, dh);
  const hurt = src => spriteFromImage(tintCanvas(src.canvas, '#ff5a5a', 0.8));
  return { id: CUSTOM_ID, name: 'You', run: [base, bob], jump: base, duck: [duck, duck], crash: hurt(base), duckCrash: hurt(duck), idle: base };
}

export function compileObstacle(id) {
  if (obstacleCache.has(id)) return obstacleCache.get(id);
  const def = OBSTACLES.find(o => o.id === id);
  if (!def) return null;
  const opts = { outline: def.outline, solidMask: def.solidMask };
  const variants = def.roll
    ? def.variants.map(v => {
        const r1 = rot90(v[0]), r2 = rot90(r1), r3 = rot90(r2);
        return [v[0], r3, r2, r1].map(g => compileSprite(g, def.palette, opts));
      })
    : def.variants.map(v => v.map(g => compileSprite(g, def.palette, opts)));
  const entry = { def, variants, roll: !!def.roll };
  obstacleCache.set(id, entry);
  return entry;
}
