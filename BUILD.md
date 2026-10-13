# Build OPINION

Everything needed to go from a fresh clone to a live URL.

```
opinion/
├─ PROMPT.md            master build prompt (rebuild/extend with Claude)
├─ BUILD.md             ← you are here
├─ package.json         one-command scripts for both apps
├─ scripts/setup.sh     install + local DB
├─ scripts/dev-live.sh  full stack locally
├─ .github/workflows/deploy.yml   push-to-deploy
├─ docs/HOSTING.md      why Cloudflare
├─ web/                 React 19 · Vite · Tailwind v4 · MapLibre 5.24 · deck.gl 9.4 · three r186 · GSAP · h3-js
└─ worker/              Cloudflare Worker · Durable Object per hex · D1
```

## 1 · Requirements
- Node **20+** (`.nvmrc` pins 24 → `nvm use`)
- A Cloudflare account (free plan is enough) for deploys

## 2 · Install
```bash
npm run setup
```
Installs `web/` and `worker/` and applies D1 migrations to a local SQLite database.

## 3 · Run locally
| Command | What you get |
|---|---|
| `npm run dev` | **Demo mode** at http://localhost:4700. Mock realtime, no backend, teleport to post |
| `npm run dev:live` | **Full stack**: Worker + Durable Objects + D1 on :8787, app on :4700 talking to it |
| `npm run build && npm run preview` | Production bundle at http://localhost:4701 |

`web/.env.example` explains `VITE_API_URL` (unset = demo, empty = same-origin live, URL = remote API).

## 4 · Deploy to Cloudflare (first time)
```bash
npx wrangler login                 # inside worker/ or anywhere
npm run db:create                  # prints a database_id
```
Paste that id into `worker/wrangler.jsonc` → `d1_databases[0].database_id`, then:
```bash
npm run db:migrate                 # create tables + seed on the remote D1
npm run deploy                     # typecheck → build SPA (live mode) → wrangler deploy
```
Your app is live at `https://opinion.<your-subdomain>.workers.dev`: the SPA, `/api/*` and the WebSocket rooms on one origin.

**Static demo only** (no backend, nothing to configure): `npm run deploy:demo` → Cloudflare Pages project `opinion-demo`.

## 5 · Push-to-deploy (GitHub Actions)
1. `git init && git add -A && git commit -m "OPINION"` then push to a GitHub repo.
2. Repo → Settings → Secrets → add `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers" + D1 edit) and `CLOUDFLARE_ACCOUNT_ID`.
3. Every push to `main` runs `.github/workflows/deploy.yml`: install → typecheck → build → migrate → deploy.

## 6 · Checklist before going public
- [ ] `database_id` set in `worker/wrangler.jsonc`
- [x] Real events: Luma public iCal feeds (free) via `/api/feeds/events` (worker/src/feeds.ts); optional Eventbrite: `wrangler secret put EVENTBRITE_TOKEN` + `EVENTBRITE_ORGS` var (org ids). Eventbrite has no public search since 2020, so it only lists the organizations you name
- [ ] Turnstile on posting + sign-in-with-Solana before points credit a wallet
- [ ] `$ON` mint (Token-2022) + Merkle distributor program for epoch claims
- [ ] Custom domain in Cloudflare → Workers → opinion → Domains

## 7 · Gotchas (already handled, don't undo)
- **maplibre-gl stays on 5.24**: deck.gl 9.4's interleaved overlay reads `map.transform`, which MapLibre 6 removed.
- The map container uses an inline `position:absolute; inset:0`, because MapLibre's CSS beats Tailwind utilities.
- The three.js beacons use `defaultProjectionData.mainMatrix` (the MapLibre 5 custom-layer API).
- `maplibregl.prewarm()` keeps the worker pool alive across React StrictMode remounts.
- Effects always use block bodies (`useEffect(() => { … })`): `scrollIntoView` returns a Promise in current Chrome.
- A hidden/background tab pauses `requestAnimationFrame`, so map + GSAP wait until the tab is visible. That's expected.
