// The runner game: fixed 60 Hz simulation, pixel-perfect collisions, parallax worlds.
import { W, H, GROUND, PLAYER_X, LANES, STEP_MS } from './consts.js';
import { drawText, textWidth } from './font.js';
import { makeCanvas, masksOverlap, monoLook, tintLook } from './sprites.js';
import { compileAnimal, compileCustom, compileObstacle, CUSTOM_ID } from './registry.js';
import { compileWorld, drawSky, drawClouds, drawLayers, drawGround, newClouds, updateClouds } from './world.js';

const SPEEDS = { chill: [2.5, 5.2], normal: [3, 6.6], fast: [3.6, 7.6], insane: [4.4, 8.8] };
const FEEL = { snappy: 0.42, normal: 0.32, floaty: 0.22 };
const APEX = 44;          // jump height in art pixels (same for every feel / gravity)
const MIN_JUMP = 16;      // releasing the button early still gives at least this much
const ACCEL = 0.0008;     // speed gained per frame
const NIGHT_EVERY = 700, NIGHT_LEN = 280;
const AMBIENT_COUNT = { snow: 46, bubbles: 14, wind: 6, leaves: 5, fireflies: 12 };

function physics(feel, gravity = 1) {
  const g = (FEEL[feel] || FEEL.normal) * gravity;
  const v0 = Math.sqrt(2 * g * APEX);
  return {
    g, v0, drop: v0 * 0.33, air: (2 * v0) / g,
    // frames the runner spends above height h during a full jump
    window: h => { const d = v0 * v0 - 2 * g * h; return d > 0 ? (2 * Math.sqrt(d)) / g : 0; },
    rise: h => { const d = v0 * v0 - 2 * g * h; return d > 0 ? (v0 - Math.sqrt(d)) / g : v0 / g; },
  };
}

const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));

export class RunnerGame {
  constructor(canvas, { mode = 'play', sfx = null, onEvent = () => {} } = {}) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.mode = mode;            // 'play' | 'demo' (autopilot preview)
    this.sfx = sfx;
    this.onEvent = onEvent;
    this.hi = 0;
    this.frame = 0;
    this.touchHint = false;
    this.input = { jump: false, duck: false };
    this.jumpBuffer = 0;
    this.particles = [];
    this.ambient = [];
    this.state = 'idle';
    this.customRunner = null;
    this.backBuf = makeCanvas(W, H);
    this.looping = false;
    this.acc = 0;
    this.last = 0;
    this._tick = this._tick.bind(this);
  }

  // ------------------------------------------------------------ setup
  configure(settings, { customImage } = {}) {
    this.settings = settings;
    if (customImage !== undefined) this.customRunner = customImage ? compileCustom(customImage) : null;
    if (this.sfx) this.sfx.enabled = settings.sound;
    if (!this.world || this.state === 'idle' || this.mode === 'demo') this.reset();
    else this.pendingReset = true;
  }

  setHi(hi) { this.hi = hi || 0; }

  reset() {
    const s = this.settings;
    this.pendingReset = false;
    const runners = s.animals.filter(id => id !== CUSTOM_ID || this.customRunner);
    if (!runners.length) runners.push('bunny');
    const choices = runners.length > 1 ? runners.filter(id => id !== this.runnerId) : runners;
    this.runnerId = choices[irand(0, choices.length - 1)];
    this.runner = this.runnerId === CUSTOM_ID ? this.customRunner : compileAnimal(this.runnerId);

    this.worldIds = s.worlds.slice();
    this.tourStart = this.mode === 'play' && this.worldIds.length > 1 ? irand(0, this.worldIds.length - 1) : 0;
    this.tourIdx = 0;
    this.trans = null;
    this.banner = null;
    this.setWorld(this.worldIds[this.tourStart], false);

    const range = SPEEDS[s.speed] || SPEEDS.normal;
    this.minSpeed = range[0];
    this.maxSpeed = range[1];
    this.speed = this.minSpeed;
    this.distance = 0;
    this.score = 0;
    this.t = 0;
    this.scroll = Math.floor(Math.random() * 2000);
    this.obstacles = [];
    this.recent = [];
    this.nextMilestone = 100;
    this.flashT = 0;
    this.night = 0;
    this.hits = 0;
    this.shake = 0;
    this.overT = 0;
    this.newHi = false;
    this.particles = [];
    this.player = { y: GROUND, vy: 0, grounded: true, jumps: 0, cut: false, ducking: false, invuln: 0 };
    this.input.jump = this.input.duck = false;
    this.jumpBuffer = 0;
    this.state = this.mode === 'demo' ? 'running' : 'idle';
  }

  // Preview helpers: jump straight to a runner / world the user just picked.
  showRunner(id) {
    if (!this.settings.animals.includes(id) || (id === CUSTOM_ID && !this.customRunner)) return;
    this.runnerId = id;
    this.runner = id === CUSTOM_ID ? this.customRunner : compileAnimal(id);
  }
  showWorld(id) {
    const i = this.worldIds.indexOf(id);
    if (i < 0 || this.world.id === id) return;
    const n = this.worldIds.length;
    this.tourStart = (((i - this.tourIdx) % n) + n) % n;
    this.setWorld(id, false);
  }

  setWorld(id, animate) {
    const cw = compileWorld(id);
    if (animate && this.world && this.world !== cw) {
      this.trans = { from: this.world, clouds: this.clouds, f: 0 };
      this.banner = { text: cw.def.name, t: 0 };
      if (this.mode === 'play') this.sfx?.world();
    }
    this.world = cw;
    this.clouds = newClouds(cw);
    this.phys = physics(this.settings.jump, cw.def.gravity);
    const s = this.settings;
    const ids = s.obstacleMode === 'custom' && s.obstacles.length ? s.obstacles : cw.def.obstacles;
    this.pool = ids.map(compileObstacle).filter(Boolean);
    this.ambient = this.ambient.filter(p => p.kind === 'shooting');
    for (const kind of cw.def.ambient || [])
      for (let i = 0; i < (AMBIENT_COUNT[kind] || 0); i++) this.ambient.push(this.spawnAmbient(kind, true));
    this.onEvent('world', { world: cw.id, runner: this.runnerId });
  }

  // ------------------------------------------------------------ input
  pressJump() {
    this.sfx?.unlock();
    if (this.state === 'idle') { this.start(); }
    else if (this.state === 'over') { if (this.overT > 24) this.restart(); return; }
    else if (this.state === 'paused') { this.resume(); return; }
    this.input.jump = true;
    this.jumpBuffer = 7;
    this.jumpFresh = true;
  }
  releaseJump() { this.input.jump = false; }
  pressDuck() { this.sfx?.unlock(); this.input.duck = true; }
  releaseDuck() { this.input.duck = false; }

  start() {
    this.state = 'running';
    this.onEvent('start', { runner: this.runnerId, world: this.world.id });
  }

  restart() {
    this.reset();
    this.start();
  }

  pause() { if (this.state === 'running') { this.state = 'paused'; this.input.jump = this.input.duck = false; } }
  resume() { if (this.state === 'paused') { this.state = 'running'; this.acc = 0; } }

  // ------------------------------------------------------------ loop
  run() {
    if (this.looping) return;
    this.looping = true;
    this.last = performance.now();
    requestAnimationFrame(this._tick);
  }
  stop() { this.looping = false; }

  _tick(now) {
    if (!this.looping) return;
    let dt = now - this.last;
    this.last = now;
    if (dt > 250) dt = STEP_MS;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP_MS && n < 6) { this.update(); this.acc -= STEP_MS; n++; }
    if (n === 6) this.acc = 0;
    this.render();
    requestAnimationFrame(this._tick);
  }

  // ------------------------------------------------------------ simulation
  update() {
    this.frame++;
    if (this.state === 'paused') return;
    const running = this.state === 'running';
    if (running) {
      if (this.mode === 'demo') this.autopilot();
      this.t++;
      this.speed = Math.min(this.maxSpeed, this.speed + ACCEL);
      this.scroll += this.speed;
      this.distance += this.speed;
      this.score = this.distance * 0.05;
      this.updateProgress();
      this.updatePlayer();
      this.updateObstacles();
      this.spawn();
      this.collide();
    } else if (this.state === 'over') {
      this.overT++;
      if (this.mode === 'demo' && this.overT > 60) this.reset();
    }
    const moving = running ? this.speed : 0;
    updateClouds(this.world, this.clouds, moving);
    if (this.trans) {
      updateClouds(this.trans.from, this.trans.clouds, moving);
      this.trans.f += 1 / 50;
      if (this.trans.f >= 1) this.trans = null;
    }
    if (this.banner && ++this.banner.t > 150) this.banner = null;
    if (this.flashT > 0) this.flashT--;
    if (this.shake > 0) this.shake--;
    const target = this.nightTarget || 0;
    this.night += Math.sign(target - this.night) * Math.min(Math.abs(target - this.night), 1 / 90);
    this.updateParticles(moving);
  }

  updateProgress() {
    const s = Math.floor(this.score);
    if (s >= this.nextMilestone) {
      this.nextMilestone += 100;
      if (this.mode === 'play') { this.flashT = 60; this.sfx?.point(); }
    }
    const cycle = this.settings.dayNight && s >= NIGHT_EVERY && s % NIGHT_EVERY < NIGHT_LEN;
    this.nightTarget = cycle ? 1 : 0;
    if (this.worldIds.length > 1) {
      const idx = Math.floor(s / this.settings.tourEvery);
      if (idx !== this.tourIdx) {
        this.tourIdx = idx;
        this.setWorld(this.worldIds[(this.tourStart + idx) % this.worldIds.length], true);
      }
    }
  }

  updatePlayer() {
    const p = this.player, ph = this.phys;
    if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.jumpBuffer > 0) {
      if (p.grounded) { this.doJump(1); this.jumpBuffer = 0; }
      else if (this.settings.doubleJump && p.jumps === 1 && this.jumpFresh) { this.doJump(2); this.jumpBuffer = 0; }
    }
    this.jumpFresh = false;
    if (!p.grounded) {
      if (!this.input.jump) p.cut = true;
      p.vy += ph.g;
      if (this.input.duck) p.vy += ph.g * 1.8;
      if (p.cut && p.vy < -ph.drop && GROUND - p.y >= MIN_JUMP) p.vy = -ph.drop;
      p.y += p.vy;
      const top = p.y - this.runner.jump.h;
      if (top < 1) { p.y = 1 + this.runner.jump.h; p.vy = Math.max(p.vy, 0); }
      if (p.y >= GROUND) {
        p.y = GROUND; p.vy = 0; p.grounded = true; p.jumps = 0;
        this.puff(PLAYER_X + 4, GROUND - 1, 5);
      }
    }
    p.ducking = this.input.duck && p.grounded;
    if (p.invuln > 0) p.invuln--;
    if (p.grounded && this.speed > 4.5 && this.t % 9 === 0) this.puff(PLAYER_X + 2, GROUND - 1, 1);
  }

  doJump(n) {
    const p = this.player;
    p.vy = -(n === 1 ? this.phys.v0 : this.phys.v0 * 0.82);
    p.grounded = false;
    p.jumps = n;
    p.cut = false;
    if (this.mode === 'play') (n === 1 ? this.sfx?.jump() : this.sfx?.doubleJump());
    if (n === 2) this.puff(PLAYER_X + 8, p.y, 6);
  }

  updateObstacles() {
    for (const o of this.obstacles) {
      o.x -= this.speed + o.vx;
      o.t++;
      const def = o.def;
      if (o.entry.roll) o.frame = Math.floor(o.t / Math.max(2, Math.round(9 - this.speed))) % 4;
      else if (def.anim) o.frame = Math.floor(o.t / def.anim) % o.parts[0].frames.length;
      const m = def.motion;
      if (m?.type === 'bob') o.dy = Math.round(Math.sin((o.t * Math.PI * 2) / m.period + o.phase) * m.amp);
      else if (m?.type === 'bounce') o.dy = -Math.round(Math.abs(Math.sin((o.t * Math.PI) / m.period + o.phase)) * m.height);
    }
    // keep the most recent obstacle even off-screen: its gap decides when the next one spawns
    while (this.obstacles.length > 1 && this.obstacles[0].x + this.obstacles[0].w < -24) this.obstacles.shift();
  }

  pickObstacle() {
    const hasGround = this.pool.some(e => e.def.kind === 'ground');
    let cands = this.pool.filter(e => !hasGround || this.score >= (e.def.minScore || 0));
    if (this.recent.length >= 2 && this.recent[0] === this.recent[1]) {
      const other = cands.filter(e => e.def.id !== this.recent[0]);
      if (other.length) cands = other;
    }
    if (!cands.length) return null;
    const weights = cands.map(e => (e.def.kind === 'air' ? 0.6 : 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) if ((r -= weights[i]) <= 0) return cands[i];
    return cands[cands.length - 1];
  }

  makeObstacle(entry) {
    const def = entry.def;
    const pw = this.runner.run[0].w;
    const parts = [];
    let w = 0, h = 0;
    const want = def.cluster ? irand(def.cluster[0], def.cluster[1]) : 1;
    for (let i = 0; i < want; i++) {
      const frames = entry.variants[irand(0, entry.variants.length - 1)];
      const fw = frames[0].w, fh = Math.max(...frames.map(f => f.h));
      const extra = def.motion?.type === 'bounce' ? def.motion.height : 0;
      // only add another copy if a full jump can still clear the whole group
      const budget = this.speed * this.phys.window(Math.max(h, fh) + extra + 1) - pw - this.speed * 5;
      if (i > 0 && w + fw - 1 > budget) break;
      parts.push({ frames, dx: w });
      w += fw - 1;
      h = Math.max(h, fh);
    }
    w += 1;
    let y = GROUND, lane = null;
    if (def.kind === 'air') {
      lane = def.lanes[irand(0, def.lanes.length - 1)];
      y = LANES[lane];
    }
    const vx = (def.vx || 0) + (def.vxJitter ? Math.random() * def.vxJitter : 0);
    return { def, entry, parts, w, h, x: W, y, lane, vx, t: irand(0, 60), frame: 0, dy: 0, phase: Math.random() * 6.28 };
  }

  spawn() {
    if (this.t < 45 || !this.pool.length) return;
    const last = this.obstacles[this.obstacles.length - 1];
    if (last && last.x + last.w + last.gap > W) return;
    const entry = this.pickObstacle();
    if (!entry) return;
    const o = this.makeObstacle(entry);
    let x = W + 2;
    if (last) {
      x = Math.max(x, last.x + last.w + last.gap);
      const dv = o.vx - last.vx;
      if (dv > 0) x += dv * ((last.x - PLAYER_X) / Math.max(1, this.speed + last.vx));
    }
    o.x = x;
    const rel = this.speed + Math.max(0, o.vx);
    const min = Math.max(44, rel * (this.phys.air + 5) - o.w * 0.5);
    o.gap = min * (1 + Math.random() * 0.8);
    this.obstacles.push(o);
    this.recent.unshift(o.def.id);
    this.recent.length = Math.min(this.recent.length, 3);
  }

  playerSprite() {
    const a = this.runner, p = this.player;
    if (this.state === 'over') return p.ducking ? a.duckCrash : a.crash;
    if (this.state === 'idle') return a.idle;
    if (!p.grounded) return a.jump;
    const f = Math.floor(this.t / (this.speed > 6 ? 4 : 5)) % 2;
    return p.ducking ? a.duck[f] : a.run[f];
  }

  collide() {
    const p = this.player;
    const ps = this.playerSprite();
    const px = PLAYER_X, py = Math.round(p.y) - ps.h;
    for (const o of this.obstacles) {
      if (o.x > px + ps.w || o.x + o.w < px) continue;
      const oy = o.y + o.dy;
      for (const part of o.parts) {
        const sp = part.frames[o.frame % part.frames.length];
        if (masksOverlap(ps, px, py, sp, Math.round(o.x + part.dx), oy - sp.h, 2)) { this.hit(o); return; }
      }
    }
  }

  hit() {
    const p = this.player;
    if (this.mode === 'demo') return;
    if (this.settings.zen) {
      if (p.invuln > 0) return;
      p.invuln = 50;
      this.hits++;
      this.shake = 6;
      this.sfx?.bump();
      return;
    }
    this.state = 'over';
    this.overT = 0;
    this.shake = 12;
    this.sfx?.crash();
    const score = Math.floor(this.score);
    this.newHi = score > this.hi;
    if (this.newHi) { this.hi = score; setTimeout(() => this.sfx?.best(), 350); }
    this.onEvent('over', { score, hi: this.hi, newHi: this.newHi, runner: this.runnerId, world: this.world.id });
  }

  // ------------------------------------------------------------ autopilot (preview)
  autopilot() {
    const p = this.player, ph = this.phys;
    const pw = this.runner.run[0].w;
    const o = this.obstacles.find(ob => ob.x + ob.w >= PLAYER_X - 1);
    this.input.duck = false;
    const hold = !p.grounded && p.vy < 0;
    if (!o) { this.input.jump = hold; return; }
    const rel = this.speed + o.vx;
    const dist = o.x - (PLAYER_X + pw);
    if (o.lane === 'high') { this.input.jump = hold; return; }
    if (o.lane === 'mid') { this.input.duck = dist < rel * 10; this.input.jump = false; return; }
    const bounce = o.def.motion?.type === 'bounce' ? o.def.motion.height : 0;
    const need = GROUND - (o.y - o.h) + bounce + 1;
    if (p.grounded && dist <= rel * (ph.rise(need) + 1) + 1 && dist > -o.w) { this.input.jump = true; this.jumpBuffer = 2; }
    else this.input.jump = hold;
  }

  // ------------------------------------------------------------ particles
  puff(x, y, n) {
    const color = this.world.def.dust;
    for (let i = 0; i < n; i++)
      this.particles.push({ x, y, vx: -rand(0.3, 1.2), vy: -rand(0.1, 0.8), life: irand(12, 22), color, g: 0.04 });
  }

  updateParticles(speed) {
    for (const p of this.particles) { p.x += p.vx - speed * 0.2; p.y += p.vy; p.vy += p.g; p.life--; }
    this.particles = this.particles.filter(p => p.life > 0);
    const kinds = this.world.def.ambient || [];
    for (const kind of kinds) {
      if (kind === 'shooting') {
        if (Math.random() < 0.004) this.ambient.push({ kind, x: rand(0, W * 0.7), y: rand(2, 30), life: 36 });
        continue;
      }
      const have = this.ambient.reduce((c, a) => c + (a.kind === kind), 0);
      if (have < AMBIENT_COUNT[kind] && Math.random() < 0.3) this.ambient.push(this.spawnAmbient(kind, false));
    }
    for (const a of this.ambient) {
      a.t = (a.t || 0) + 1;
      switch (a.kind) {
        case 'snow': a.x += a.vx - speed * 0.15 + Math.sin(a.t * 0.05 + a.ph) * 0.2; a.y += a.vy; if (a.y > GROUND + 6 || a.x < -3) a.dead = true; break;
        case 'bubbles': a.x += Math.sin(a.t * 0.08 + a.ph) * 0.3 - speed * 0.25; a.y -= a.vy; if (a.y < -4 || a.x < -4) a.dead = true; break;
        case 'wind': a.x -= speed * 1.6 + 1.5; if (a.x < -8) a.dead = true; break;
        case 'leaves': a.x += Math.sin(a.t * 0.06 + a.ph) * 0.5 - speed * 0.3; a.y += 0.35; if (a.y > GROUND + 2 || a.x < -3) a.dead = true; break;
        case 'fireflies': a.x += Math.sin(a.t * 0.03 + a.ph) * 0.3 - speed * 0.2; a.y += Math.cos(a.t * 0.04 + a.ph) * 0.2; if (a.x < -3) a.x = W + 2; break;
        case 'shooting': a.x += 3; a.y += 1.1; if (--a.life <= 0) a.dead = true; break;
      }
    }
    this.ambient = this.ambient.filter(a => !a.dead);
  }

  spawnAmbient(kind, anywhere) {
    const a = { kind, x: rand(0, W + 40), y: 0, ph: rand(0, 6.28) };
    if (kind === 'snow') { a.y = anywhere ? rand(0, GROUND) : -2; a.vx = -rand(0.1, 0.4); a.vy = rand(0.25, 0.6); a.s = Math.random() < 0.25 ? 2 : 1; }
    if (kind === 'bubbles') { a.y = anywhere ? rand(10, H) : H + 2; a.vy = rand(0.2, 0.5); a.s = Math.random() < 0.3 ? 3 : 2; }
    if (kind === 'wind') { a.x = W + rand(0, 200); a.y = irand(GROUND - 18, GROUND - 2); a.len = irand(2, 5); }
    if (kind === 'leaves') { a.y = anywhere ? rand(0, GROUND - 10) : -2; a.c = ['#e8a33d', '#d9622b', '#8cc152'][irand(0, 2)]; }
    if (kind === 'fireflies') { a.x = rand(0, W); a.y = rand(GROUND - 40, GROUND - 4); }
    return a;
  }

  // ------------------------------------------------------------ rendering
  drawSprite(ctx, sp, x, y, world = this.world) {
    const def = world.def;
    if (def.mono) { ctx.drawImage(monoLook(sp, def.mono), x, y); return; }
    ctx.drawImage(sp.canvas, x, y);
    if (this.night > 0 && def.nightMode === 'tint') {
      ctx.globalAlpha = this.night;
      ctx.drawImage(tintLook(sp, def.night.sprite), x, y);
      ctx.globalAlpha = 1;
    }
  }

  drawBackdrop(ctx, cw, clouds) {
    const st = { scroll: this.scroll, night: this.night, frame: this.frame };
    drawSky(ctx, cw, st);
    for (const a of this.ambient) {
      if (a.kind !== 'shooting') continue;
      for (let i = 0; i < 7; i++) {
        ctx.globalAlpha = (a.life / 36) * (1 - i / 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(a.x - i * 1.6), Math.round(a.y - i * 0.6), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    drawClouds(ctx, cw, clouds, this.night);
    drawLayers(ctx, cw, st);
    drawGround(ctx, cw, st);
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) ctx.translate(irand(-2, 2), irand(-1, 1));
    this.drawBackdrop(ctx, this.world, this.clouds);
    if (this.trans) {
      const b = this.backBuf.getContext('2d');
      b.imageSmoothingEnabled = false;
      this.drawBackdrop(b, this.trans.from, this.trans.clouds);
      ctx.globalAlpha = 1 - this.trans.f;
      ctx.drawImage(this.backBuf, 0, 0);
      ctx.globalAlpha = 1;
    }
    for (const o of this.obstacles) {
      const oy = o.y + o.dy;
      for (const part of o.parts) {
        const sp = part.frames[o.frame % part.frames.length];
        this.drawSprite(ctx, sp, Math.round(o.x + part.dx), oy - sp.h);
      }
    }
    const p = this.player, ps = this.playerSprite();
    if (!(p.invuln > 0 && (p.invuln >> 2) % 2)) this.drawSprite(ctx, ps, PLAYER_X, Math.round(p.y) - ps.h);
    this.drawParticles(ctx);
    ctx.restore();
    this.drawHud(ctx);
    this.drawOverlay(ctx);
    if (this.world.def.nightMode === 'invert' && this.night > 0 && !this.trans) {
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = this.night;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  drawParticles(ctx) {
    const mono = this.world.def.mono;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / 10);
      ctx.fillStyle = mono || p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;
    for (const a of this.ambient) {
      const x = Math.round(a.x), y = Math.round(a.y);
      switch (a.kind) {
        case 'snow': ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.9; ctx.fillRect(x, y, a.s, a.s); break;
        case 'bubbles':
          ctx.globalAlpha = 0.55; ctx.fillStyle = '#e6fbff';
          if (a.s === 3) { ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y + 1, 1, 1); ctx.fillRect(x + 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + 2, 1, 1); }
          else ctx.fillRect(x, y, 2, 2);
          break;
        case 'wind': ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff4d6'; ctx.fillRect(x, y, a.len, 1); break;
        case 'leaves':
          ctx.globalAlpha = 1 - this.night; ctx.fillStyle = a.c;
          if (Math.floor(a.t / 12) % 2) ctx.fillRect(x, y, 2, 1); else ctx.fillRect(x, y, 1, 2);
          break;
        case 'fireflies': {
          const blink = 0.5 + 0.5 * Math.sin(a.t * 0.12 + a.ph);
          ctx.globalAlpha = this.night * blink * 0.35; ctx.fillStyle = '#e8ff8a';
          ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
          ctx.globalAlpha = this.night * blink; ctx.fillRect(x, y, 1, 1);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  hudColor() {
    const def = this.world.def;
    return this.night > 0.5 && def.hudNight ? def.hudNight : def.hud;
  }

  plate(ctx, cx, y, w, h, color) {
    const light = parseInt(color.slice(1, 3), 16) > 150;
    ctx.globalAlpha = this.world.def.mono ? 0.85 : 0.45;
    ctx.fillStyle = this.world.def.mono ? '#f7f7f7' : light ? '#10131c' : '#ffffff';
    ctx.fillRect(Math.round(cx - w / 2), y, Math.round(w), h);
    ctx.globalAlpha = 1;
  }

  drawHud(ctx) {
    if (this.mode === 'demo') return;
    const col = this.hudColor();
    const s = Math.floor(this.score);
    let shown = s, visible = true;
    if (this.flashT > 0) { shown = this.nextMilestone - 100; visible = Math.floor(this.flashT / 10) % 2 === 0; }
    const str = String(shown).padStart(5, '0');
    if (visible) drawText(ctx, str, W - 4, 4, col, { align: 'right' });
    if (this.hi > 0) {
      ctx.globalAlpha = 0.7;
      drawText(ctx, 'HI ' + String(this.hi).padStart(5, '0'), W - 4 - textWidth(str) - 8, 4, col, { align: 'right' });
      ctx.globalAlpha = 1;
    }
    if (this.settings.zen && this.state !== 'idle') drawText(ctx, 'ZEN - BUMPS ' + this.hits, 4, 4, col);
  }

  drawOverlay(ctx) {
    if (this.mode === 'demo') return;
    const col = this.hudColor();
    const key = this.touchHint ? 'TAP' : 'SPACE';
    if (this.banner) {
      const t = this.banner.t, a = t < 20 ? t / 20 : t > 120 ? (150 - t) / 30 : 1;
      ctx.globalAlpha = Math.max(0, a);
      const w = textWidth(this.banner.text, 1);
      this.plate(ctx, W / 2, 13, w + 10, 9, col);
      ctx.globalAlpha = Math.max(0, a);
      drawText(ctx, this.banner.text, W / 2, 15, col, { align: 'center' });
      ctx.globalAlpha = 1;
    }
    if (this.state === 'idle') {
      const msg = `PRESS ${key} TO RUN`;
      this.plate(ctx, W / 2, 28, textWidth(msg) + 12, 19, col);
      drawText(ctx, msg, W / 2, 31, col, { align: 'center' });
      const sub = `${this.runner.name} - ${this.world.def.name}`;
      ctx.globalAlpha = 0.75;
      drawText(ctx, sub, W / 2, 39, col, { align: 'center' });
      ctx.globalAlpha = 1;
    } else if (this.state === 'over') {
      const lines = this.newHi ? 3 : 2;
      this.plate(ctx, W / 2, 20, 120, 12 + lines * 8, col);
      drawText(ctx, 'GAME OVER', W / 2, 23, col, { align: 'center', scale: 2 });
      let y = 37;
      if (this.newHi) { drawText(ctx, 'NEW HIGH SCORE!', W / 2, y, col, { align: 'center' }); y += 8; }
      if (this.overT > 24) drawText(ctx, `${key} TO RUN AGAIN`, W / 2, y, col, { align: 'center' });
    } else if (this.state === 'paused') {
      this.plate(ctx, W / 2, 26, 110, 22, col);
      drawText(ctx, 'PAUSED', W / 2, 29, col, { align: 'center', scale: 2 });
      drawText(ctx, `${key} TO GO ON`, W / 2, 41, col, { align: 'center' });
    }
  }
}
