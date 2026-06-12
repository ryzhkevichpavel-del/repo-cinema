# 🎬 Repo Cinema

> **Every repo deserves a premiere.**

Paste a link to any public GitHub repository — get a cinematic, animated **movie
of its history**: the birth, the growth, contributors orbiting like planets,
bursts of activity, and a closing poster you'll actually want to share.

![MIT license](https://img.shields.io/badge/license-MIT-f5c518)
![zero dependencies](https://img.shields.io/badge/dependencies-zero-3fb950)
![works offline](https://img.shields.io/badge/demos-work%20offline-8b949e)

![Repo Cinema demo](docs/demo.gif)

*(placeholder — record a short screen capture of the `react` demo playing and
save it as `docs/demo.gif`)*

## 🍿 Try it live

**https://&lt;your-user&gt;.github.io/repo-cinema/?repo=facebook/react**

Or click one of the built-in demos (`react`, `linux`, `vscode`) — they play
instantly from bundled snapshots, no API calls, no rate limit spent.

## 🎞 How it works

- **No backend. No build. No npm.** A handful of vanilla JS files and one
  Canvas 2D element, hosted on GitHub Pages.
- Exactly **4 GitHub API requests** per repository:
  repo metadata, weekly contributor stats, languages, and the last 100 commit
  messages (those become the end credits).
- Responses are cached in `sessionStorage`, so replaying a repo costs **zero**
  requests.
- The weekly history is turned into a screenplay: the repo is a **star** that
  pulses with commit activity, contributors are **planets** on orbits, additions
  fly in as green sparks, deletions burn away as red embers. Milestone title
  cards punctuate the timeline ("Enter gaearon", "The great refactor: −84,000 lines").
- The finale renders a **1200×630 poster** (PNG download) and you can record the
  whole film as a video with one button (`MediaRecorder`, MP4 or WebM depending
  on your browser).

### Your token never leaves the browser

Without a token, GitHub allows 60 API requests/hour — about 15 films. The
optional token field raises that to 5,000/hour. The token is stored only in
your browser's `localStorage` and is sent only to `api.github.com`. There is no
server to send it to — read the source, it's short.

## ❓ FAQ

**Why did I get a rate-limit error?**
GitHub allows 60 unauthenticated API requests per hour per IP. Wait for the
reset time shown in the error, add a token, or watch a demo.

**Can it film private repositories?**
No. v1 is public-repos only, even with a token. Keep your secrets secret.

**"GitHub is preparing the reels"?**
The contributor-stats endpoint returns `202 Accepted` while GitHub computes
statistics for repos it hasn't cached. We retry a few times; very large repos
may need a second attempt a minute later.

**Why does a huge repo show "+ N others"?**
The film stars the top-20 contributors; everyone else shares one gray planet.
Even Hollywood can't give 5,000 people a close-up.

## 🛠 Development

There is no build step. Serve the folder with any static server:

```sh
npx serve .        # or: python -m http.server
```

Regenerate the demo snapshots (4 API calls each):

```sh
node tools/snapshot.mjs facebook/react   > demo/react.json
node tools/snapshot.mjs torvalds/linux   > demo/linux.json
node tools/snapshot.mjs microsoft/vscode > demo/vscode.json
```

## 🚀 Deploy your own

1. Fork / push this repo to GitHub as `repo-cinema`.
2. Settings → Pages → Deploy from branch → `main`, root folder.
3. Your premiere theater is live at `https://<you>.github.io/repo-cinema/`.

See [LAUNCH.md](LAUNCH.md) for ready-to-post launch drafts.

## 🤝 Contributing

PRs welcome — keep it dependency-free, build-free, and backend-free. If your
feature needs npm, it probably belongs in a different movie.

## 📄 License

[MIT](LICENSE). Roll credits.
