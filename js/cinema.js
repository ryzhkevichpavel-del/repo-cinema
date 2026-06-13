/* cinema.js — Canvas 2D renderer. The repo is a star; contributors are
   planets on orbits; commits become particles. Letterbox, milestones, HUD,
   finale with poster card, rolling credits and THE END. */

'use strict';

const RC_CINEMA = (() => {

  const W = 1024, H = 576;             // internal 16:9 resolution
  const LB = Math.round(H * 0.12);     // letterbox bar height
  const MAX_PARTICLES = 190;
  const INTRO_SEC = 3.5;
  const FREEZE_SEC = 1.2;
  const FADE_SEC = 1.5;
  const POSTER_SEC = 4.0;
  const END_SEC = 3.0;
  const CREDIT_LINE_H = 30;
  const CREDIT_SPEED = 96;             // px/sec

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const ORBIT_FADE_SEC = 1.1;
  const fmt = (n) => typeof RC_I18N !== 'undefined'
    ? RC_I18N.fmt(n)
    : Math.round(n || 0).toLocaleString('en-US');

  function monthYear(ts) {
    return typeof RC_I18N !== 'undefined'
      ? RC_I18N.monthYear(ts)
      : new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function tr(key, arg) {
    return typeof RC_I18N !== 'undefined' ? RC_I18N.t(key, arg) : key;
  }

  function milestoneText(ms) {
    if (!ms) return '';
    if (ms.type === 'birth') return tr('film_milestone_birth', { date: monthYear(ms.date) });
    if (ms.type === 'enter') return tr('film_milestone_enter', { login: ms.login });
    if (ms.type === 'peak') return tr('film_milestone_peak', { commits: ms.commits });
    if (ms.type === 'refactor') return tr('film_milestone_refactor', { lines: ms.lines });
    if (ms.type === 'quarter') return tr('film_milestone_commit', { commits: ms.commits });
    return '';
  }

  /* ---------- film grain: small static noise canvas ---------- */
  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = 160; grainCanvas.height = 90;
  const grainCtx = grainCanvas.getContext('2d');
  const grainData = grainCtx.createImageData(160, 90);
  function refreshGrain() {
    const d = grainData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    grainCtx.putImageData(grainData, 0, 0);
  }
  refreshGrain();

  /* ---------- particle pool ---------- */
  function makePool() {
    const pool = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pool.push({
        alive: false, x: 0, y: 0, px: 0, py: 0,
        vx: 0, vy: 0, life: 0, maxLife: 1,
        kind: 0, size: 1, power: 1
      });
    }
    return pool;
  }

  class Cinema {
    constructor(canvas) {
      this.canvas = canvas;
      canvas.width = W; canvas.height = H;
      this.ctx = canvas.getContext('2d');
      this.movie = null;
      this.playing = false;
      this.speed = 1;
      this.raf = 0;
      this.onFinaleStart = null;     // hook for export.js (used to know film end)
      this.onEnd = null;

      // static starfield
      this.stars = [];
      let seed = 12345;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 220; i++) {
        this.stars.push({ x: rnd() * W, y: rnd() * H, r: rnd() * 1.3 + 0.3, a: rnd() * 0.6 + 0.15 });
      }

      this.pool = makePool();
      this.avatars = new Map(); // login -> HTMLImageElement (loaded ok)
      this.avatarSprites = new Map(); // login -> circular prerendered canvas
      this.background = this._buildBackground();
      this.vignette = this._buildVignette();

      canvas.addEventListener('pointerdown', (e) => this._onPointer(e));
    }

    /* ---------------- public API ---------------- */

    load(movie) {
      this.movie = movie;
      this._loadAvatars(movie);
      this.peakCommits = Math.max(1, ...movie.weeks.map(w => w.totalCommits));
      this.maxAuthorCommits = Math.max(1, ...movie.authors.map(a => a.totalCommits));
      // playback timeline (seconds of movie-time, before finale)
      this.timelineSec = movie.weeks.length / movie.weeksPerSecond;
      this.totalSec = INTRO_SEC + this.timelineSec; // finale length computed live
      this.reset();
    }

    reset() {
      this.t = 0;                  // current movie time, seconds
      this.phase = 'intro';
      this.hud = { commits: 0, additions: 0, deletions: 0, contributors: 0 };
      this.seenAuthors = new Set();
      this.authorAppearedAt = new Map();
      this.impacts = [];
      this.sparkQueue = [];
      this.activeMilestone = null;
      this.milestoneShownAt = -99;
      this.shownMilestones = new Set();
      this.creditsY = 0;
      this.finaleT = 0;
      this.posterFrame = null;     // snapshot of scene for poster background
      for (const p of this.pool) p.alive = false;
      this._lastWeekEmitted = -1;
    }

    play() {
      if (this.playing) return;
      this.playing = true;
      this._lastTs = 0;
      const loop = (ts) => {
        if (!this.playing) return;
        if (!this._lastTs) this._lastTs = ts;
        const dt = Math.min(0.05, (ts - this._lastTs) / 1000) * this.speed;
        this._lastTs = ts;
        this._step(dt);
        this._draw();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }

    pause() {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      this._lastTs = 0;
    }

    togglePause() { this.playing ? this.pause() : this.play(); }

    replay() { this.reset(); if (!this.playing) this.play(); }

    /** Seek by fraction of the timeline phase (-0.05 / +0.05). */
    seekBy(frac) {
      const target = clamp(this.t + frac * this.timelineSec, 0, INTRO_SEC + this.timelineSec);
      this.seekTo(target);
    }

    /** Seek to absolute movie time (seconds). Recomputes HUD from scratch. */
    seekTo(sec) {
      const wasFinale = this.phase !== 'intro' && this.phase !== 'timeline';
      this.t = clamp(sec, 0, INTRO_SEC + this.timelineSec);
      if (wasFinale) { this.phase = this.t < INTRO_SEC ? 'intro' : 'timeline'; this.finaleT = 0; this.posterFrame = null; }
      else this.phase = this.t < INTRO_SEC ? 'intro' : 'timeline';
      // recompute HUD up to current week
      const wf = this._weekFloat();
      const m = this.movie;
      const h = { commits: 0, additions: 0, deletions: 0 };
      const seen = new Set();
      const wInt = Math.floor(wf);
      for (let i = 0; i <= Math.min(wInt, m.weeks.length - 1); i++) {
        const wk = m.weeks[i];
        h.commits += wk.totalCommits; h.additions += wk.additions; h.deletions += wk.deletions;
        for (const login of wk.perAuthor.keys()) {
          if (!seen.has(login)) {
            seen.add(login);
            this.authorAppearedAt.set(login, this.t - ORBIT_FADE_SEC);
          }
        }
      }
      this.hud = { commits: h.commits, additions: h.additions, deletions: h.deletions };
      this.seenAuthors = seen;
      this.shownMilestones = new Set(m.milestones.filter(ms => ms.weekIdx <= wInt).map(ms => ms.weekIdx));
      this.activeMilestone = null;
      this._lastWeekEmitted = wInt;
      for (const p of this.pool) p.alive = false;
      this.impacts = [];
      this.sparkQueue = [];
      if (!this.playing) this._draw();
    }

    setSpeed(s) { this.speed = s; }

    isFinished() { return this.phase === 'done'; }

    /** Returns the canvas frame snapshot taken at the start of the finale. */
    getPosterFrame() { return this.posterFrame; }

    redraw() { this._draw(); }

    /* ---------------- internals ---------------- */

    _onPointer(e) {
      // click on scrubber (bottom letterbox) → seek
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width * W;
      const y = (e.clientY - rect.top) / rect.height * H;
      if (y > H - LB) {
        const frac = clamp((x - 60) / (W - 120), 0, 1);
        this.seekTo(INTRO_SEC + frac * this.timelineSec);
      }
    }

    _loadAvatars(movie) {
      for (const a of movie.authors) {
        if (!a.avatar || this.avatars.has(a.login)) continue;
        const img = new Image();
        img.crossOrigin = 'anonymous'; // REQUIRED: keeps canvas untainted for PNG/WebM export
        img.onload = () => {
          this.avatars.set(a.login, img);
          this._cacheAvatar(a.login, img, a.color);
        };
        img.onerror = () => { /* fallback circle with initial */ };
        img.src = a.avatar + (a.avatar.includes('?') ? '&' : '?') + 's=96';
      }
    }

    _buildBackground() {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#06080f';
      ctx.fillRect(0, 0, W, H);
      for (const s of this.stars) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = '#cdd6e4';
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      return c;
    }

    _buildVignette() {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      return c;
    }

    _cacheAvatar(login, img, color) {
      const S = 96;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      try {
        ctx.save();
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, S / 2 - 3, 0, TAU);
        ctx.clip();
        ctx.drawImage(img, 0, 0, S, S);
        ctx.restore();
        ctx.strokeStyle = color || '#8b949e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, S / 2 - 3, 0, TAU);
        ctx.stroke();
        this.avatarSprites.set(login, c);
      } catch (e) {
        // If an avatar cannot be safely prerendered, the normal fallback remains.
      }
    }

    _weekFloat() {
      if (this.t <= INTRO_SEC) return 0;
      return clamp((this.t - INTRO_SEC) * this.movie.weeksPerSecond, 0, this.movie.weeks.length - 0.001);
    }

    _step(dt) {
      const m = this.movie;
      if (!m) return;

      if (this.phase === 'intro' || this.phase === 'timeline') {
        this.t += dt;
        if (this.t >= INTRO_SEC && this.phase === 'intro') this.phase = 'timeline';

        const wf = this._weekFloat();
        const wInt = Math.floor(wf);

        // accumulate HUD + emit particles for newly entered weeks
        while (this._lastWeekEmitted < wInt) {
          this._lastWeekEmitted++;
          const wk = m.weeks[this._lastWeekEmitted];
          if (!wk) break;
          this.hud.commits += wk.totalCommits;
          this.hud.additions += wk.additions;
          this.hud.deletions += wk.deletions;
          for (const login of wk.perAuthor.keys()) {
            if (!this.seenAuthors.has(login)) {
              this.seenAuthors.add(login);
              this.authorAppearedAt.set(login, this.t);
            }
          }
          this._queueWeekSparks(wk);
          // milestone?
          const ms = m.milestones.find(x => x.weekIdx === this._lastWeekEmitted);
          if (ms && !this.shownMilestones.has(ms.weekIdx)) {
            this.shownMilestones.add(ms.weekIdx);
            this.activeMilestone = ms;
            this.milestoneShownAt = this.t;
          }
        }

        if (this.t >= INTRO_SEC + this.timelineSec) {
          this.phase = 'freeze';
          this.finaleT = 0;
          if (this.onFinaleStart) this.onFinaleStart();
        }
      } else if (this.phase !== 'done') {
        this.finaleT += dt;
        if (this.phase === 'freeze' && this.finaleT >= FREEZE_SEC) {
          this.phase = 'fade'; this.finaleT = 0;
        } else if (this.phase === 'fade' && this.finaleT >= FADE_SEC) {
          // snapshot the (darkened) scene for the poster background
          this.posterFrame = document.createElement('canvas');
          this.posterFrame.width = W; this.posterFrame.height = H;
          this.posterFrame.getContext('2d').drawImage(this.canvas, 0, 0);
          this.phase = 'poster'; this.finaleT = 0;
        } else if (this.phase === 'poster' && this.finaleT >= POSTER_SEC) {
          this.phase = 'credits'; this.finaleT = 0;
          this.creditsY = H;
        } else if (this.phase === 'credits') {
          this.creditsY -= CREDIT_SPEED * dt;
          const total = (this.movie.credits.length + 4) * CREDIT_LINE_H;
          if (this.creditsY < -total) { this.phase = 'theend'; this.finaleT = 0; }
        } else if (this.phase === 'theend' && this.finaleT >= END_SEC) {
          this.phase = 'done';
          this.pause();
          if (this.onEnd) this.onEnd();
          this._draw();
        }
      }

      this._drainSparkQueue(dt);

      // particles physics
      const cx = W / 2, cy = H / 2;
      for (const p of this.pool) {
        if (!p.alive) continue;
        p.life += dt;
        if (p.life >= p.maxLife) { p.alive = false; continue; }
        p.px = p.x;
        p.py = p.y;
        if (p.kind === 0) { // addition spark — flies toward the star
          const dx = cx - p.x, dy = cy - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 300 * dt;
          p.vy += (dy / d) * 300 * dt;
          if (d < this._starCoreRadius() + 10) {
            const ang = Math.atan2(p.y - cy, p.x - cx);
            const r = this._starCoreRadius() + 3;
            this._impact(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, p.power, ang);
            p.alive = false;
            continue;
          }
        } else {            // deletion ember — drifts away and dies
          p.vx *= (1 - 0.6 * dt);
          p.vy *= (1 - 0.6 * dt);
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (const imp of this.impacts) imp.life += dt;
      this.impacts = this.impacts.filter(imp => imp.life < imp.maxLife);
    }

    _queueWeekSparks(wk) {
      if (wk.totalCommits === 0 && wk.deletions === 0) return;
      // additions: from active planets toward the star. GitHub omits
      // additions/deletions for repos with >10k commits — fall back to commits.
      const addBasis = wk.additions > 0 ? Math.sqrt(wk.additions) / 4 : Math.sqrt(wk.totalCommits) * 1.5;
      const addCount = clamp(Math.round(addBasis * 0.58), wk.totalCommits > 0 ? 1 : 0, 10);
      const delCount = clamp(Math.round(Math.sqrt(wk.deletions) / 10), 0, 4);
      const activeLogins = [...wk.perAuthor.keys()];
      const power = 0.65 + 0.8 * Math.sqrt(clamp(wk.totalCommits / this.peakCommits, 0, 1));
      if (addCount > 0) {
        this.sparkQueue.push({
          kind: 0, count: addCount, emitted: 0, elapsed: 0,
          duration: 0.34 + Math.min(0.28, addCount * 0.018),
          power, logins: activeLogins
        });
      }
      if (delCount > 0) {
        this.sparkQueue.push({
          kind: 1, count: delCount, emitted: 0, elapsed: 0,
          duration: 0.22 + delCount * 0.02,
          power: 0.75, logins: []
        });
      }
      if (this.sparkQueue.length > 18) this.sparkQueue.splice(0, this.sparkQueue.length - 18);
    }

    _drainSparkQueue(dt) {
      if (!this.sparkQueue.length) return;
      for (const q of this.sparkQueue) {
        q.elapsed += dt;
        const want = Math.min(q.count, Math.floor(q.count * clamp(q.elapsed / q.duration, 0, 1)));
        while (q.emitted < want) {
          this._spawnQueuedSpark(q);
          q.emitted++;
        }
      }
      this.sparkQueue = this.sparkQueue.filter(q => q.emitted < q.count);
    }

    _spawnQueuedSpark(q) {
      if (q.kind === 0) {
        const login = q.logins[q.emitted % Math.max(1, q.logins.length)];
        const pos = this._planetPos(login) || { x: W / 2 + 200, y: H / 2 };
        this._spawn(pos.x, pos.y, 0, q.power);
      } else {
        this._spawn(W / 2, H / 2, 1, q.power);
      }
    }

    _spawn(x, y, kind, power) {
      const p = this.pool.find(q => !q.alive);
      if (!p) return;
      p.alive = true;
      p.kind = kind;
      const ang = Math.random() * TAU;
      const sp = kind === 0 ? 34 + Math.random() * 52 : 60 + Math.random() * 90;
      p.x = x + Math.cos(ang) * 6;
      p.y = y + Math.sin(ang) * 6;
      p.px = p.x;
      p.py = p.y;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
      p.life = 0;
      p.maxLife = kind === 0 ? 2.35 + Math.random() * 0.7 : 1.0 + Math.random() * 0.6;
      p.size = kind === 0 ? 0.75 + Math.random() * 0.75 : 0.75 + Math.random() * 0.9;
      p.power = power || 1;
    }

    _impact(x, y, power, ang) {
      this.impacts.push({
        x, y, power: clamp(power || 1, 0.55, 1.6),
        ang: typeof ang === 'number' ? ang : Math.random() * TAU,
        life: 0, maxLife: 0.42
      });
      if (this.impacts.length > 30) this.impacts.shift();
    }

    _planetPos(login) {
      const m = this.movie;
      const i = m.authors.findIndex(a => a.login === login);
      if (i < 0) return null;
      return this._orbitXY(i, m.authors.length);
    }

    _authorFade(login) {
      if (!this.seenAuthors.has(login)) return 0;
      const at = this.authorAppearedAt.get(login);
      if (typeof at !== 'number') return 1;
      return easeOut((this.t - at) / ORBIT_FADE_SEC);
    }

    _starCoreRadius() {
      const m = this.movie;
      if (!m) return 9;
      const grow = Math.sqrt(clamp(this.hud.commits / Math.max(1, m.totals.commits), 0, 1));
      return lerp(8, 38, grow);
    }

    _orbitXY(rank, count) {
      const cx = W / 2, cy = H / 2;
      const rMin = 110, rMax = Math.min(W, H) / 2 - LB - 30;
      const r = rMin + (rMax - rMin) * (rank / Math.max(1, count - 1 || 1));
      const speed = 0.25 / (1 + rank * 0.18);
      const ang = rank * 2.39996 + this.t * speed; // golden-angle spread
      return { x: cx + Math.cos(ang) * r * 1.35, y: cy + Math.sin(ang) * r * 0.78, r };
    }

    /* ---------------- drawing ---------------- */

    _draw() {
      const ctx = this.ctx, m = this.movie;
      if (!m) return;

      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.drawImage(this.background, 0, 0);

      if (this.phase === 'intro') {
        this._drawSceneWithCamera(ctx);
        this._drawIntro(ctx);
      } else if (this.phase === 'timeline' || this.phase === 'freeze') {
        this._drawSceneWithCamera(ctx);
        this._drawLetterbox(ctx);
        this._drawHUD(ctx);
        this._drawMilestone(ctx);
      } else if (this.phase === 'fade') {
        this._drawSceneWithCamera(ctx);
        ctx.fillStyle = 'rgba(0,0,0,' + clamp(this.finaleT / FADE_SEC, 0, 0.85) + ')';
        ctx.fillRect(0, 0, W, H);
      } else if (this.phase === 'poster' || this.phase === 'credits' || this.phase === 'theend' || this.phase === 'done') {
        this._drawFinale(ctx);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.vignette, 0, 0);
      ctx.globalAlpha = 0.009;
      ctx.drawImage(grainCanvas, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    _drawSceneWithCamera(ctx) {
      const cam = this._camera();
      ctx.save();
      ctx.translate(W / 2 + cam.x, H / 2 + cam.y);
      ctx.scale(cam.z, cam.z);
      ctx.translate(-W / 2, -H / 2);
      this._drawScene(ctx);
      ctx.restore();
    }

    _camera() {
      if (this.phase !== 'timeline' && this.phase !== 'freeze') return { x: 0, y: 0, z: 1 };
      const wk = this._currentWeek();
      const act = wk ? Math.sqrt(clamp(wk.totalCommits / this.peakCommits, 0, 1)) : 0;
      return {
        x: Math.sin(this.t * 0.22) * 13 + Math.sin(this.t * 0.61) * 4,
        y: Math.cos(this.t * 0.19) * 7,
        z: 1 + Math.sin(this.t * 0.17) * 0.012 + act * 0.006
      };
    }

    _currentWeek() {
      const wf = this._weekFloat();
      return this.movie.weeks[Math.floor(wf)] || this.movie.weeks[this.movie.weeks.length - 1];
    }

    _drawScene(ctx) {
      const m = this.movie;
      const cx = W / 2, cy = H / 2;
      const wk = this._currentWeek();
      const act = wk ? wk.totalCommits / this.peakCommits : 0;

      // orbits
      for (let i = 0; i < m.authors.length; i++) {
        const fade = this._authorFade(m.authors[i].login);
        if (fade <= 0.01) continue;
        const o = this._orbitXY(i, m.authors.length);
        ctx.globalAlpha = 0.075 * fade;
        ctx.strokeStyle = '#8b949e';
        ctx.lineWidth = 1 + (1 - fade) * 0.6;
        ctx.beginPath();
        ctx.ellipse(cx, cy, o.r * 1.35, o.r * 0.78, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // star (the repo) — born tiny, grows with accumulated commits,
      // while commits now show as surface impacts instead of radius jumps
      const baseR = this._starCoreRadius();
      const coreR = baseR + Math.sin(this.t * 2.2) * 0.7;
      const impactEnergy = clamp(this.impacts.reduce((s, imp) => {
        return s + (1 - imp.life / imp.maxLife) * imp.power;
      }, 0), 0, 3.5);
      const activityGlow = Math.sqrt(clamp(act, 0, 1)) * 12;
      const colors = m.meta.langColors;
      const haloR = coreR * 2.55 + activityGlow + impactEnergy * 7;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(cx, cy, coreR * 0.35, cx, cy, haloR);
      halo.addColorStop(0, 'rgba(255,255,255,0.72)');
      colors.forEach((c, i) => halo.addColorStop(0.18 + 0.42 * (i + 1) / (colors.length + 1), c));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.58;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, TAU);
      ctx.fill();
      ctx.restore();

      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, coreR * 1.15);
      g.addColorStop(0, '#ffffff');
      colors.forEach((c, i) => g.addColorStop(0.22 + 0.48 * (i + 1) / (colors.length + 1), c));
      g.addColorStop(1, '#f5c518');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245,197,24,' + (0.18 + Math.min(0.26, impactEnergy * 0.06)) + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR + 3 + impactEnergy * 0.6, 0, TAU);
      ctx.stroke();

      // particles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of this.pool) {
        if (!p.alive) continue;
        const a = 1 - p.life / p.maxLife;
        const color = p.kind === 0 ? '63,185,80' : '248,81,73';
        const tail = p.kind === 0 ? 0.075 : 0.05;
        const tx = p.x - p.vx * tail;
        const ty = p.y - p.vy * tail;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(' + color + ',' + (0.66 * a) + ')';
        ctx.lineWidth = Math.max(0.75, p.size * 1.15);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = a * (p.kind === 0 ? 0.98 : 0.82);
        ctx.fillStyle = 'rgb(' + color + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      this._drawImpacts(ctx);

      // planets (contributors)
      for (let i = 0; i < m.authors.length; i++) {
        const a = m.authors[i];
        const fade = this._authorFade(a.login);
        if (fade <= 0.01) continue;
        const o = this._orbitXY(i, m.authors.length);
        const size = (9 + 17 * Math.sqrt(a.totalCommits / this.maxAuthorCommits)) * (0.84 + 0.16 * fade);
        const activeNow = wk && wk.perAuthor.has(a.login);
        ctx.save();
        ctx.globalAlpha = fade;

        if (activeNow) { // flash halo
          ctx.globalAlpha = fade * (0.18 + 0.08 * Math.sin(this.t * 5));
          ctx.fillStyle = a.color;
          ctx.beginPath();
          ctx.arc(o.x, o.y, size + 7, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = fade;
        }

        const sprite = this.avatarSprites.get(a.login);
        const img = this.avatars.get(a.login);
        if (sprite) {
          ctx.drawImage(sprite, o.x - size, o.y - size, size * 2, size * 2);
        } else if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(o.x, o.y, size, 0, TAU);
          ctx.clip();
          ctx.drawImage(img, o.x - size, o.y - size, size * 2, size * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = a.color;
          ctx.beginPath();
          ctx.arc(o.x, o.y, size, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#06080f';
          ctx.font = 'bold ' + Math.round(size) + 'px ui-monospace, Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((a.login[0] || '?').toUpperCase(), o.x, o.y + 1);
        }
        ctx.restore();
      }
    }

    _drawImpacts(ctx) {
      if (!this.impacts.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const imp of this.impacts) {
        const t = clamp(imp.life / imp.maxLife, 0, 1);
        const a = (1 - t) * imp.power;
        const ringR = 4 + t * 24 * imp.power;
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.strokeStyle = '#f5c518';
        ctx.lineWidth = 1.1 + (1 - t) * 1.1;
        ctx.beginPath();
        ctx.arc(imp.x, imp.y, ringR, 0, TAU);
        ctx.stroke();

        ctx.globalAlpha = clamp(0.72 * a, 0, 0.9);
        ctx.fillStyle = '#ffe68a';
        ctx.beginPath();
        ctx.arc(imp.x, imp.y, 2.4 + 3.2 * (1 - t) * imp.power, 0, TAU);
        ctx.fill();

        for (let i = 0; i < 2; i++) {
          const ang = imp.ang + (i - 0.5) * 0.65 + Math.sin(imp.life * 14 + i) * 0.18;
          const len = (8 + 15 * t) * imp.power;
          ctx.globalAlpha = clamp(a * 0.58, 0, 0.76);
          ctx.strokeStyle = '#ffe68a';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(imp.x, imp.y);
          ctx.lineTo(imp.x + Math.cos(ang) * len, imp.y + Math.sin(ang) * len);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    _drawIntro(ctx) {
      const m = this.movie;
      const t = this.t / INTRO_SEC;
      const a = t < 0.15 ? t / 0.15 : (t > 0.85 ? (1 - t) / 0.15 : 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8b949e';
      ctx.font = 'italic 22px Georgia, serif';
      ctx.fillText(tr('film_presents'), W / 2, H / 2 - 70);
      ctx.fillStyle = '#f5c518';
      ctx.font = 'bold 56px Georgia, serif';
      ctx.fillText(m.meta.fullName, W / 2, H / 2);
      ctx.fillStyle = '#e8e6e3';
      ctx.font = 'italic 20px Georgia, serif';
      ctx.fillText(tr('film_based', m.totals.commits), W / 2, H / 2 + 50);
      ctx.globalAlpha = 1;
    }

    _drawLetterbox(ctx) {
      const m = this.movie;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, LB);
      ctx.fillRect(0, H - LB, W, LB);

      // current date + scrubber in bottom bar
      const wk = this._currentWeek();
      ctx.fillStyle = '#f5c518';
      ctx.font = '20px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      if (wk) ctx.fillText(monthYear(wk.t), 60, H - LB / 2 - 14);

      const frac = clamp((this.t - INTRO_SEC) / this.timelineSec, 0, 1);
      const bx = 60, bw = W - 120, by = H - LB / 2 + 14;
      ctx.fillStyle = 'rgba(139,148,158,0.3)';
      ctx.fillRect(bx, by - 2, bw, 4);
      ctx.fillStyle = '#f5c518';
      ctx.fillRect(bx, by - 2, bw * frac, 4);
      ctx.beginPath();
      ctx.arc(bx + bw * frac, by, 7, 0, TAU);
      ctx.fill();
    }

    _drawMilestone(ctx) {
      const ms = this.activeMilestone;
      if (!ms) return;
      const dt = this.t - this.milestoneShownAt;
      const DUR = 3.2;
      if (dt > DUR) { this.activeMilestone = null; return; }
      const text = milestoneText(ms);
      // typewriter reveal then fade
      const chars = Math.min(text.length, Math.floor(dt / 0.04));
      const alpha = dt > DUR - 0.8 ? (DUR - dt) / 0.8 : 1;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = '#e8e6e3';
      ctx.font = 'italic 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.slice(0, chars), W / 2, LB / 2);
      ctx.globalAlpha = 1;
    }

    _drawHUD(ctx) {
      const h = this.hud;
      ctx.font = '15px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      const x = W - 24;
      let y = LB + 16;
      ctx.fillStyle = '#e8e6e3';
      ctx.fillText(tr('film_hud_commits', h.commits), x, y); y += 22;
      // count people, not planets: "+ N others" carries the weight of N
      const people = this.movie.authors.reduce(
        (s, a) => s + (this.seenAuthors.has(a.login) ? (a.count || 1) : 0), 0);
      ctx.fillStyle = '#8b949e';
      ctx.fillText(tr('film_hud_contributors', people), x, y); y += 22;
      if (this.movie.totals.additions > 0 || this.movie.totals.deletions > 0) {
        ctx.fillStyle = '#3fb950';
        ctx.fillText('+' + fmt(h.additions), x, y); y += 22;
        ctx.fillStyle = '#f85149';
        ctx.fillText('−' + fmt(h.deletions), x, y);
      }
    }

    _drawFinale(ctx) {
      const m = this.movie;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      if (this.phase === 'poster') {
        const a = clamp(this.finaleT / 0.8, 0, 1);
        ctx.globalAlpha = a;
        RC_EXPORT.drawPoster(ctx, m, this.posterFrame, W, H);
        ctx.globalAlpha = 1;
      } else if (this.phase === 'credits') {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#02040a');
        bg.addColorStop(0.5, '#080b14');
        bg.addColorStop(1, '#02040a');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(245,197,24,0.28)';
        ctx.fillRect(180, 104, W - 360, 1);
        ctx.fillRect(180, H - 82, W - 360, 1);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f5c518';
        ctx.font = 'italic 28px Georgia, serif';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 12;
        ctx.fillText(tr('film_credits_title', m.credits.length), W / 2, 72);
        ctx.save();
        ctx.beginPath();
        ctx.rect(140, 124, W - 280, H - 226);
        ctx.clip();
        ctx.font = '17px ui-monospace, Consolas, monospace';
        let y = this.creditsY;
        const lines = m.credits.length ? m.credits : [tr('film_no_credits')];
        for (const line of lines) {
          if (y > 104 && y < H - 72) {
            ctx.fillStyle = '#d7dee8';
            ctx.fillText(line, W / 2, y);
          }
          y += CREDIT_LINE_H;
        }
        ctx.restore();
        ctx.shadowBlur = 0;
      } else { // theend / done
        const a = clamp(this.finaleT / 1.0, 0, 1);
        ctx.globalAlpha = this.phase === 'done' ? 1 : a;
        ctx.fillStyle = '#f5c518';
        ctx.font = 'bold 72px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tr('film_the_end'), W / 2, H / 2 - 20);
        ctx.fillStyle = '#8b949e';
        ctx.font = 'italic 20px Georgia, serif';
        ctx.fillText(tr('film_tagline'), W / 2, H / 2 + 44);
        ctx.globalAlpha = 1;
        // final HUD line: totals
        const t = m.totals;
        ctx.fillStyle = '#e8e6e3';
        ctx.font = '16px ui-monospace, Consolas, monospace';
        let line = tr('film_final_totals', { commits: t.commits, contributors: t.contributors });
        if (t.additions > 0 || t.deletions > 0) {
          line += ' · +' + fmt(t.additions) + ' −' + fmt(t.deletions);
        }
        ctx.fillText(line, W / 2, H / 2 + 100);
      }
    }
  }

  return { Cinema, W, H };
})();
