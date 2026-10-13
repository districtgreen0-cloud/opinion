# Hosting decision — OPINION

**Decision: Cloudflare (Workers + Static Assets + Durable Objects + D1). One deploy, one origin, $0 to start.**

## What OPINION actually needs
| Need | Why |
|---|---|
| Static SPA (~800 KB gz JS, mostly MapLibre/deck/three) | global edge cache |
| **Realtime rooms per place** | every H3 hex is a chat room with presence + WebSocket fan-out |
| **Server-side geo-gate** | `latLngToCell(lat,lng,9) === cell` must run on the server, not just the client |
| Small relational data | users, events, visits, epochs, claims, market listings |
| Cheap idle | most hexes are silent most of the time |

## Options compared
| | **Cloudflare** | **Firebase** | **Railway / Render** |
|---|---|---|---|
| Static hosting | Workers Static Assets, unlimited free static requests | Hosting: 10 GB storage, 10 GB/mo transfer on Spark | Fine, but you pay for an always-on box |
| Realtime | **Durable Object per hex**: one object = one room, WebSocket Hibernation means idle rooms cost ~nothing | Firestore listeners: easy, but every listener reads count against 50K reads/day | DIY socket.io server + Redis |
| Server-side gate | Worker runs `h3-js` before the DO accepts a write | Needs Cloud Functions → **Blaze (pay-as-you-go) plan**; Security Rules can't run h3 | Easy (any Node code) |
| DB | D1 (SQLite, 5 GB free) + DO SQLite (10 GB per object) | Firestore 1 GiB, 50K reads / 20K writes per day | Postgres add-on (paid) |
| Free tier ceiling | 100K Worker requests/day; DO SQLite 1.25M row reads/day | Read quota burns fast with live feeds | Trial credits, then ~$5+/mo; Render free sleeps after idle |
| Cold start | none (V8 isolates) | Functions cold start | Render free: ~30–60 s wake-up |
| Your setup | already used for every other site (`wrangler` installed; token currently expired, run `wrangler login`) | logged in as calderabalkan@gmail.com (used by `scrolly`) | not installed |

**Why Cloudflare wins for this app:** the "one hex = one room" model maps 1:1 onto Durable Objects. Firebase would work for a quick demo, but the server-side gate forces Blaze billing, and live feeds eat the read quota. Railway and Render mean running and scaling a socket server yourself.

**When to pick Firebase instead:** if you want Firebase Auth (Google/Apple sign-in) and push notifications without writing code. A hybrid works too: keep Cloudflare for the map, rooms and gate, and use Firebase only for Auth + FCM push.

## Deploy (Cloudflare)
```bash
wrangler login                                   # token expired on this machine
cd worker && npx wrangler d1 create opinion-db     # paste database_id into wrangler.jsonc
npm run migrate:remote
cd .. && npm run deploy                          # builds web (live mode) + wrangler deploy
```
Result: `https://opinion.<your-subdomain>.workers.dev`. Add a custom domain in the dashboard later.

### Demo-only alternative (no backend)
`cd web && npm run build && npx wrangler pages deploy dist --project-name opinion-demo`: the SPA runs fully in demo mode with mock realtime.

## Production hardening checklist
- Location spoofing: browser GPS is trivially spoofable. Add rate limits (5 posts/min per hex is already in place), velocity checks (impossible travel), and later signed attestation (App Attest / Play Integrity in a native shell).
- Token: `$ON` as a Token-2022 mint with fixed supply; an on-chain Merkle distributor program for epoch claims (the worker already emits a real sha256 Merkle root and proofs).
- Wallet auth: sign-in-with-Solana (signed nonce) before points are credited to a wallet.
- Turnstile on posting (there's a `turnstile-spin` skill for this).
