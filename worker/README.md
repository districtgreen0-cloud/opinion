# OPINION worker

Cloudflare Worker + SQLite-backed Durable Objects (`HexRoom`, one per H3 res-10 cell (size set by H3_RES in wrangler.jsonc; must match web/src/lib/h3.ts), WebSocket Hibernation) + D1, plus Workers Static Assets serving the SPA from `../web/dist`.

## Local dev

```bash
cd worker
npm i
npm run migrate:local     # creates local D1 + applies 0001_init and 0002_seed
npm run dev               # wrangler dev --port 8787
```

Frontend: run `web` on port 4700 with `VITE_API_URL=http://localhost:8787` (CORS allows `http://localhost:4700`). The Worker also serves `../web/dist` itself after `npm run build` in `web/`.

Other scripts: `npm run typecheck`, `npm run cf-typegen` (regenerates `worker-configuration.d.ts`; rerun after editing `wrangler.jsonc`).

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | |
| GET | `/api/events?city=nyc` | `{events: Event[]}` |
| GET | `/api/hex/:cell/comments` | `{comments: Comment[]}` oldest -> newest, last 200 |
| POST | `/api/hex/:cell/comments` | `{text, lat, lng, handle, avatar, wallet?}`; 403 `{error:"not_here", yourCell}` if lat/lng is not in `:cell`; 429 after 5 posts/min/IP/hex; 201 `{comment}` |
| GET | `/api/hex/:cell/ws` | WebSocket; pushes `{type:"comment", comment}` and `{type:"presence", count}` |
| GET | `/api/feed` | `{comments}` last 30 across all hexes (D1 `comments_index`) |
| GET | `/api/me?wallet=` | points, hexesExplored, pendingRewards (claimable), projectedRewards |
| GET | `/api/epochs` | `{epochs:[{n,startsAt,endsAt,pool,status}]}` |
| POST | `/api/epochs/:n/claim` | `{wallet}` -> `{amount, proof[], merkleRoot, alreadyClaimed}`; only for ended epochs |
| GET/POST | `/api/market` | `?event=` filter; POST `{eventId, seller, priceUsdc}` |

Each accepted comment awards +10 points (only when a `wallet` is supplied) and records the hex visit.

Security notes: browser geolocation is spoofable. The server gate only checks that the claimed coordinates fall in the cell; production should add attestation (signed location proofs, velocity checks) on top of the per-IP rate limit. The merkle tree is a real sha256 tree but reward weights (lifetime points) and the on-chain Solana distributor are mocks.

## Auth

Sign-in is Google OAuth (Authorization Code + PKCE) or an emailed 6-digit one-time code. No passwords. The same verified email from either method maps to one account. Sessions are an `op_session` cookie (HttpOnly, SameSite=Lax, 30 days, `Secure` except on localhost); only the SHA-256 of the token is stored. Migration: `migrations/0004_auth.sql` (`npm run migrate:local` / `migrate:remote`).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/auth/google/start?redirect=/` | 302 to Google; 501 `google_not_configured`; only same-origin relative redirects (400 `invalid_redirect`) |
| GET | `/api/auth/google/callback` | validates single-use state, requires `email_verified`, sets cookie, 302 to the stored redirect |
| POST | `/api/auth/email/start` | `{email}` -> `{ok:true}`; 429 `rate_limited` (1/60 s, 5/hour per email); 501 `email_not_configured` |
| POST | `/api/auth/email/verify` | `{email, code}` -> `{account}` + cookie; 5 attempts per code, then 429 |
| GET | `/api/auth/me` | `{account}` or 401 `{error:"unauthenticated"}` |
| PATCH | `/api/auth/me` | `{handle?, avatar?}`; handle `^@[a-z0-9._]{2,20}$`, 409 `handle_taken` |
| POST | `/api/auth/logout` | `{ok:true}`, clears the cookie |

`Account` (see `src/types.ts`): `{id, email, name, picture, handle, avatar, providers: ("google"|"email")[], createdAt}`. Posting a comment with a valid session also stores `accountId` on the comment; anonymous posting still works. CORS allows credentials for the localhost:4700 dev origin (frontend must use `credentials: "include"`).

**Local dev:** `cp .dev.vars.example .dev.vars` (sets `DEV_RETURN_CODES=1`, so `/api/auth/email/start` returns `{ok:true, devCode}` while email is unconfigured). Never set `DEV_RETURN_CODES` to 1 in production.

**Google setup:** Google Cloud console -> APIs & Services -> OAuth consent screen (External; scopes openid, email, profile) -> Credentials -> Create OAuth client ID -> Web application, with authorized redirect URIs `http://localhost:8787/api/auth/google/callback` and `https://<prod-host>/api/auth/google/callback`. Then `npx wrangler secret put GOOGLE_CLIENT_ID` and `npx wrangler secret put GOOGLE_CLIENT_SECRET`. Set `OAUTH_REDIRECT_ORIGIN` only if the Worker sits behind a different public origin than the request URL.

**Email setup (Cloudflare Email Service):** the `send_email` binding `EMAIL` is already in `wrangler.jsonc`. Onboard the sending domain once (`npx wrangler email sending enable useopinion.io`; the zone is on Cloudflare so SPF/DKIM records are added automatically, wait for "verified"), then deploy. `EMAIL_FROM` = sign-in codes (`login@`), `MAIL_FROM_HELLO` / `MAIL_REPLY_TO` = welcome mail (`hello@`), `APP_URL` = link in the mail. If `EMAIL_FROM` contains `example.com`, nothing is sent. Replies to `hello@` reach you only if an Email Routing rule forwards it to a real inbox (dashboard → Email → Email Routing).

**Welcome mail (`src/mail.ts`):** sent once per new account (Google or email code; wallet-only sign-ins have no email) from `ctx.waitUntil` after the session is created, so it never delays a login. `accounts.welcomed_at` (migration 0008) records the successful send; a failed send is logged as `welcome_send_failed` and retried once on the next login while the account is < 24 h old.

## Deploy

```bash
npx wrangler login
npx wrangler d1 create opinion-db          # copy database_id into wrangler.jsonc
npm run migrate:remote                   # note: 0002_seed.sql is demo data; skip/delete it for production
(cd ../web && npm run build)             # produces web/dist
npm run deploy
```

## Free-tier notes

- Durable Objects on the free plan must be SQLite-backed (they are). WebSocket Hibernation means idle sockets cost no duration.
- Free limits are daily: Workers 100k requests, D1 5M rows read / 100k rows written, DO 100k requests and 13k GB-s duration. Incoming WebSocket messages bill at 20:1; this app sends only keepalives upstream.
- Static asset requests are free and unlimited.
- `/api/me` computes epoch leaves from `users` (capped at 5000 rows); fine for demos, snapshot per epoch for production.

## Earn mode (opt-in data contribution) — `src/earn.ts`, `migrations/0006_earn.sql`

Rules enforced server-side:
- **Consent ledger** (`earn_consents`): every agreement is a row with terms version, tiers, time and a SHA-256 receipt.
  Rows are never deleted; withdrawing sets `withdrawn_at`. Bumping `EARN_TERMS_VERSION` asks everyone again (409 `terms_changed`).
- **Intake** `POST /api/earn/events`: signed-in + active consent + only consented tiers + closed vocab (no free text),
  location coarsened to H3 res 8, hour buckets, max 200/batch and 2 000/day. Stored under `subject = HMAC(EARN_SALT, account id)`.
- **Your data**: `GET /api/earn/me`, `GET /api/earn/export` (download), `POST /api/earn/delete` (deletes events + withdraws).
- **Aggregation** (cron `17 * * * *`): days ≥ 24 h old → `earn_aggregates` only where ≥ `EARN_K` (50) distinct people,
  Laplace noise ε = 1, busy answers capped to one vote per person. Raw events deleted after 90 days.
- **Internal dashboard**: `/api/earn/admin` (HTML) + `/api/earn/admin/summary`, `Authorization: Bearer $ADMIN_TOKEN`.

Setup:
```
npx wrangler d1 migrations apply opinion-db --remote
npx wrangler secret put EARN_SALT     # 32+ random bytes; never change it (it links people to their rows for export/delete)
npx wrangler secret put ADMIN_TOKEN   # 24+ chars
```
Before real data: privacy policy + DPIA + buyer DPAs (legal review). Nothing is sold by this code: it only produces aggregates.

## Memories (camera photos per hex) — `src/memories.ts`, `migrations/0007_memories.sql`
Signed-in, standing in the hex, camera capture only (the app has no gallery picker), **1 per person per hex, 3 per person per UTC day**.
Images are compressed on the phone (WebP/JPEG ≤ 1440 px, EXIF/GPS dropped by re-encoding), checked by magic bytes, stored in R2 `opinion-media`,
served from `/api/media/memories/...` with immutable caching. 3 distinct reports hide a memory pending review. Never drawn on the map.
Setup: `npx wrangler r2 bucket create opinion-media` then `npx wrangler d1 migrations apply opinion-db --remote`.

## Hex lottery (verifiable draw)

Sign up → follow the OPINION X account (self-declared handle) → post an opinion (12+ chars) in any hex while a draw is open = one entry per account.
Admin page: `/api/draw/admin` (ADMIN_TOKEN). Flow: **Create** → **Commit** (publish the printed commitment on X) → entries → after `ends_at`: **Reveal**.

Anyone can recompute the winner from `GET /api/draw/:id/proof` and `GET /api/draw/:id/entries`:

1. `sha256(seed) == commitHash` (the seed was fixed before entries closed).
2. `leaves[i] = sha256(draw|account|cell|comment)` in the published order; `entriesRoot` = merkle root (sorted-pair sha256, odd leaf pairs with itself).
3. `winnerIndex = BigInt('0x' + sha256(seed + entriesRoot + anchor)) % entriesCount`, where `anchor` is the Solana mainnet block hash recorded at reveal time.
4. `leaves[winnerIndex] == winnerLeaf`.

The winner's follow is checked by hand before the prize ships; delivery is arranged by email. Drawn draws are immutable; undrawn ones can be cancelled.
