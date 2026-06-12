# 🚀 LAUNCH.md — deploy & launch playbook

## 1. Deploy (5 minutes)

1. Create a GitHub repository named `repo-cinema` and push this folder to `main`.
2. Repository → **Settings → Pages → Build and deployment** →
   Source: *Deploy from a branch* → Branch: `main`, folder: `/ (root)`.
3. Wait ~1 minute. Your theater is live at
   `https://ryzhkevichpavel-del.github.io/repo-cinema/`.
4. Smoke test: open `https://ryzhkevichpavel-del.github.io/repo-cinema/?repo=facebook/react` — the film must autoplay.
5. Record a 15–20 s screen capture of the react demo, save as `docs/demo.gif`,
   and take a poster screenshot for `og.png` (replace the bundled one if you like).

> **Golden rule for every post below:** lead with posters/films of FAMOUS
> repositories (react, linux, vscode), not your own. People click what they
> recognize; then they make a film about their own repo — that's the loop.

---

## 2. Show HN

**Title:** `Show HN: Repo Cinema – turn any GitHub repo into a movie`

**Text:**

> Paste a link to any public GitHub repository and get a ~60-second animated
> "film" of its history: the repo is a star that pulses with commit activity,
> contributors are planets on orbits, additions fly in as green sparks,
> deletions burn away as red embers. Milestone title cards ("Enter torvalds",
> "The great refactor: −84,000 lines") punctuate the timeline, and it ends with
> a downloadable movie poster and rolling credits made of real commit messages.
>
> Technically it's deliberately boring: no backend, no build step, no npm
> dependencies — vanilla JS and one Canvas 2D element on GitHub Pages. Each
> film costs exactly 4 GitHub API calls (cached in sessionStorage), so the
> anonymous 60 req/h limit buys ~15 films; an optional token (stored only in
> localStorage, sent only to api.github.com) raises it to 5,000. Try the
> built-in react/linux/vscode demos — they play from bundled snapshots with
> zero API calls. Feedback welcome, especially on repos that break the math.

---

## 3. Reddit

### r/webdev

**Title:** `I built a site that turns any GitHub repo into a cinematic movie — vanilla JS, Canvas 2D, zero dependencies, no backend`

> Weekend project: paste `owner/repo`, get a ~60s animated film of the repo's
> history with a shareable poster at the end. The whole thing is a few `<script>`
> tags on GitHub Pages — no framework, no bundler, no node_modules. The
> interesting constraints: GitHub's 60 req/h anonymous limit forced a strict
> 4-requests-per-film budget, and canvas avatar images need `crossOrigin`
> handling or PNG/video export breaks with a tainted canvas. AMA about the
> Canvas 2D particle system (object pool, ≤400 live particles, 60 fps).

### r/programming

**Title:** `Repo Cinema: every Git history is secretly a movie script`

> The weekly contributor stats GitHub already computes for every repo turn out
> to map beautifully onto film structure: an opening title, an inciting commit,
> new characters entering, a busiest-week climax, a "great refactor" plot
> twist, and end credits (the last 100 commit messages, verbatim). I rendered
> that as a star system on a canvas. Watch linux's 30-year epic or your own
> weekend repo's short film.

### r/github

**Title:** `I made a movie generator for GitHub repos — works entirely client-side with 4 API calls`

> Useful detail for this sub: it leans on `GET /repos/{o}/{r}/stats/contributors`,
> which returns per-author weekly commit/addition/deletion arrays for the whole
> history in one request — astonishingly underused endpoint. Handles the 202
> "still computing" dance, rate-limit headers, and caches in sessionStorage so
> replays are free. Tokens optional, never leave the browser.

---

## 4. X / Twitter

**Launch post:**

> Every repo deserves a premiere. 🎬
>
> I built Repo Cinema: paste any GitHub repo → get a cinematic movie of its
> history. Contributors as planets, commits as starlight, real commit messages
> as end credits.
>
> No backend. No build. Just canvas.
>
> Watch react's film: https://ryzhkevichpavel-del.github.io/repo-cinema/?repo=facebook/react

**Thread idea (one poster per tweet):**
1. Launch post above.
2. Poster of `torvalds/linux` — "30 years in the making. Starring torvalds."
3. Poster of `facebook/react` — point out the "great refactor" milestone.
4. Poster of `microsoft/vscode` — "A film by 2,000+ contributors."
5. "Now make one about YOUR repo:" + plain link. Ask people to reply with
   their posters — quote-RT the best ones.

---

## 5. Habr (RU) — план статьи

**Заголовок:** «Как я превратил git-историю в кино без бэкенда»

1. **Завязка.** История любого репозитория — готовый сценарий: завязка,
   новые герои, кульминация, титры. Демо-гифка фильма про linux.
2. **Ограничения как дизайн.** 60 запросов/час без токена → бюджет ровно
   4 запроса на фильм; почему `stats/contributors` — самый недооценённый
   endpoint GitHub (вся история по неделям одним запросом) и как жить с его
   `202 Accepted`.
3. **Сценарий из данных.** Алгоритм майлстоунов: первый коммит, появления
   топ-5 авторов, пик активности, «великий рефакторинг» по max(deletions),
   четверти суммарных коммитов. Формула длительности фильма.
4. **Сцена на Canvas 2D.** Звезда-репо, планеты-контрибьюторы, пул частиц
   на 400 объектов, леттербокс, зерно плёнки за 10 строк. Почему не WebGL.
5. **Грабли экспорта.** Tainted canvas и `crossOrigin="anonymous"` для
   аватарок; MediaRecorder и feature-detect mp4/webm; постер 1200×630 как
   OG-превью.
6. **Виральная механика.** Ссылка `?repo=` как единица распространения;
   почему первые посты — про чужие известные репо.
7. **Итоги.** Ссылка, исходники, MIT. Призыв снять фильм о своём репо и
   принести постер в комментарии.

---

## 6. Telegram (бонус)

Короткий пост для дев-каналов: гифка + «Вставь ссылку на свой репозиторий —
получи фильм о нём. Без бэкенда, исходники открыты» + ссылка с `?repo=`
известного проекта.
