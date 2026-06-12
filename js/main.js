/* main.js — UI glue: screens, form, demos, URL params, keyboard, buttons. */

'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const startScreen = $('start-screen');
  const loadingScreen = $('loading-screen');
  const cinemaScreen = $('cinema-screen');
  const loadingText = $('loading-text');
  const errorBox = $('error-box');

  const canvas = $('scene');
  const cinema = new RC_CINEMA.Cinema(canvas);

  let currentMovie = null;
  let recorder = null;
  const SPEEDS = [0.5, 1, 2];
  let speedIdx = 1;

  /* ---------- screens ---------- */

  function show(screen) {
    for (const s of [startScreen, loadingScreen, cinemaScreen]) {
      s.classList.toggle('hidden', s !== screen);
    }
  }

  function showError(msg) {
    show(startScreen);
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }

  function fitCanvas() {
    // keep the 16:9 internal canvas letterboxed inside the window
    const wrap = $('canvas-wrap');
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    if (!availW || !availH) return;
    const scale = Math.min(availW / RC_CINEMA.W, availH / RC_CINEMA.H);
    canvas.style.width = Math.floor(RC_CINEMA.W * scale) + 'px';
    canvas.style.height = Math.floor(RC_CINEMA.H * scale) + 'px';
  }
  window.addEventListener('resize', fitCanvas);

  /* ---------- launching a film ---------- */

  function startMovie(movie, fullName) {
    currentMovie = movie;
    show(cinemaScreen);
    fitCanvas();
    cinema.load(movie);
    cinema.play();
    // reflect repo in the URL so the link is instantly shareable
    try {
      const u = new URL(location.href);
      u.searchParams.set('repo', fullName);
      history.replaceState(null, '', u);
    } catch (e) { /* file:// — fine */ }
  }

  async function premiere(input) {
    const parsed = RC_API.parseRepoInput(input);
    if (!parsed) {
      showError('That does not look like a GitHub repository. Try "owner/repo" or a full github.com URL.');
      return;
    }
    errorBox.classList.add('hidden');
    show(loadingScreen);
    loadingText.textContent = 'Reading the script…';
    try {
      const bundle = await RC_API.fetchRepoBundle(parsed.owner, parsed.repo,
        (msg) => { loadingText.textContent = msg; });
      const movie = RC_TIMELINE.buildMovie(bundle);
      startMovie(movie, bundle.meta.full_name);
    } catch (e) {
      showError(e && e.message ? e.message : 'Something went wrong. The projector jammed.');
    }
  }

  async function premiereDemo(name) {
    errorBox.classList.add('hidden');
    show(loadingScreen);
    loadingText.textContent = 'Rewinding the demo reel…';
    try {
      const bundle = await RC_API.fetchDemo(name);
      const movie = RC_TIMELINE.buildMovie(bundle);
      startMovie(movie, bundle.meta.full_name);
    } catch (e) {
      showError('Could not load the demo: ' + (e && e.message ? e.message : e));
    }
  }

  /* ---------- start screen wiring ---------- */

  $('repo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('repo-input').value.trim();
    if (v) premiere(v);
  });

  document.querySelectorAll('.demo-btn').forEach(btn => {
    btn.addEventListener('click', () => premiereDemo(btn.dataset.demo));
  });

  const tokenInput = $('token-input');
  tokenInput.value = RC_API.getToken();
  tokenInput.addEventListener('change', () => RC_API.setToken(tokenInput.value));

  /* ---------- cinema controls ---------- */

  const btnPause = $('btn-pause');
  function syncPauseBtn() { btnPause.textContent = cinema.playing ? '⏸' : '▶'; }

  $('btn-replay').addEventListener('click', () => { cinema.replay(); syncPauseBtn(); });

  btnPause.addEventListener('click', () => {
    if (cinema.isFinished()) cinema.replay(); else cinema.togglePause();
    syncPauseBtn();
  });

  const btnSpeed = $('btn-speed');
  btnSpeed.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    cinema.setSpeed(SPEEDS[speedIdx]);
    btnSpeed.textContent = '×' + SPEEDS[speedIdx];
  });

  $('btn-poster').addEventListener('click', async () => {
    if (!currentMovie) return;
    try {
      // use the finale frame if we have one; otherwise snapshot the live scene
      let frame = cinema.getPosterFrame();
      if (!frame) {
        frame = document.createElement('canvas');
        frame.width = canvas.width; frame.height = canvas.height;
        frame.getContext('2d').drawImage(canvas, 0, 0);
      }
      await RC_EXPORT.downloadPoster(currentMovie, frame);
    } catch (e) {
      alert('Poster export failed: ' + e.message);
    }
  });

  const btnRecord = $('btn-record');
  btnRecord.addEventListener('click', () => {
    if (!currentMovie) return;
    if (recorder) { // stop early
      recorder.stop();
      recorder = null;
      btnRecord.classList.remove('recording');
      btnRecord.textContent = '⏺ Record';
      return;
    }
    recorder = RC_EXPORT.recordMovie(cinema, currentMovie,
      () => {
        recorder = null;
        btnRecord.classList.remove('recording');
        btnRecord.textContent = '⏺ Record';
      },
      (err) => {
        recorder = null;
        btnRecord.classList.remove('recording');
        btnRecord.textContent = '⏺ Record';
        alert('Recording failed: ' + err.message);
      });
    if (recorder) {
      btnRecord.classList.add('recording');
      btnRecord.textContent = '⏹ Stop';
      syncPauseBtn();
    }
  });

  const btnCopy = $('btn-copylink');
  btnCopy.addEventListener('click', async () => {
    if (!currentMovie) return;
    const ok = await RC_EXPORT.copyShareLink(currentMovie.meta.fullName);
    btnCopy.textContent = ok ? '✓ Copied!' : '✗ Copy failed';
    setTimeout(() => { btnCopy.textContent = '🔗 Copy link'; }, 1800);
  });

  $('btn-back').addEventListener('click', () => {
    if (recorder) { recorder.stop(); recorder = null; }
    cinema.pause();
    try {
      const u = new URL(location.href);
      u.searchParams.delete('repo');
      history.replaceState(null, '', u);
    } catch (e) { /* ignore */ }
    show(startScreen);
  });

  /* ---------- keyboard ---------- */

  document.addEventListener('keydown', (e) => {
    if (cinemaScreen.classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (cinema.isFinished()) cinema.replay(); else cinema.togglePause();
      syncPauseBtn();
    } else if (e.code === 'ArrowLeft') {
      cinema.seekBy(-0.05);
    } else if (e.code === 'ArrowRight') {
      cinema.seekBy(0.05);
    }
  });

  /* ---------- autoplay via ?repo= ---------- */

  // small debug handle (also handy in DevTools)
  window.__rc = { cinema, get movie() { return currentMovie; } };

  const params = new URLSearchParams(location.search);
  const repoParam = params.get('repo');
  if (repoParam) {
    $('repo-input').value = repoParam;
    premiere(repoParam);
  }
})();
