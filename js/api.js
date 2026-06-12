/* api.js — GitHub API client: exactly 4 requests per repo, sessionStorage
   cache, 202 retry for stats endpoints, friendly errors. No dependencies. */

'use strict';

const RC_API = (() => {
  const API = 'https://api.github.com';
  const STATS_RETRIES = 5;
  const STATS_RETRY_MS = 2500;

  /** Parse user input into {owner, repo} or null.
      Accepts full URLs, owner/repo, trailing paths like /tree/master. */
  function parseRepoInput(raw) {
    if (!raw) return null;
    let s = String(raw).trim();
    s = s.replace(/^https?:\/\//i, '')
         .replace(/^www\./i, '')
         .replace(/^github\.com[/:]/i, '');
    s = s.replace(/^git@github\.com:/i, '');
    const parts = s.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    let repo = parts[1].replace(/\.git$/i, '').replace(/[?#].*$/, '');
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
    return { owner, repo };
  }

  function getToken() {
    try { return localStorage.getItem('rc:token') || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try {
      if (t) localStorage.setItem('rc:token', t.trim());
      else localStorage.removeItem('rc:token');
    } catch (e) { /* private mode — ignore */ }
  }

  function headers() {
    const h = { 'Accept': 'application/vnd.github+json' };
    const t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  class ApiError extends Error {
    constructor(message, kind, data) {
      super(message);
      this.kind = kind || 'generic';
      this.data = data || null;
    }
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function gh(path, onStatus, statsRetry) {
    let attempts = statsRetry ? STATS_RETRIES : 1;
    for (let i = 0; i < attempts; i++) {
      const res = await fetch(API + path, { headers: headers() });
      if (res.status === 202) {
        if (onStatus) onStatus('projecting');
        await sleep(STATS_RETRY_MS);
        continue;
      }
      if (res.status === 404) {
        throw new ApiError('Repository not found. It may be private, renamed, or never existed. (Private repos are not supported.)', 'notfound');
      }
      if (res.status === 403 || res.status === 429) {
        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining === '0') {
          const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
          const when = reset ? new Date(reset).toLocaleTimeString() : 'soon';
          throw new ApiError(
            'GitHub API rate limit reached. It resets at ' + when +
            '. Meanwhile: add a token (raises the limit to 5,000/h) or watch a demo below.',
            'ratelimit', { when });
        }
        throw new ApiError('GitHub said 403 Forbidden. If you entered a token, check it is valid.', 'forbidden');
      }
      if (!res.ok) {
        throw new ApiError('GitHub API error ' + res.status + ' for ' + path, 'http');
      }
      return res.json();
    }
    throw new ApiError(
      'GitHub is still computing statistics for this repository. ' +
      'This happens with very large repos on first request — try again in a minute.',
      'stats-timeout');
  }

  function cacheKey(owner, repo) { return 'rc:' + owner.toLowerCase() + '/' + repo.toLowerCase(); }

  function cacheGet(owner, repo) {
    try {
      const raw = sessionStorage.getItem(cacheKey(owner, repo));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function cachePut(owner, repo, data) {
    try { sessionStorage.setItem(cacheKey(owner, repo), JSON.stringify(data)); }
    catch (e) { /* quota exceeded — fine, just no cache */ }
  }

  /** Fetch the full data bundle for a repo: exactly 4 API requests
      (or 0 when cached). onStatus(text) reports cinematic progress. */
  async function fetchRepoBundle(owner, repo, onStatus) {
    const cached = cacheGet(owner, repo);
    if (cached) {
      if (onStatus) onStatus('cached');
      return cached;
    }

    if (onStatus) onStatus('reading');
    const meta = await gh(`/repos/${owner}/${repo}`, onStatus, false);

    const age = Math.max(1, Math.round(
      (Date.now() - new Date(meta.created_at)) / (365.25 * 24 * 3600 * 1000)));
    if (onStatus) onStatus('history', age);
    const contributors = await gh(`/repos/${owner}/${repo}/stats/contributors`, onStatus, true);
    if (!Array.isArray(contributors) || contributors.length === 0) {
      throw new ApiError('This repository has no commit history yet — nothing to film.', 'empty');
    }

    if (onStatus) onStatus('casting', contributors.length);
    const languages = await gh(`/repos/${owner}/${repo}/languages`, onStatus, false);

    if (onStatus) onStatus('credits');
    let commits = [];
    try {
      commits = await gh(`/repos/${owner}/${repo}/commits?per_page=100`, onStatus, false);
    } catch (e) {
      // Credits are decorative; an empty-repo 409 must not kill the film.
      commits = [];
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
      contributors: contributors,
      languages: languages,
      commits: (commits || []).map(c => ({
        message: (c.commit && c.commit.message || '').split('\n')[0]
      }))
    };
    cachePut(owner, repo, bundle);
    return bundle;
  }

  /** Load a bundled demo snapshot (no API requests). */
  async function fetchDemo(name) {
    const res = await fetch('demo/' + name + '.json');
    if (!res.ok) throw new ApiError('Demo file missing: ' + name, 'demo');
    return res.json();
  }

  return { parseRepoInput, getToken, setToken, fetchRepoBundle, fetchDemo, ApiError };
})();
