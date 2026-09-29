// The "Customize" panel, shared by the toolbar popup and the drawer in the game tab.
import { W, H, GROUND } from './consts.js';
import { ANIMAL_LIST, OBSTACLE_LIST, compileAnimal, compileObstacle, CUSTOM_ID } from './registry.js';
import { WORLD_LIST, worldDef, compileWorld, drawSky, drawClouds, drawLayers, drawGround, newClouds } from './world.js';
import { SPEED_OPTIONS, JUMP_OPTIONS, TOUR_OPTIONS, sanitize } from './settings.js';
import { monoLook, makeCanvas } from './sprites.js';
import { mulberry32 } from './rng.js';

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid instanceof Node ? kid : document.createTextNode(kid));
  return e;
}

const ICON = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
const icon = name => { const s = h('span', { class: 'ico' }); s.innerHTML = ICON[name]; return s; };

const TIPS = {
  speed: { chill: 'Relaxed', normal: 'Classic pace', fast: 'Quicker', insane: 'Good luck' },
  jump: { snappy: 'Short & quick', normal: 'Balanced', floaty: 'Long hang time' },
};
const LABEL = { chill: 'Chill', normal: 'Normal', fast: 'Fast', insane: 'Insane', snappy: 'Snappy', floaty: 'Floaty' };

// ---------- thumbnails (cached across re-renders) ----------
const thumbCache = new Map();

function animalThumb(id, customRunner) {
  const key = id === CUSTOM_ID ? 'custom:' + (customRunner?.stamp || 'none') : 'a:' + id;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const a = id === CUSTOM_ID ? customRunner : compileAnimal(id);
  const c = makeCanvas(30, 24);
  c.className = 'px thumb-animal';
  const draw = f => {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const sp = a.run[f % a.run.length];
    ctx.drawImage(sp.canvas, Math.floor((c.width - sp.w) / 2), c.height - sp.h);
  };
  draw(0);
  c._draw = draw;
  thumbCache.set(key, c);
  return c;
}

function worldThumb(id) {
  const key = 'w:' + id;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const cw = compileWorld(id);
  const c = makeCanvas(W, H);
  c.className = 'thumb-world';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const st = { scroll: 180, night: 0, frame: 20 };
  drawSky(ctx, cw, st);
  drawClouds(ctx, cw, newClouds(cw, mulberry32(7)), 0);
  drawLayers(ctx, cw, st);
  drawGround(ctx, cw, st);
  const ids = cw.def.obstacles.filter(o => compileObstacle(o).def.kind === 'ground').slice(0, 2);
  ids.forEach((oid, i) => {
    const sp = compileObstacle(oid).variants[0][0];
    const img = cw.def.mono ? monoLook(sp, cw.def.mono) : sp.canvas;
    ctx.drawImage(img, 150 + i * 90, GROUND - sp.h);
  });
  const hero = compileAnimal('bunny').run[0];
  ctx.drawImage(cw.def.mono ? monoLook(hero, cw.def.mono) : hero.canvas, 34, GROUND - hero.h);
  thumbCache.set(key, c);
  return c;
}

function obstacleIcon(id) {
  const key = 'o:' + id;
  if (thumbCache.has(key)) return cloneCanvas(thumbCache.get(key));
  const { variants } = compileObstacle(id);
  const sp = variants[variants.length > 2 ? 2 : 0][0];
  const c = makeCanvas(24, 22);
  c.getContext('2d').drawImage(sp.canvas, Math.floor((24 - sp.w) / 2), 22 - sp.h);
  c.className = 'px thumb-obstacle';
  thumbCache.set(key, c);
  return cloneCanvas(c);
}

function cloneCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  c.className = src.className;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// ---------- the component ----------
export function mountCustomizer(root, opts) {
  const { variant = 'drawer', onChange = () => {}, onUpload = null, onResetStats = null, takeover = null } = opts;
  let s = sanitize(opts.settings);
  let stats = opts.stats || { hi: 0, runs: 0 };
  let customRunner = opts.customRunner || null;
  let tab = opts.tab || 'runner';
  let animTimer = null;

  root.classList.add('cz', `cz-${variant}`);

  const commit = patch => {
    s = sanitize({ ...s, ...patch });
    onChange(s);
    renderPanel();
  };

  const toggleIn = (list, id, min = 1) => {
    const has = list.includes(id);
    if (has && list.length <= min) return list;
    return has ? list.filter(x => x !== id) : [...list, id];
  };

  // tabs
  const tabs = [
    ['runner', 'Runner'],
    ['world', 'World'],
    ['obstacles', 'Obstacles'],
    ['rules', 'Rules'],
  ];
  const tablist = h('div', { class: 'cz-tabs', role: 'tablist' });
  const panel = h('div', { class: 'cz-panel', role: 'tabpanel' });
  const tabButtons = tabs.map(([id, label]) =>
    h('button', {
      class: 'cz-tab', role: 'tab', type: 'button', 'data-tab': id,
      onclick: () => { tab = id; renderTabs(); renderPanel(); root.scrollTop = 0; root.closest('.drawer')?.scrollTo({ top: 0 }); },
    }, label));
  tablist.append(...tabButtons);
  root.replaceChildren(tablist, panel);

  function renderTabs() {
    tabButtons.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  }

  function hint(text) { return h('p', { class: 'cz-hint' }, text); }

  function segmented(name, options, value, onPick, labels = LABEL, tips = null) {
    return h('div', { class: 'cz-seg', role: 'radiogroup', 'aria-label': name },
      options.map(o => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(o === value), title: tips ? tips[o] : undefined,
        onclick: () => onPick(o),
      }, labels[o] ?? String(o))));
  }

  function switchRow(label, desc, value, onToggle) {
    const id = 'sw-' + label.replace(/\W+/g, '-').toLowerCase();
    return h('div', { class: 'cz-switch-row' },
      h('div', { class: 'cz-switch-text' }, h('label', { for: id, class: 'cz-switch-label' }, label), desc ? h('span', { class: 'cz-switch-desc' }, desc) : null),
      h('button', { id, type: 'button', role: 'switch', class: 'cz-switch', 'aria-checked': String(value), onclick: () => onToggle(!value) }, h('span', { class: 'knob' })));
  }

  // ---------- panels ----------
  function runnerPanel() {
    const grid = h('div', { class: 'cz-grid cz-grid-animals' });
    for (const a of ANIMAL_LIST) {
      const on = s.animals.includes(a.id);
      grid.append(h('button', {
        type: 'button', class: 'cz-tile', 'aria-pressed': String(on), 'data-id': a.id, title: a.name,
        onclick: () => commit({ animals: toggleIn(s.animals, a.id) }),
      }, animalThumb(a.id), h('span', { class: 'cz-tile-name' }, a.name), on ? h('span', { class: 'cz-badge' }, icon('check')) : null));
    }
    if (s.customImage && customRunner) {
      const on = s.animals.includes(CUSTOM_ID);
      grid.append(h('div', { class: 'cz-tile-wrap' },
        h('button', {
          type: 'button', class: 'cz-tile', 'aria-pressed': String(on), 'data-id': CUSTOM_ID, title: 'Your picture',
          onclick: () => commit({ animals: toggleIn(s.animals, CUSTOM_ID) }),
        }, animalThumb(CUSTOM_ID, customRunner), h('span', { class: 'cz-tile-name' }, 'You'), on ? h('span', { class: 'cz-badge' }, icon('check')) : null),
        h('button', {
          type: 'button', class: 'cz-remove', title: 'Remove your picture', 'aria-label': 'Remove your picture',
          onclick: () => commit({ customImage: null, animals: s.animals.filter(x => x !== CUSTOM_ID) }),
        }, icon('x'))));
    }
    if (onUpload) {
      grid.append(h('button', { type: 'button', class: 'cz-tile cz-tile-add', onclick: () => onUpload(), title: 'Turn any picture into a pixel runner' },
        icon('plus'), h('span', { class: 'cz-tile-name' }, s.customImage ? 'New pic' : 'Your pic')));
    }
    const n = s.animals.length;
    return [
      hint(n > 1 ? `${n} runners picked: each run starts with a random one.` : 'Pick one runner, or several to get a random one each run.'),
      grid,
    ];
  }

  function worldPanel() {
    const grid = h('div', { class: 'cz-grid cz-grid-worlds' });
    for (const w of WORLD_LIST) {
      const on = s.worlds.includes(w.id);
      const order = s.worlds.indexOf(w.id);
      grid.append(h('button', {
        type: 'button', class: 'cz-world', 'aria-pressed': String(on), 'data-id': w.id,
        onclick: () => commit({ worlds: toggleIn(s.worlds, w.id) }),
      },
      h('span', { class: 'cz-world-img' }, worldThumb(w.id), on && s.worlds.length > 1 ? h('span', { class: 'cz-order' }, String(order + 1)) : null,
        on ? h('span', { class: 'cz-badge' }, icon('check')) : null),
      h('span', { class: 'cz-world-name' }, w.name),
      h('span', { class: 'cz-world-blurb' }, w.blurb)));
    }
    const out = [];
    if (s.worlds.length > 1) {
      out.push(h('div', { class: 'cz-tour' },
        h('div', { class: 'cz-tour-text' }, h('strong', {}, 'World tour'), h('span', {}, `${s.worlds.length} worlds, in the numbered order`)),
        segmented('Switch world every', TOUR_OPTIONS, s.tourEvery, v => commit({ tourEvery: v }), Object.fromEntries(TOUR_OPTIONS.map(v => [v, `${v} pts`])))));
    } else {
      out.push(hint('Pick one world, or several for a World Tour that switches as you score.'));
    }
    out.push(grid);
    return out;
  }

  function obstaclesPanel() {
    const mode = s.obstacleMode;
    const out = [segmented('Obstacle mode', ['auto', 'custom'], mode, m => {
      const patch = { obstacleMode: m };
      if (m === 'custom' && !s.obstacles.length) patch.obstacles = [...new Set(s.worlds.flatMap(id => worldDef(id).obstacles))];
      commit(patch);
    }, { auto: 'Match the world', custom: 'My own mix' })];
    if (mode === 'auto') {
      out.push(hint('Each world brings its own obstacles:'));
      for (const id of s.worlds) {
        const w = worldDef(id);
        out.push(h('div', { class: 'cz-auto-row' },
          h('span', { class: 'cz-auto-world' }, w.name),
          h('span', { class: 'cz-auto-list' }, w.obstacles.map(o => h('span', { class: 'cz-mini', title: compileObstacle(o).def.name }, obstacleIcon(o))))));
      }
      return out;
    }
    out.push(hint('Tap to mix any obstacles into every world. Flyers join after the first ~120 points.'));
    for (const [kind, title] of [['ground', 'On the ground'], ['air', 'In the air']]) {
      out.push(h('div', { class: 'cz-subhead' }, title));
      const grid = h('div', { class: 'cz-grid cz-grid-obstacles' });
      for (const o of OBSTACLE_LIST.filter(x => x.kind === kind)) {
        const on = s.obstacles.includes(o.id);
        grid.append(h('button', {
          type: 'button', class: 'cz-chip', 'aria-pressed': String(on), 'data-id': o.id,
          onclick: () => commit({ obstacles: toggleIn(s.obstacles, o.id) }),
        }, obstacleIcon(o.id), h('span', {}, o.name), on ? h('span', { class: 'cz-badge' }, icon('check')) : null));
      }
      out.push(grid);
    }
    return out;
  }

  function rulesPanel() {
    const out = [
      h('div', { class: 'cz-field' }, h('div', { class: 'cz-field-label' }, 'Speed'),
        segmented('Speed', SPEED_OPTIONS, s.speed, v => commit({ speed: v }), LABEL, TIPS.speed)),
      h('div', { class: 'cz-field' }, h('div', { class: 'cz-field-label' }, 'Jump feel'),
        segmented('Jump feel', JUMP_OPTIONS, s.jump, v => commit({ jump: v }), LABEL, TIPS.jump)),
      switchRow('Double jump', 'Tap again in mid-air', s.doubleJump, v => commit({ doubleJump: v })),
      switchRow('Zen mode', 'No game over: bumps are just counted', s.zen, v => commit({ zen: v })),
      switchRow('Day & night', 'Night falls every 700 points', s.dayNight, v => commit({ dayNight: v })),
      switchRow('Sound', 'Little 8-bit blips', s.sound, v => commit({ sound: v })),
    ];
    out.push(h('div', { class: 'cz-stats' },
      h('span', {}, 'Best ', h('strong', {}, String(stats.hi || 0).padStart(5, '0'))),
      h('span', {}, 'Runs ', h('strong', {}, String(stats.runs || 0))),
      onResetStats && (stats.hi || stats.runs) ? h('button', { type: 'button', class: 'cz-link', onclick: () => onResetStats() }, 'Reset') : null));
    if (takeover && variant === 'drawer') out.push(takeoverCard());
    return out;
  }

  let takeoverState = null;
  function takeoverCard() {
    const card = h('div', { class: 'cz-takeover' });
    const paint = () => {
      const on = !!takeoverState;
      card.replaceChildren(
        switchRow("Replace Chrome's offline page", 'When a page fails with no internet (or you open chrome://dino), this game opens instead. Chrome will ask for “browsing history” access, which is only used to spot failed page loads.', on, async v => {
          takeoverState = await takeover.set(v);
          paint();
        }));
    };
    paint();
    if (takeoverState === null) takeover.get().then(v => { takeoverState = v; paint(); });
    return card;
  }

  function renderPanel() {
    const build = { runner: runnerPanel, world: worldPanel, obstacles: obstaclesPanel, rules: rulesPanel }[tab];
    panel.replaceChildren(...build());
    panel.setAttribute('aria-label', tabs.find(t => t[0] === tab)[1]);
    animate();
  }

  function animate() {
    clearInterval(animTimer);
    if (tab !== 'runner') return;
    let f = 0;
    animTimer = setInterval(() => {
      f++;
      panel.querySelectorAll('.cz-tile[aria-pressed="true"] canvas, .cz-tile:hover canvas').forEach(c => c._draw && c._draw(f));
    }, 160);
  }

  renderTabs();
  renderPanel();

  return {
    get settings() { return s; },
    update(next = {}) {
      if (next.settings) s = sanitize(next.settings);
      if (next.stats) stats = next.stats;
      if ('customRunner' in next) customRunner = next.customRunner;
      if (next.tab) { tab = next.tab; renderTabs(); }
      renderPanel();
    },
    setTab(t) { tab = t; renderTabs(); renderPanel(); },
    destroy() { clearInterval(animTimer); root.replaceChildren(); },
  };
}

// Turn any picture into a small pixel sprite (PNG data URL).
export async function pixelatePicture(file, { maxW = 24, maxH = 22 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = Math.max(6, Math.round(img.width * scale)), hh = Math.max(6, Math.round(img.height * scale));
    // two-step downscale keeps detail
    const mid = makeCanvas(w * 4, hh * 4);
    const m = mid.getContext('2d');
    m.imageSmoothingQuality = 'high';
    m.drawImage(img, 0, 0, mid.width, mid.height);
    const out = makeCanvas(w, hh);
    const o = out.getContext('2d');
    o.imageSmoothingQuality = 'high';
    o.drawImage(mid, 0, 0, w, hh);
    const data = o.getImageData(0, 0, w, hh);
    const d = data.data;
    let transparent = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 200) transparent++;
    const round = transparent < (w * hh) * 0.04;   // photos: crop to a circle
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (round) {
        const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - hh / 2) / (hh / 2);
        if (dx * dx + dy * dy > 1) { d[i + 3] = 0; continue; }
      }
      d[i + 3] = d[i + 3] > 127 ? 255 : 0;
      for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / 16) * 16;
    }
    o.putImageData(data, 0, 0);
    return out.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
