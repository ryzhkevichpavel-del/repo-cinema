/* timeline.js — turns the raw API bundle into a Movie "screenplay":
   weekly timeline, top-20 cast, milestones, credits, totals. */

'use strict';

const RC_TIMELINE = (() => {

  // GitHub linguist colors for common languages (subset; fallback gold).
  const LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
    Java: '#b07219', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
    Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516', PHP: '#4F5D95',
    Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', Shell: '#89e051',
    HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Vue: '#41b883',
    'Objective-C': '#438eff', Scala: '#c22d40', Haskell: '#5e5086',
    Lua: '#000080', Perl: '#0298c3', R: '#198CE7', Julia: '#a270ba',
    Elixir: '#6e4a7e', Clojure: '#db5855', Assembly: '#6E4C13',
    Makefile: '#427819', Dockerfile: '#384d54', 'Jupyter Notebook': '#DA5B0B',
    MDX: '#fcb32c', Zig: '#ec915c', Nim: '#ffc200', OCaml: '#ef7a08'
  };

  const AUTHOR_PALETTE = [
    '#f5c518', '#58a6ff', '#3fb950', '#ff7b72', '#d2a8ff',
    '#79c0ff', '#ffa657', '#7ee787', '#f778ba', '#a5d6ff',
    '#e3b341', '#56d364', '#ffab70', '#b392f0', '#85e89d',
    '#9ecbff', '#fdaeb7', '#ffea7f', '#bef5cb', '#c8e1ff'
  ];

  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function monthYear(ts) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  /** Build the Movie object from an API bundle (see plan §5). */
  function buildMovie(bundle) {
    const meta = bundle.meta;
    // Demo snapshots may carry a synthetic "+ N others" record (count field);
    // keep it out of the top-20 sort so it never "stars" in the film.
    const all = bundle.contributors.slice();
    const synthetic = all.filter(c => c.count > 1);
    const real = all.filter(c => !(c.count > 1)).sort((a, b) => b.total - a.total);
    const contributors = real.concat(synthetic);
    const contributorCount = all.reduce((s, c) => s + (c.count || 1), 0);

    // --- global week range: first week with any activity → last week ---
    let minW = Infinity, maxW = -Infinity;
    for (const c of contributors) {
      for (const w of c.weeks) {
        if (w.c > 0) { if (w.w < minW) minW = w.w; if (w.w > maxW) maxW = w.w; }
      }
    }
    if (!isFinite(minW)) {
      // No weekly activity in the (last-year-windowed) stats — degenerate repo.
      minW = Math.floor(new Date(meta.created_at).getTime() / 1000);
      maxW = Math.floor(Date.now() / 1000);
    }
    const totalWeeks = Math.max(1, Math.round((maxW - minW) / (WEEK_MS / 1000)) + 1);

    // --- weeks array ---
    const weeks = new Array(totalWeeks);
    for (let i = 0; i < totalWeeks; i++) {
      weeks[i] = {
        t: (minW + i * WEEK_MS / 1000) * 1000,
        totalCommits: 0, additions: 0, deletions: 0,
        perAuthor: new Map()
      };
    }
    const weekIdx = (w) => Math.round((w - minW) / (WEEK_MS / 1000));

    // --- cast: top-20, rest aggregated into "+N others" ---
    const top = contributors.slice(0, 20);
    const rest = contributors.slice(20);
    const authors = top.map((c, i) => ({
      login: (c.author && c.author.login) || 'ghost',
      avatar: (c.author && c.author.avatar_url) || '',
      totalCommits: c.total,
      count: c.count || 1,
      firstWeekIdx: totalWeeks - 1,
      color: AUTHOR_PALETTE[i % AUTHOR_PALETTE.length]
    }));
    const restCount = rest.reduce((s, c) => s + (c.count || 1), 0);
    if (rest.length > 0) {
      authors.push({
        login: '+ ' + restCount + ' others',
        avatar: '',
        count: restCount,
        totalCommits: rest.reduce((s, c) => s + c.total, 0),
        firstWeekIdx: totalWeeks - 1,
        color: '#8b949e'
      });
    }

    function addWeeks(c, authorIdx) {
      for (const w of c.weeks) {
        if (w.c === 0 && w.a === 0 && w.d === 0) continue;
        const idx = weekIdx(w.w);
        if (idx < 0 || idx >= totalWeeks) continue;
        const wk = weeks[idx];
        wk.totalCommits += w.c;
        wk.additions += w.a;
        wk.deletions += w.d;
        if (w.c > 0) {
          const a = authors[authorIdx];
          wk.perAuthor.set(a.login, (wk.perAuthor.get(a.login) || 0) + w.c);
          if (idx < a.firstWeekIdx) a.firstWeekIdx = idx;
        }
      }
    }
    top.forEach((c, i) => addWeeks(c, i));
    if (rest.length > 0) rest.forEach(c => addWeeks(c, authors.length - 1));

    // --- totals ---
    const totals = {
      commits: weeks.reduce((s, w) => s + w.totalCommits, 0),
      additions: weeks.reduce((s, w) => s + w.additions, 0),
      deletions: weeks.reduce((s, w) => s + w.deletions, 0),
      contributors: contributorCount
    };

    // --- language palette ---
    const langEntries = Object.entries(bundle.languages || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 4);
    let langColors = langEntries
      .map(([name]) => LANG_COLORS[name])
      .filter(Boolean);
    if (langColors.length === 0) langColors = ['#f5c518'];

    // --- milestones ---
    const milestones = [];
    milestones.push({
      weekIdx: 0, type: 'birth',
      text: 'In the beginning — ' + monthYear(weeks[0].t)
    });

    // First appearance of each top-5 author.
    authors.slice(0, 5).forEach(a => {
      if (a.firstWeekIdx < totalWeeks - 1 || a.totalCommits > 0) {
        if (a.firstWeekIdx > 0) {
          milestones.push({ weekIdx: a.firstWeekIdx, type: 'enter', text: 'Enter ' + a.login });
        }
      }
    });

    // Busiest week.
    let peakIdx = 0;
    for (let i = 1; i < totalWeeks; i++) {
      if (weeks[i].totalCommits > weeks[peakIdx].totalCommits) peakIdx = i;
    }
    if (weeks[peakIdx].totalCommits > 0) {
      milestones.push({
        weekIdx: peakIdx, type: 'peak',
        text: 'The busiest week: ' + weeks[peakIdx].totalCommits.toLocaleString('en-US') + ' commits'
      });
    }

    // Great refactor (max deletions, if > 10,000).
    let delIdx = 0;
    for (let i = 1; i < totalWeeks; i++) {
      if (weeks[i].deletions > weeks[delIdx].deletions) delIdx = i;
    }
    if (weeks[delIdx].deletions > 10000) {
      milestones.push({
        weekIdx: delIdx, type: 'refactor',
        text: 'The great refactor: −' + weeks[delIdx].deletions.toLocaleString('en-US') + ' lines'
      });
    }

    // 25% / 50% / 75% of total commits.
    if (totals.commits > 0) {
      const targets = [0.25, 0.5, 0.75];
      let cum = 0, ti = 0;
      for (let i = 0; i < totalWeeks && ti < targets.length; i++) {
        cum += weeks[i].totalCommits;
        while (ti < targets.length && cum >= totals.commits * targets[ti]) {
          milestones.push({
            weekIdx: i, type: 'quarter',
            text: 'Commit #' + Math.round(totals.commits * targets[ti]).toLocaleString('en-US')
          });
          ti++;
        }
      }
    }

    // De-duplicate: at most one milestone per week (first wins by priority order
    // of insertion: birth > enter > peak > refactor > quarter).
    const seen = new Set();
    const dedup = [];
    for (const m of milestones) {
      if (seen.has(m.weekIdx)) continue;
      seen.add(m.weekIdx);
      dedup.push(m);
    }
    dedup.sort((a, b) => a.weekIdx - b.weekIdx);

    // --- credits ---
    const credits = (bundle.commits || [])
      .map(c => c.message || '')
      .filter(m => m.length > 0)
      .map(m => m.length > 60 ? m.slice(0, 57) + '…' : m)
      .slice(0, 40); // keep the rolling credits under ~20 seconds

    // --- duration ---
    const weeksPerSecond = clamp(totalWeeks / 60, 1, 26);

    const createdAt = new Date(meta.created_at);
    const ageYears = Math.max(0,
      (Date.now() - createdAt.getTime()) / (365.25 * 24 * 3600 * 1000));

    return {
      meta: {
        fullName: meta.full_name,
        description: meta.description || '',
        stars: meta.stargazers_count || 0,
        forks: meta.forks_count || 0,
        createdAt: meta.created_at,
        ageYears: ageYears,
        primaryLanguage: meta.language || (langEntries[0] && langEntries[0][0]) || '',
        langColors: langColors
      },
      weeks, authors, milestones: dedup, credits, totals, weeksPerSecond
    };
  }

  return { buildMovie };
})();
