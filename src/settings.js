// Settings schema, validation and storage (chrome.storage.local, with a fallback for plain pages).
import { ANIMAL_LIST, OBSTACLE_LIST, CUSTOM_ID } from './registry.js';
import { WORLD_LIST } from './world.js';

export const SPEED_OPTIONS = ['chill', 'normal', 'fast', 'insane'];
export const JUMP_OPTIONS = ['snappy', 'normal', 'floaty'];
export const TOUR_OPTIONS = [300, 500, 1000];

export const DEFAULTS = Object.freeze({
  v: 1,
  animals: ['bunny'],
  worlds: ['desert'],
  tourEvery: 500,
  obstacleMode: 'auto',   // 'auto' = match the world, 'custom' = your own mix
  obstacles: [],          // used when obstacleMode is 'custom' (pre-filled from your worlds)
  speed: 'normal',
  jump: 'normal',
  doubleJump: false,
  zen: false,
  dayNight: true,
  sound: true,
  customImage: null,      // tiny PNG data URL made from an uploaded picture
});

export function sanitize(input) {
  const s = { ...DEFAULTS, ...(input && typeof input === 'object' ? input : {}) };
  const list = v => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string'))] : []);
  if (typeof s.customImage !== 'string' || !s.customImage.startsWith('data:image/')) s.customImage = null;
  const animalIds = new Set(ANIMAL_LIST.map(a => a.id));
  s.animals = list(s.animals).filter(id => animalIds.has(id) || (id === CUSTOM_ID && s.customImage));
  if (!s.animals.length) s.animals = [...DEFAULTS.animals];
  const worldIds = new Set(WORLD_LIST.map(w => w.id));
  s.worlds = list(s.worlds).filter(id => worldIds.has(id));
  if (!s.worlds.length) s.worlds = [...DEFAULTS.worlds];
  const obstacleIds = new Set(OBSTACLE_LIST.map(o => o.id));
  s.obstacles = list(s.obstacles).filter(id => obstacleIds.has(id));
  if (s.obstacleMode !== 'custom') s.obstacleMode = 'auto';
  if (!SPEED_OPTIONS.includes(s.speed)) s.speed = DEFAULTS.speed;
  if (!JUMP_OPTIONS.includes(s.jump)) s.jump = DEFAULTS.jump;
  if (!TOUR_OPTIONS.includes(s.tourEvery)) s.tourEvery = DEFAULTS.tourEvery;
  for (const k of ['doubleJump', 'zen', 'dayNight', 'sound']) s[k] = !!s[k];
  s.v = 1;
  return s;
}

const hasChrome = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);
const memory = {};

function fallbackGet(keys) {
  const out = {};
  for (const k of [].concat(keys)) {
    let v = memory[k];
    try { const raw = localStorage.getItem('runner-remix:' + k); if (raw) v = JSON.parse(raw); } catch {}
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export const store = {
  async get(keys) {
    if (hasChrome) return chrome.storage.local.get(keys);
    return fallbackGet(keys);
  },
  async set(obj) {
    if (hasChrome) return chrome.storage.local.set(obj);
    for (const [k, v] of Object.entries(obj)) {
      memory[k] = v;
      try { localStorage.setItem('runner-remix:' + k, JSON.stringify(v)); } catch {}
    }
    listeners.forEach(cb => cb(Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { newValue: v }]))));
  },
  onChanged(cb) {
    if (hasChrome) chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') cb(changes); });
    else listeners.push(cb);
  },
};
const listeners = [];

export async function loadSettings() {
  const { settings } = await store.get('settings');
  return sanitize(settings);
}

export async function saveSettings(s) {
  const clean = sanitize(s);
  await store.set({ settings: clean });
  return clean;
}

export async function loadStats() {
  const { stats } = await store.get('stats');
  return { hi: 0, runs: 0, best: {}, ...(stats || {}) };
}

export async function saveStats(stats) {
  await store.set({ stats });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
