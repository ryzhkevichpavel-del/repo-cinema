/* export.js — 1200×630 poster PNG and movie video recording
   (canvas.captureStream + MediaRecorder). */

'use strict';

const RC_EXPORT = (() => {

  const fmt = (n) => typeof RC_I18N !== 'undefined'
    ? RC_I18N.fmt(n)
    : Math.round(n || 0).toLocaleString('en-US');

  function tr(key, arg) {
    return typeof RC_I18N !== 'undefined' ? RC_I18N.t(key, arg) : key;
  }

  function starsLabel(n) {
    if (n >= 1000) return tr('poster_stars_k', Math.round(n / 100) / 10);
    return '★ ' + fmt(n);
  }

  /** Draw the poster onto any 2D context sized w×h.
      Used both by the in-movie finale (1280×720) and the PNG export (1200×630). */
  function drawPoster(ctx, movie, sceneFrame, w, h) {
    const m = movie.meta;

    // background: the captured scene frame, darkened, with vignette
    ctx.fillStyle = '#06080f';
    ctx.fillRect(0, 0, w, h);
    if (sceneFrame) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(sceneFrame, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0.1)');
    vg.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // thin golden frame
    ctx.strokeStyle = 'rgba(245,197,24,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, w - 48, h - 48);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // eyebrow
    ctx.fillStyle = '#8b949e';
    ctx.font = 'italic ' + Math.round(h * 0.032) + 'px Georgia, serif';
    ctx.fillText(tr('poster_presents'), w / 2, h * 0.18);

    // title — fit width
    const name = m.fullName.toUpperCase();
    let size = Math.round(h * 0.12);
    ctx.font = 'bold ' + size + 'px Georgia, serif';
    while (ctx.measureText(name).width > w * 0.85 && size > 18) {
      size -= 2;
      ctx.font = 'bold ' + size + 'px Georgia, serif';
    }
    ctx.fillStyle = '#f5c518';
    ctx.shadowColor = 'rgba(245,197,24,0.45)';
    ctx.shadowBlur = 30;
    ctx.fillText(name, w / 2, h * 0.34);
    ctx.shadowBlur = 0;

    // taglines
    const years = movie.meta.ageYears;
    const yearsTxt = years >= 1
      ? tr('poster_years', Math.round(years))
      : tr('poster_months', Math.max(1, Math.round(years * 12)));
    const lines = [
      tr('poster_by_contributors', movie.totals.contributors),
      tr('poster_based', movie.totals.commits),
      yearsTxt,
      starsLabel(m.stars)
    ];
    ctx.fillStyle = '#e8e6e3';
    ctx.font = 'italic ' + Math.round(h * 0.038) + 'px Georgia, serif';
    let y = h * 0.5;
    for (const line of lines) {
      ctx.fillText(line, w / 2, y);
      y += h * 0.066;
    }

    // starring
    const star = movie.authors[0];
    if (star && !star.login.startsWith('+')) {
      ctx.fillStyle = '#8b949e';
      ctx.font = Math.round(h * 0.03) + 'px Georgia, serif';
      ctx.fillText(tr('poster_starring', star.login), w / 2, y + h * 0.01);
    }

    // footer URL
    ctx.fillStyle = '#8b949e';
    ctx.font = Math.round(h * 0.024) + 'px ui-monospace, Consolas, monospace';
    ctx.fillText('repo-cinema · ' + shareUrl(m.fullName), w / 2, h - 44);
  }

  function shareUrl(fullName) {
    const base = location.origin + location.pathname;
    return base + '?repo=' + fullName;
  }

  /** Render the poster at 1200×630 and download as PNG. */
  function downloadPoster(movie, sceneFrame) {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    drawPoster(c.getContext('2d'), movie, sceneFrame, 1200, 630);
    return new Promise((resolve, reject) => {
      try {
        c.toBlob((blob) => {
          if (!blob) { reject(new Error('toBlob returned null')); return; }
          triggerDownload(blob, movie.meta.fullName.replace('/', '-') + '-poster.png');
          resolve();
        }, 'image/png');
      } catch (e) {
        reject(e); // SecurityError here would mean a tainted canvas
      }
    });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function pickMime() {
    const candidates = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    for (const m of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  /** Record the movie from the beginning until THE END.
      Returns a controller with stop(). onDone(blob) fires when finished. */
  function recordMovie(cinema, movie, onDone, onError) {
    const mime = pickMime();
    if (!mime) {
      onError(new Error(typeof RC_I18N !== 'undefined'
        ? RC_I18N.t('err_norecord')
        : 'Video recording is not supported in this browser.'));
      return null;
    }
    const stream = cinema.canvas.captureStream(30);
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    } catch (e) { onError(e); return null; }

    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mime });
      triggerDownload(blob, movie.meta.fullName.replace('/', '-') + '-movie.' + ext);
      onDone(blob);
    };
    rec.onerror = (e) => onError(e.error || new Error('Recording failed'));

    // restart film from the beginning, stop recording at THE END
    const prevOnEnd = cinema.onEnd;
    cinema.onEnd = () => {
      cinema.onEnd = prevOnEnd;
      if (rec.state !== 'inactive') rec.stop();
      if (prevOnEnd) prevOnEnd();
    };
    cinema.replay();
    rec.start(250);

    return {
      stop() {
        cinema.onEnd = prevOnEnd;
        if (rec.state !== 'inactive') rec.stop();
      }
    };
  }

  async function copyShareLink(fullName) {
    const url = shareUrl(fullName);
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (e) {
      // clipboard API may be unavailable (insecure context) — fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { /* give up */ }
      ta.remove();
      return ok;
    }
  }

  return { drawPoster, downloadPoster, recordMovie, copyShareLink, shareUrl };
})();
