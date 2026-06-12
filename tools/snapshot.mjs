#!/usr/bin/env node
/* snapshot.mjs — regenerate demo/*.json
   Usage: node tools/snapshot.mjs facebook/react > demo/react.json
   Optional: GITHUB_TOKEN env var to raise the rate limit.

   Makes the same 4 API requests the page would make and writes a compact
   bundle: top-20 contributors with non-zero weeks only, the rest merged
   into one synthetic "+ N others" record (count field keeps the real
   contributor count). Target: < 150 KB per file. */

const input = process.argv[2];
if (!input || !input.includes('/')) {
  console.error('Usage: node tools/snapshot.mjs owner/repo > demo/name.json');
  process.exit(1);
}
const [owner, repo] = input.split('/');
const API = 'https://api.github.com';
const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'repo-cinema-snapshot' };
if (process.env.GITHUB_TOKEN) headers['Authorization'] = 'Bearer ' + process.env.GITHUB_TOKEN;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function gh(path, statsRetry = false) {
  for (let i = 0; i < (statsRetry ? 10 : 1); i++) {
    const res = await fetch(API + path, { headers });
    if (res.status === 202) {
      console.error('202 — GitHub computing stats, retrying in 2.5 s…');
      await sleep(2500);
      continue;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);
    return res.json();
  }
  throw new Error('stats never became ready for ' + path);
}

const meta = await gh(`/repos/${owner}/${repo}`);
const contributors = await gh(`/repos/${owner}/${repo}/stats/contributors`, true);
const languages = await gh(`/repos/${owner}/${repo}/languages`);
const commits = await gh(`/repos/${owner}/${repo}/commits?per_page=100`);

// --- compact contributors: top 20 + synthetic aggregate of the rest ---
const sorted = contributors.slice().sort((a, b) => b.total - a.total);
const compactWeeks = (weeks) => weeks
  .filter(w => w.c > 0 || w.a > 0 || w.d > 0)
  .map(w => ({ w: w.w, a: w.a, d: w.d, c: w.c }));

const top = sorted.slice(0, 20).map(c => ({
  total: c.total,
  weeks: compactWeeks(c.weeks),
  author: {
    login: c.author ? c.author.login : 'ghost',
    avatar_url: c.author ? c.author.avatar_url : ''
  }
}));

const rest = sorted.slice(20);
const out = { contributors: top };
if (rest.length > 0) {
  const merged = new Map();
  for (const c of rest) {
    for (const w of c.weeks) {
      if (w.c === 0 && w.a === 0 && w.d === 0) continue;
      const m = merged.get(w.w) || { w: w.w, a: 0, d: 0, c: 0 };
      m.a += w.a; m.d += w.d; m.c += w.c;
      merged.set(w.w, m);
    }
  }
  top.push({
    total: rest.reduce((s, c) => s + c.total, 0),
    count: rest.length,                       // real number of merged people
    weeks: [...merged.values()].sort((a, b) => a.w - b.w),
    author: { login: '+ ' + rest.length + ' others', avatar_url: '' }
  });
}

const bundle = {
  meta: {
    full_name: meta.full_name,
    description: meta.description,
    stargazers_count: meta.stargazers_count,
    forks_count: meta.forks_count,
    created_at: meta.created_at,
    default_branch: meta.default_branch,
    language: meta.language
  },
  contributors: top,
  languages: Object.fromEntries(Object.entries(languages).slice(0, 6)),
  commits: commits.map(c => ({ message: (c.commit?.message || '').split('\n')[0].slice(0, 80) }))
};

// --- size budget: if > 150 KB, merge weeks into 2-, then 4-, then 8-week
// buckets (same {w,a,d,c} format; w snaps to the bucket start) ---
const WEEK = 7 * 24 * 3600;
function bucketize(contribs, span) {
  return contribs.map(c => {
    const m = new Map();
    for (const w of c.weeks) {
      const key = Math.floor(w.w / (WEEK * span)) * WEEK * span;
      const b = m.get(key) || { w: key, a: 0, d: 0, c: 0 };
      b.a += w.a; b.d += w.d; b.c += w.c;
      m.set(key, b);
    }
    return { ...c, weeks: [...m.values()].sort((a, b) => a.w - b.w) };
  });
}
let span = 1;
while (JSON.stringify(bundle).length > 150 * 1024 && span < 8) {
  span *= 2;
  bundle.contributors = bucketize(top, span);
}

process.stdout.write(JSON.stringify(bundle));
console.error(`OK ${meta.full_name}: ${JSON.stringify(bundle).length} bytes (bucket=${span}w)`);
