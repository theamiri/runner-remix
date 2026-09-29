// Game tab: runs the game, the Customize drawer, and the "you're offline" banner.
import { W, H } from './src/consts.js';
import { RunnerGame } from './src/engine.js';
import { Sfx } from './src/audio.js';
import { worldDef } from './src/world.js';
import { compileCustom, CUSTOM_ID } from './src/registry.js';
import { loadSettings, saveSettings, loadStats, saveStats, store, sanitize, loadImage } from './src/settings.js';
import { mountCustomizer, pixelatePicture } from './src/customizer.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), frame = $('frame'), stage = $('stage'), drawer = $('drawer'), scrim = $('scrim');
const isExt = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const params = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.slice(1));

let settings = await loadSettings();
let stats = await loadStats();
let customRunner = await makeCustom(settings.customImage);
let panel = null;
let drawerOpen = false;
let changedWhileOpen = false;

const sfx = new Sfx();
const game = new RunnerGame(canvas, { mode: 'play', sfx, onEvent });
game.touchHint = matchMedia('(pointer: coarse)').matches;
game.configure(settings, { customImage: customRunner?.img || null });
game.setHi(stats.hi);
game.run();
updateSoundButton();
fit();

async function makeCustom(dataUrl) {
  if (!dataUrl) return null;
  try {
    const img = await loadImage(dataUrl);
    return { img, src: dataUrl, stamp: dataUrl.length + ':' + dataUrl.slice(-16) };
  } catch { return null; }
}

function runnerForPanel() {
  if (!customRunner) return null;
  const r = compileCustom(customRunner.img);
  r.stamp = customRunner.stamp;
  return r;
}

// ------------------------------------------------------------ events from the game
function onEvent(type, data) {
  if (type === 'world') applyTheme(data.world);
  if (type === 'over') {
    stats = { ...stats, runs: (stats.runs || 0) + 1, hi: Math.max(stats.hi || 0, data.score) };
    saveStats(stats);
    panel?.update({ stats });
  }
}

function applyTheme(worldId) {
  const def = worldDef(worldId);
  document.body.style.setProperty('--page', def.page);
  document.body.classList.toggle('page-dark', !!def.pageDark);
  const name = game.runner ? game.runner.name : '';
  $('meta-now').textContent = name ? `${name} in ${def.name}` : def.name;
}

// ------------------------------------------------------------ sizing
function fit() {
  const dpr = window.devicePixelRatio || 1;
  const full = document.fullscreenElement === frame;
  const availW = full ? window.innerWidth : Math.min(stage.clientWidth - 32, 1400);
  const availH = full ? window.innerHeight : Math.max(120, window.innerHeight - (document.querySelector('.bar').offsetHeight + ($('net').hidden ? 0 : $('net').offsetHeight) + 110));
  const scale = Math.max(1, Math.floor(Math.min(availW / W, availH / H) * dpr));
  canvas.style.width = `${(W * scale) / dpr}px`;
  canvas.style.height = `${(H * scale) / dpr}px`;
}
addEventListener('resize', fit);
document.addEventListener('fullscreenchange', fit);

// ------------------------------------------------------------ input
const JUMP = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter']);
const DUCK = new Set(['ArrowDown', 'KeyS']);
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (!drawerOpen && e.target.closest && e.target.closest('button') && (e.code === 'Space' || e.code === 'Enter')) return;
  if (drawerOpen) {
    if (e.code === 'Escape' || e.code === 'KeyC') { e.preventDefault(); closeDrawer(); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (JUMP.has(e.code)) { e.preventDefault(); if (!e.repeat) game.pressJump(); }
  else if (DUCK.has(e.code)) { e.preventDefault(); game.pressDuck(); }
  else if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); game.state === 'paused' ? game.resume() : game.pause(); }
  else if (e.code === 'KeyC') { e.preventDefault(); openDrawer(undefined, true); }
  else if (e.code === 'KeyM') { toggleSound(); }
  else if (e.code === 'KeyF') { toggleFullscreen(); }
});
addEventListener('keyup', e => {
  if (JUMP.has(e.code)) game.releaseJump();
  if (DUCK.has(e.code)) game.releaseDuck();
});

// pointer: tap = jump (hold for higher), swipe down = duck
let pStart = null;
frame.addEventListener('pointerdown', e => {
  if (e.button !== undefined && e.button !== 0) return;
  pStart = { y: e.clientY, ducked: false };
  game.pressJump();
});
frame.addEventListener('pointermove', e => {
  if (pStart && !pStart.ducked && e.clientY - pStart.y > 24) { pStart.ducked = true; game.releaseJump(); game.pressDuck(); }
});
const endPointer = () => { if (!pStart) return; game.releaseJump(); if (pStart.ducked) game.releaseDuck(); pStart = null; };
frame.addEventListener('pointerup', endPointer);
frame.addEventListener('pointercancel', endPointer);
frame.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });
addEventListener('blur', () => { game.releaseJump(); game.releaseDuck(); });

// ------------------------------------------------------------ top bar
// don't leave mouse-clicked buttons focused, or Space would press them again instead of jumping
document.querySelectorAll('.bar button, .net button').forEach(b => b.addEventListener('mouseup', () => b.blur()));
$('btn-sound').addEventListener('click', toggleSound);
$('btn-full').addEventListener('click', toggleFullscreen);
$('btn-custom').addEventListener('click', e => (drawerOpen ? closeDrawer() : openDrawer(undefined, e.detail === 0)));

function toggleSound() {
  settings = sanitize({ ...settings, sound: !settings.sound });
  sfx.enabled = settings.sound;
  if (settings.sound) sfx.unlock();
  persist(settings);
  updateSoundButton();
  panel?.update({ settings });
}
function updateSoundButton() { $('btn-sound').setAttribute('aria-pressed', String(settings.sound)); }

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else frame.requestFullscreen?.().catch(() => {});
}

// ------------------------------------------------------------ drawer
function openDrawer(tab, viaKeyboard = false) {
  if (drawerOpen) { if (tab) panel.setTab(tab); return; }
  drawerOpen = true;
  changedWhileOpen = false;
  game.pause();
  if (!panel) panel = mountCustomizer($('customizer'), {
    variant: 'drawer', settings, stats, customRunner: runnerForPanel(), tab,
    onChange: onPanelChange, onUpload: () => $('file').click(), onResetStats: resetStats,
    takeover: isExt && chrome.permissions ? takeoverApi : null,
  });
  else if (tab) panel.setTab(tab);
  $('drawer-note').hidden = !(game.state === 'paused');
  drawer.classList.add('open');
  drawer.removeAttribute('inert');
  drawer.setAttribute('aria-hidden', 'false');
  scrim.hidden = false;
  $('btn-custom').setAttribute('aria-expanded', 'true');
  if (viaKeyboard) setTimeout(() => drawer.querySelector('.cz-tab[aria-selected="true"]')?.focus(), 60);
}

function closeDrawer() {
  if (!drawerOpen) return;
  drawerOpen = false;
  drawer.classList.remove('open');
  drawer.setAttribute('inert', '');
  drawer.setAttribute('aria-hidden', 'true');
  scrim.hidden = true;
  $('btn-custom').setAttribute('aria-expanded', 'false');
  frame.focus({ preventScroll: true });
  if (changedWhileOpen) { game.reset(); applyTheme(game.world.id); }
}
scrim.addEventListener('click', closeDrawer);
$('drawer-close').addEventListener('click', closeDrawer);

let saveTimer = null;
const localSaves = new Set();
function persist(next) {
  const json = JSON.stringify(sanitize(next));
  localSaves.add(json);
  setTimeout(() => localSaves.delete(json), 5000);
  return saveSettings(next);
}
function onPanelChange(next) {
  const gameplayChanged = JSON.stringify({ ...next, sound: 0 }) !== JSON.stringify({ ...settings, sound: 0 });
  settings = next;
  sfx.enabled = settings.sound;
  updateSoundButton();
  if (gameplayChanged) {
    changedWhileOpen = true;
    game.settings = settings;
  }
  if (next.customImage !== (customRunner && customRunner.src)) {
    if (!next.customImage) { customRunner = null; game.configure(settings, { customImage: null }); game.pause(); panel.update({ customRunner: null }); }
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(settings), 120);
}

$('file').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dataUrl = await pixelatePicture(file);
    customRunner = await makeCustom(dataUrl);
    const animals = settings.animals.includes(CUSTOM_ID) ? settings.animals : [...settings.animals, CUSTOM_ID];
    settings = sanitize({ ...settings, customImage: dataUrl, animals });
    game.configure(settings, { customImage: customRunner.img });
    game.pause();
    changedWhileOpen = true;
    panel.update({ settings, customRunner: runnerForPanel() });
    await persist(settings);
    toast('Your picture is now a runner. Pick it alone to always play as it.');
  } catch (err) {
    console.warn(err);
    toast("Couldn't read that image. Try a PNG or JPG.");
  }
});

async function resetStats() {
  stats = { hi: 0, runs: 0 };
  await saveStats(stats);
  game.setHi(0);
  panel?.update({ stats });
}

// ------------------------------------------------------------ offline takeover permission
const takeoverApi = {
  get: () => chrome.permissions.contains({ permissions: ['webNavigation'] }),
  async set(on) {
    try {
      if (on) return await chrome.permissions.request({ permissions: ['webNavigation'] });
      await chrome.permissions.remove({ permissions: ['webNavigation'] });
      return false;
    } catch (e) {
      console.warn(e);
      return this.get();
    }
  },
};

// ------------------------------------------------------------ sync with the popup / other tabs
store.onChanged(async changes => {
  if (changes.settings && changes.settings.newValue) {
    const next = sanitize(changes.settings.newValue);
    const json = JSON.stringify(next);
    if (localSaves.has(json) || json === JSON.stringify(settings)) return;
    const imageChanged = next.customImage !== settings.customImage;
    settings = next;
    if (imageChanged) customRunner = await makeCustom(settings.customImage);
    sfx.enabled = settings.sound;
    updateSoundButton();
    game.configure(settings, imageChanged ? { customImage: customRunner?.img || null } : {});
    if (game.state === 'idle') applyTheme(game.world.id);
    panel?.update({ settings, ...(imageChanged ? { customRunner: runnerForPanel() } : {}) });
  }
  if (changes.stats && changes.stats.newValue) {
    stats = changes.stats.newValue;
    game.setHi(Math.max(game.hi, stats.hi || 0));
    panel?.update({ stats });
  }
});

// ------------------------------------------------------------ offline banner
const from = params.get('from');
let fromURL = null;
try { fromURL = from ? new URL(from) : null; } catch { fromURL = null; }
const webFrom = fromURL && /^https?:$/.test(fromURL.protocol) ? fromURL : null;

let countdown = null, countdownTimer = null;
function updateNet() {
  const net = $('net');
  if (!webFrom) { net.hidden = true; return; }
  net.hidden = false;
  const host = webFrom.host;
  const online = navigator.onLine;
  net.classList.toggle('online', online);
  const b = Object.assign(document.createElement('b'), { textContent: host });
  const text = $('net-text');
  text.replaceChildren();
  if (!online) text.append('No internet connection. ', b, " will load once you're back.");
  else if (countdown !== null) text.append("You're back online. Opening ", b, ` in ${countdown}…`);
  else text.append("You're back online. ", b, ' is ready when you are.');
  $('net-action').textContent = !online ? 'Try again' : countdown !== null ? 'Stay here' : `Go to ${host}`;
  fit();
}

async function goToPage(replace) {
  // tell the background worker this is a deliberate retry, so a new failure shows the game again
  try {
    if (isExt && chrome.tabs?.getCurrent) {
      const tab = await chrome.tabs.getCurrent();
      if (tab && chrome.storage.session) await chrome.storage.session.set({ ['redir:' + tab.id]: { url: webFrom.href, at: Date.now(), retry: true } });
    }
  } catch {}
  if (replace) location.replace(webFrom.href);
  else location.href = webFrom.href;
}

function cancelCountdown() {
  clearInterval(countdownTimer);
  countdown = null;
  updateNet();
}

function onOnline() {
  if (!webFrom) return;
  if (!navigator.onLine) { updateNet(); return; }
  if (document.hidden) { goToPage(true); return; }            // background tab: just go back
  if (game.state === 'running' || game.state === 'paused' || drawerOpen) { updateNet(); return; } // mid-run: don't yank
  countdown = 3;
  updateNet();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (game.state === 'running' || drawerOpen) { cancelCountdown(); return; }
    countdown--;
    if (countdown <= 0) { clearInterval(countdownTimer); goToPage(true); }
    else updateNet();
  }, 1000);
}

$('net-action').addEventListener('click', () => {
  if (!webFrom) return;
  if (navigator.onLine && countdown !== null) { cancelCountdown(); return; }
  goToPage(false);
});
addEventListener('online', onOnline);
addEventListener('offline', () => { cancelCountdown(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && webFrom && navigator.onLine && (game.state === 'idle' || game.state === 'over')) goToPage(true); });
if (params.get('offline') === '1') {
  if (webFrom) document.title = `${webFrom.host} is offline · Runner Remix`;
  updateNet();
  if (!webFrom && from && from.startsWith('chrome://dino')) toast("This is your remix of chrome://dino. Switch off “Replace Chrome's offline page” in Customize → Rules to get the original back.", 7000);
}

// ------------------------------------------------------------ first run / deep links
if (params.get('welcome') === '1') {
  setTimeout(() => openDrawer('runner'), 400);
  toast('Welcome! Pick your runners, worlds and obstacles, then press Space.', 6000);
} else if (hash.get('customize')) {
  handleHash(hash);
}
function handleHash(hp) {
  if (!hp.get('customize')) return;
  setTimeout(() => openDrawer(hp.get('customize')), 200);
  if (hp.get('upload') === '1') toast('Click “Your pic” to turn a picture into a runner.', 6000);
  history.replaceState(null, '', location.pathname + location.search);
}
addEventListener('hashchange', () => handleHash(new URLSearchParams(location.hash.slice(1))));

let toastTimer = null;
function toast(msg, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

applyTheme(game.world.id);
window.__game = game;
