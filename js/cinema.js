/* cinema.js — Canvas 2D renderer. The repo is a star; contributors are
   planets on orbits; commits become particles. Letterbox, milestones, HUD,
   finale with poster card, rolling credits and THE END. */

'use strict';

const RC_CINEMA = (() => {

  const W = 1280, H = 720;             // internal 16:9 resolution
  const LB = Math.round(H * 0.12);     // letterbox bar height
  const MAX_PARTICLES = 400;
  const INTRO_SEC = 3.5;
  const FREEZE_SEC = 1.2;
  const FADE_SEC = 1.5;
  const POSTER_SEC = 4.0;
  const END_SEC = 3.0;
  const CREDIT_LINE_H = 30;
  const CREDIT_SPEED = 130;            // px/sec

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  function monthYear(ts) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  /* ---------- film grain: small noise canvas, regenerated each frame ---------- */
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

  /* ---------- particle pool ---------- */
  function makePool() {
    const pool = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, kind: 0, size: 1 });
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

      canvas.addEventListener('pointerdown', (e) => this._onPointer(e));
    }

    /* ---------------- public API ---------------- */

    load(movie) {
      this.movie = movie;
      this._loadAvatars(movie);
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
        for (const login of wk.perAuthor.keys()) seen.add(login);
      }
      this.hud = { commits: h.commits, additions: h.additions, deletions: h.deletions };
      this.seenAuthors = seen;
      this.shownMilestones = new Set(m.milestones.filter(ms => ms.weekIdx <= wInt).map(ms => ms.weekIdx));
      this.activeMilestone = null;
      this._lastWeekEmitted = wInt;
      for (const p of this.pool) p.alive = false;
      if (!this.playing) this._draw();
    }

    setSpeed(s) { this.speed = s; }

    isFinished() { return this.phase === 'done'; }

    /** Returns the canvas frame snapshot taken at the start of the finale. */
    getPosterFrame() { return this.posterFrame; }

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
        img.onload = () => this.avatars.set(a.login, img);
        img.onerror = () => { /* fallback circle with initial */ };
        img.src = a.avatar + (a.avatar.includes('?') ? '&' : '?') + 's=96';
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
          for (const login of wk.perAuthor.keys()) this.seenAuthors.add(login);
          this._emitWeek(wk);
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

      // particles physics
      const cx = W / 2, cy = H / 2;
      for (const p of this.pool) {
        if (!p.alive) continue;
        p.life += dt;
        if (p.life >= p.maxLife) { p.alive = false; continue; }
        if (p.kind === 0) { // addition spark — flies toward the star
          const dx = cx - p.x, dy = cy - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 260 * dt;
          p.vy += (dy / d) * 260 * dt;
          if (d < 30) p.alive = false;
        } else {            // deletion ember — drifts away and dies
          p.vx *= (1 - 0.6 * dt);
          p.vy *= (1 - 0.6 * dt);
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    _emitWeek(wk) {
      if (wk.totalCommits === 0 && wk.deletions === 0) return;
      const m = this.movie;
      // additions: from active planets toward the star. GitHub omits
      // additions/deletions for repos with >10k commits — fall back to commits.
      const addBasis = wk.additions > 0 ? Math.sqrt(wk.additions) / 4 : Math.sqrt(wk.totalCommits) * 1.5;
      const addCount = clamp(Math.round(addBasis), wk.totalCommits > 0 ? 2 : 0, 24);
      const delCount = clamp(Math.round(Math.sqrt(wk.deletions) / 5), 0, 14);
      const activeLogins = [...wk.perAuthor.keys()];
      for (let i = 0; i < addCount; i++) {
        const login = activeLogins[i % Math.max(1, activeLogins.length)];
        const pos = this._planetPos(login) || { x: W / 2 + 200, y: H / 2 };
        this._spawn(pos.x, pos.y, 0);
      }
      for (let i = 0; i < delCount; i++) {
        this._spawn(W / 2, H / 2, 1);
      }
    }

    _spawn(x, y, kind) {
      const p = this.pool.find(q => !q.alive);
      if (!p) return;
      p.alive = true;
      p.kind = kind;
      const ang = Math.random() * TAU;
      const sp = kind === 0 ? 30 + Math.random() * 50 : 90 + Math.random() * 120;
      p.x = x + Math.cos(ang) * 6;
      p.y = y + Math.sin(ang) * 6;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
      p.life = 0;
      p.maxLife = kind === 0 ? 2.2 + Math.random() : 1.0 + Math.random() * 0.8;
      p.size = kind === 0 ? 1.5 + Math.random() * 1.5 : 1.5 + Math.random() * 2;
    }

    _planetPos(login) {
      const m = this.movie;
      const i = m.authors.findIndex(a => a.login === login);
      if (i < 0) return null;
      return this._orbitXY(i, m.authors.length);
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

      // background
      ctx.fillStyle = '#06080f';
      ctx.fillRect(0, 0, W, H);

      // stars
      for (const s of this.stars) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = '#cdd6e4';
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      if (this.phase === 'intro') {
        this._drawScene(ctx, 0.001);
        this._drawIntro(ctx);
      } else if (this.phase === 'timeline' || this.phase === 'freeze') {
        this._drawScene(ctx, 1);
        this._drawLetterbox(ctx);
        this._drawHUD(ctx);
        this._drawMilestone(ctx);
      } else if (this.phase === 'fade') {
        this._drawScene(ctx, 1);
        ctx.fillStyle = 'rgba(0,0,0,' + clamp(this.finaleT / FADE_SEC, 0, 0.85) + ')';
        ctx.fillRect(0, 0, W, H);
      } else if (this.phase === 'poster' || this.phase === 'credits' || this.phase === 'theend' || this.phase === 'done') {
        this._drawFinale(ctx);
      }

      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // film grain — doubles as noise dithering: breaks up banding in the
      // dark radial gradients (star halo, vignette) far cheaper than
      // per-pixel ordered dithering would
      refreshGrain();
      ctx.globalAlpha = 0.055;
      ctx.drawImage(grainCanvas, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    _currentWeek() {
      const wf = this._weekFloat();
      return this.movie.weeks[Math.floor(wf)] || this.movie.weeks[this.movie.weeks.length - 1];
    }

    _drawScene(ctx, intensity) {
      const m = this.movie;
      const cx = W / 2, cy = H / 2;
      const wk = this._currentWeek();
      const peak = Math.max(1, ...m.weeks.map(w => w.totalCommits));
      const act = wk ? wk.totalCommits / peak : 0;

      // orbits
      ctx.strokeStyle = 'rgba(139,148,158,0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < m.authors.length; i++) {
        if (!this.seenAuthors.has(m.authors[i].login) && intensity >= 1) continue;
        const o = this._orbitXY(i, m.authors.length);
        ctx.beginPath();
        ctx.ellipse(cx, cy, o.r * 1.35, o.r * 0.78, 0, 0, TAU);
        ctx.stroke();
      }

      // star (the repo) — born tiny, grows with accumulated commits,
      // and pulses with the current week's activity
      const grow = Math.sqrt(clamp(this.hud.commits / Math.max(1, m.totals.commits), 0, 1));
      const baseR = lerp(9, 36, grow);
      const pulse = baseR + act * 26 + Math.sin(this.t * 3) * 2.5;
      const colors = m.meta.langColors;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, pulse * 2.4);
      g.addColorStop(0, '#ffffff');
      colors.forEach((c, i) => g.addColorStop(0.18 + 0.5 * (i + 1) / (colors.length + 1), c));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, pulse * 2.4, 0, TAU);
      ctx.fill();

      // particles
      for (const p of this.pool) {
        if (!p.alive) continue;
        const a = 1 - p.life / p.maxLife;
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = p.kind === 0 ? '#3fb950' : '#f85149';
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // planets (contributors)
      const maxC = Math.max(1, ...m.authors.map(a => a.totalCommits));
      for (let i = 0; i < m.authors.length; i++) {
        const a = m.authors[i];
        const entered = this.seenAuthors.has(a.login);
        if (!entered) continue;
        const o = this._orbitXY(i, m.authors.length);
        const size = 9 + 17 * Math.sqrt(a.totalCommits / maxC);
        const activeNow = wk && wk.perAuthor.has(a.login);

        if (activeNow) { // flash halo
          ctx.globalAlpha = 0.35 + 0.2 * Math.sin(this.t * 8);
          ctx.fillStyle = a.color;
          ctx.beginPath();
          ctx.arc(o.x, o.y, size + 7, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        const img = this.avatars.get(a.login);
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(o.x, o.y, size, 0, TAU);
          ctx.clip();
          ctx.drawImage(img, o.x - size, o.y - size, size * 2, size * 2);
          ctx.restore();
          ctx.strokeStyle = a.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(o.x, o.y, size, 0, TAU);
          ctx.stroke();
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
      }
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
      ctx.fillText('REPO CINEMA presents', W / 2, H / 2 - 70);
      ctx.fillStyle = '#f5c518';
      ctx.font = 'bold 56px Georgia, serif';
      ctx.fillText(m.meta.fullName, W / 2, H / 2);
      ctx.fillStyle = '#e8e6e3';
      ctx.font = 'italic 20px Georgia, serif';
      ctx.fillText('Based on ' + fmt(m.totals.commits) + ' true commits', W / 2, H / 2 + 50);
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
      // typewriter reveal then fade
      const chars = Math.min(ms.text.length, Math.floor(dt / 0.04));
      const alpha = dt > DUR - 0.8 ? (DUR - dt) / 0.8 : 1;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = '#e8e6e3';
      ctx.font = 'italic 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ms.text.slice(0, chars), W / 2, LB / 2);
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
      ctx.fillText(fmt(h.commits) + ' commits', x, y); y += 22;
      // count people, not planets: "+ N others" carries the weight of N
      const people = this.movie.authors.reduce(
        (s, a) => s + (this.seenAuthors.has(a.login) ? (a.count || 1) : 0), 0);
      ctx.fillStyle = '#8b949e';
      ctx.fillText(fmt(people) + ' contributors', x, y); y += 22;
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
        // dim poster behind credits
        ctx.globalAlpha = 0.25;
        RC_EXPORT.drawPoster(ctx, m, this.posterFrame, W, H);
        ctx.globalAlpha = 1;
        ctx.font = '18px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let y = this.creditsY;
        ctx.fillStyle = '#f5c518';
        ctx.font = 'italic 24px Georgia, serif';
        ctx.fillText('— the last ' + m.credits.length + ' commits —', W / 2, y);
        y += CREDIT_LINE_H * 2;
        ctx.font = '17px ui-monospace, Consolas, monospace';
        for (const line of m.credits) {
          if (y > -CREDIT_LINE_H && y < H + CREDIT_LINE_H) {
            ctx.fillStyle = '#8b949e';
            ctx.fillText(line, W / 2, y);
          }
          y += CREDIT_LINE_H;
        }
      } else { // theend / done
        const a = clamp(this.finaleT / 1.0, 0, 1);
        ctx.globalAlpha = this.phase === 'done' ? 1 : a;
        ctx.fillStyle = '#f5c518';
        ctx.font = 'bold 72px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('THE END', W / 2, H / 2 - 20);
        ctx.fillStyle = '#8b949e';
        ctx.font = 'italic 20px Georgia, serif';
        ctx.fillText('Every repo deserves a premiere.', W / 2, H / 2 + 44);
        ctx.globalAlpha = 1;
        // final HUD line: totals
        const t = m.totals;
        ctx.fillStyle = '#e8e6e3';
        ctx.font = '16px ui-monospace, Consolas, monospace';
        let line = fmt(t.commits) + ' commits · ' + fmt(t.contributors) + ' contributors';
        if (t.additions > 0 || t.deletions > 0) {
          line += ' · +' + fmt(t.additions) + ' −' + fmt(t.deletions);
        }
        ctx.fillText(line, W / 2, H / 2 + 100);
      }
    }
  }

  return { Cinema, W, H };
})();
