// Toolbar popup: live preview + Customize panel + Play button + offline-page switch.
import { RunnerGame } from './src/engine.js';
import { worldDef } from './src/world.js';
import { compileCustom } from './src/registry.js';
import { loadSettings, saveSettings, loadStats, store, sanitize, loadImage } from './src/settings.js';
import { mountCustomizer } from './src/customizer.js';

const $ = id => document.getElementById(id);
const isExt = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const gameUrl = path => (isExt ? chrome.runtime.getURL(path) : path);

let settings = await loadSettings();
let stats = await loadStats();
let custom = await loadCustom(settings.customImage);

async function loadCustom(src) {
  if (!src) return null;
  try { const img = await loadImage(src); return { img, src }; } catch { return null; }
}
function panelRunner() {
  if (!custom) return null;
  const r = compileCustom(custom.img);
  r.stamp = custom.src.length + ':' + custom.src.slice(-16);
  return r;
}

// live preview (autopilot, silent)
const preview = new RunnerGame($('preview'), { mode: 'demo', onEvent: (type, d) => { if (type === 'world') label(d.world); } });
preview.configure(settings, { customImage: custom?.img || null });
preview.run();
function label(worldId) {
  const w = worldDef(worldId);
  $('preview-label').textContent = `${preview.runner ? preview.runner.name : ''} · ${w.name}`;
  $('preview-wrap').style.background = w.page;
}
label(preview.world.id);
$('hi').textContent = 'HI ' + String(stats.hi || 0).padStart(5, '0');

let saveTimer = null;
const localSaves = new Set();
function persist(next) {
  const json = JSON.stringify(sanitize(next));
  localSaves.add(json);
  setTimeout(() => localSaves.delete(json), 5000);
  return saveSettings(next);
}
const panel = mountCustomizer($('customizer'), {
  variant: 'popup', settings, stats, customRunner: panelRunner(),
  onChange(next) {
    const prev = settings, shownRunner = preview.runnerId, shownWorld = preview.world.id;
    settings = next;
    preview.configure(settings);
    // keep showing what the user was looking at, or jump to what they just picked
    const newRunner = next.animals.find(a => !prev.animals.includes(a));
    const newWorld = next.worlds.find(w => !prev.worlds.includes(w));
    preview.showRunner(newRunner || shownRunner);
    preview.showWorld(newWorld || shownWorld);
    label(preview.world.id);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(settings), 80);
  },
  // File pickers can close extension popups, so uploads happen in the game tab.
  onUpload: () => openGame('#customize=runner&upload=1'),
});

$('play').addEventListener('click', () => openGame());

async function openGame(hash = '') {
  clearTimeout(saveTimer);
  await persist(settings);
  if (!isExt) { location.href = 'game.html' + hash; return; }
  const url = chrome.runtime.getURL('game.html');
  try {
    // reuse an open game tab instead of stacking new ones
    const ctxs = chrome.runtime.getContexts ? await chrome.runtime.getContexts({ contextTypes: ['TAB'] }) : [];
    const open = ctxs.find(c => c.documentUrl && c.documentUrl.startsWith(url) && !c.documentUrl.includes('offline=1'));
    if (open && open.tabId >= 0) {
      const tab = await chrome.tabs.update(open.tabId, { active: true, ...(hash ? { url: url + hash } : {}) });
      if (tab && tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
      window.close();
      return;
    }
  } catch (e) { console.warn(e); }
  await chrome.tabs.create({ url: url + hash });
  window.close();
}

// offline page takeover = holding the optional webNavigation permission
if (isExt && chrome.permissions) {
  $('foot').hidden = false;
  const sw = $('takeover');
  const paint = on => sw.setAttribute('aria-checked', String(!!on));
  chrome.permissions.contains({ permissions: ['webNavigation'] }).then(paint);
  sw.addEventListener('click', () => {
    const on = sw.getAttribute('aria-checked') !== 'true';
    // request() must run synchronously inside the click for Chrome to show its prompt
    const p = on ? chrome.permissions.request({ permissions: ['webNavigation'] }) : chrome.permissions.remove({ permissions: ['webNavigation'] }).then(() => false);
    p.then(paint).catch(() => chrome.permissions.contains({ permissions: ['webNavigation'] }).then(paint));
  });
  chrome.permissions.onAdded?.addListener(() => chrome.permissions.contains({ permissions: ['webNavigation'] }).then(paint));
  chrome.permissions.onRemoved?.addListener(() => chrome.permissions.contains({ permissions: ['webNavigation'] }).then(paint));
}

store.onChanged(async changes => {
  if (changes.stats?.newValue) {
    stats = changes.stats.newValue;
    $('hi').textContent = 'HI ' + String(stats.hi || 0).padStart(5, '0');
    panel.update({ stats });
  }
  if (changes.settings?.newValue) {
    const next = sanitize(changes.settings.newValue);
    const json = JSON.stringify(next);
    if (localSaves.has(json) || json === JSON.stringify(settings)) return;
    const imageChanged = next.customImage !== settings.customImage;
    settings = next;
    if (imageChanged) custom = await loadCustom(settings.customImage);
    preview.configure(settings, imageChanged ? { customImage: custom?.img || null } : {});
    label(preview.world.id);
    panel.update({ settings, ...(imageChanged ? { customRunner: panelRunner() } : {}) });
  }
});
