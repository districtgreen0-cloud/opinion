# Master Build Prompt — **OPINION** · the dark social map

> Paste this whole file into Claude Opus (or Sonnet for sub-tasks) to rebuild or extend OPINION from scratch.
> Lineage: the "OPINION" brief (375go-style hex gating + Solana rewards) **fused with Radiate** (3D social map of events, friends' plans, event crews, ticket marketplace, dynamic night lighting).

---

You are a senior full-stack + creative-technology engineer. Build **OPINION** — a Solana-native, location-gated social layer rendered on a **pitch-black, minimal 3D city**. Real-world events glow inside the city like light leaking from buildings. You can only speak in a place **if you are physically there**.

Think: **375go** (earn by exploring hexes) × **Radiate** (who's going where, tonight) × **Vantablack** (absorb everything except the signal).

## 0 · Deliverables
1. `web/` — interactive app (runs fully in **demo mode** with mock realtime, no backend required).
2. `worker/` — production backend on **Cloudflare Workers + Durable Objects + D1** (same origin as the SPA via Workers Static Assets).
3. `docs/HOSTING.md` — hosting decision record (Cloudflare vs Firebase vs Railway/Render).
4. A preview anyone can open: `wrangler deploy` → `https://opinion.<account>.workers.dev`.

## 1 · Stack (locked)
| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript + Vite + Tailwind v4 | fast, typed, zero-config |
| State | zustand | tiny, no providers |
| Basemap | **MapLibre GL** + **OpenFreeMap** vector tiles (no API key) with a **hand-built black style** | no token lock-in, full control of every pixel |
| Data viz | **deck.gl** via `MapboxOverlay` (interleaved) | H3 hexes, thousands of unclustered avatars at 60fps |
| 3D art | **three.js** as a MapLibre custom layer | venue beacons, orbiting avatars, light cones (the Radiate signature) |
| Motion | **GSAP** (+ `@gsap/react` `useGSAP`) | splash, panel choreography, number tickers, pulse |
| Geo-gating | **h3-js** res 10 (~0.015 km², ~66 m edge: the fine 375go-style grid). One constant per side: `web/src/lib/h3.ts` `H3_RES` + `worker/wrangler.jsonc` `H3_RES` | exact-hex "you must be here" |
| Wallet | Wallet Standard / Phantom provider (`window.phantom.solana`) with mock fallback; upgrade path `@solana/wallet-adapter-react` | no polyfill hell in the demo |
| Realtime | Durable Object per hex (`HexRoom`), WebSocket Hibernation | one DO = one place = one room |
| DB | D1 (users, events, visits, epochs, claims, market listings) | SQL at edge, free tier |

## 2 · Design language — "Black"
- Background **#000**. Land #050505, water #020203, roads #111 → #1a1a1a, buildings extruded #0b0b0d with faint top-edge light. **No labels except district names in 10px tracking-wide grey.**
- One accent per meaning: **#FF5A1F ember** (you / earning), **#B26BFF violet** (live now), **#3DFFA8 mint** (upcoming), **#FFFFFF** (sparks on POI hexes). Nothing else is colored.
- **Every button is transparent glass**: white-alpha gradient, `backdrop-blur(18px)`, 1px `rgba(255,255,255,.14)` border, a light sheen that sweeps across on hover, and a ripple + squash-and-spring on click (one delegated handler, `lib/fx.ts`). The dock has a glass lens that glides to the active tab. Colour appears only in status dots and map light.
- **Logo:** `OPINI` + **ON** in Solana's gradient (#9945FF → #19FB9B), spinning as one coin-like unit. Scroll velocity anywhere in the app spins it, it coasts and lands face-forward with an elastic settle, and in the splash it rolls in with three full turns.
- Glass panels: `rgba(10,10,12,.72)` + `backdrop-blur(24px)` + 1px `rgba(255,255,255,.06)` border, 20px radius. Never white surfaces.
- Type: **Space Grotesk** (display, big numbers) + **Inter** (UI). Big-number energy: "2.7B signals", "40K places", "11M/day".
- Motion: everything enters from darkness (opacity + 12px y + blur), 0.6s `expo.out`; live things breathe (2.4s sine); `prefers-reduced-motion` → no breathing, instant panels.
- Lighting presets (Radiate): **Midnight** (default) · **Neon** (violet fog) · **Dusk** (ember horizon) — animated with GSAP on change.

## 3 · Features

### 3.1 Explore — the 3D map (home)
- Full-screen black 3D map, pitch 60°, default city NYC East Village; city switcher NYC / Belgrade / Novi Sad (data generated relative to city center).
- Extruded buildings (`fill-extrusion` from OpenMapTiles `building.render_height`).
- **Venue beacons (three.js):** each event venue is a light column rising from the street; **violet + pulsing = live**, **mint + still = upcoming**. A ring of **avatars orbits** each live venue (count ∝ attendees) connected by hair-thin lines; a **floodlight cone** whose intensity = crowd density.
- **H3 layer (deck.gl):** res-10 hexes with activity-driven violet→pink glow, white ✦ spark on POI hexes, your current hex outlined in ember.
- **Scan radius:** ember translucent circle around you with a rotating radar sweep. "Centre" button re-centers.
- **Friends:** live dots with avatar, gentle drift; ghosted friends hidden.
- Click anything → camera `flyTo` + the matching panel.

### 3.1b Streets, places & your footprint
- Street names from OSM (`transportation_name`) along the roads from z13.5; OSM places (bars, cafes, venues…) as quiet dots + names from z16.3. Clicking a place opens its hex titled with the place name. (Google Maps places can't be used: scraping breaks Google's terms, and Places API content may not be shown on a non-Google map.)
- **Import Google Timeline** (Account): Android `Timeline.json`, iPhone export, or Takeout `Records.json` / Semantic Location History. Parsed in a Web Worker on-device and never uploaded. It becomes an ember footprint hex layer plus top visited places. It never unlocks posting and never awards points.

### 3.2 Hex Voices (location-gated comments)
- Click a hex → bottom sheet with its thread (seeded + live).
- Post → `navigator.geolocation` → `latLngToCell(lat,lng,9)`; equal to target → can post; else read-only with **"You must be here to speak."**
- Server re-checks the cell (403 `not_here`). Comment geolocation is spoofable — production adds rate limits + attestation.
- **Demo mode:** no/denied geolocation → "Teleport" toggle; tap the map to place yourself, unlocking that hex.
- Posting a comment: +10 pts, first visit to a hex: +25 pts ("hex discovered" toast).

### 3.2a Home tabs: ALL · TOPICS · NOTES · JOBS
- Glass segmented control under the top bar (Explore only) with live counts. Choosing a kind filters the map bubbles, `$` markers and live feed, outlines every hex holding that kind (violet topics / white notes / mint jobs), and makes a tapped hex open on that tab.

### 3.2b Three sections in every hex: Topics · Notes · Jobs
- **Topics**: titled threads with replies, sorted by last activity. **Notes**: short drops (the original voices). **Jobs**: offers paid in USDC.
- Posting any of them is location-gated (on-device + server). Replies are gated too; taking a job is not (you can take a job from anywhere).
- **P2P USDC escrow** state machine: open → fund (poster locks USDC) → take (any other wallet) → deliver (worker) → release (poster → paid); cancel before it's taken refunds the poster. The server enforces actor + state (403/409). Intended on-chain: Solana escrow PDA.
- Map: a mint `$` over hexes with open jobs; bubbles show 💬 topics and 💼 jobs.
- **Market → Jobs**: every job in the city. Filters Available / Mine / All; sort Newest / Top pay / Nearest; totals for open jobs, USDC in escrow and paid out; "Show on map" jumps to the hex.

### 3.2c ZK Chat (dock tab)
- End-to-end encrypted DMs + private group rooms over a **zero-knowledge relay**: the server stores only public keys and ciphertext (worker `src/zk.ts`, Durable Object `ZkRoom`).
- WebCrypto only: ECDH P-256 identity → HKDF-SHA256 → AES-256-GCM 1:1 keys; per-epoch random group key wrapped for each member; AAD binds room|sender|epoch|ts.
- Add people by invite code (`opn1.` + public key); 60-digit safety numbers to verify in person; adding or removing a member rotates the room key.
- "Show ciphertext" toggle shows exactly what the relay sees. Next hardening: sign relay requests with the identity key; optional Semaphore ZK proofs for anonymous membership.

### 3.3 Live Feed
- Right rail (desktop) / swipe sheet (mobile): streaming comments with avatar, hex id, age; click → fly to hex. Comments also float on the map as fading bubbles.

### 3.4 Events (Luma-style + Radiate)
- Cards: cover gradient, title, host, venue, time, distance, attendees, **"N friends going"** avatars.
- Actions: **Going / Interested** (your plan becomes visible to friends on the map), **Get tickets** (lu.ma link), **Join crew** (event group chat).
- Selecting a card makes its beacon flare and flies the camera to it.

### 3.5 Crews (Radiate group chats)
- Every event has a crew chat: members list w/ presence, mock realtime messages, **"Hey 👋"** one-tap wave to start a DM (Radiate's ice-breaker).

### 3.6 Market (Radiate marketplace, Solana edition)
- Ticket resale listings per event. Buy → **escrow in USDC** (demo: simulated escrow states: open → escrow → released). Seller paid when the ticket's scanned at the door.

### 3.7 Rewards ($ON)
- "You are earning" ember pill (live when inside scan radius of activity).
- HUD: hexes explored, coverage %, points ticker.
- Epochs (7 days): countdown `1W 2D 12H 5M`, pending $ON, **Claim** for past epochs (server returns merkle proof; on-chain Merkle distributor program out of scope for demo), "View wallet".
- **Token design:** SPL token (Token-2022) `$ON`, fixed supply; points are off-chain in D1 and converted per epoch pool pro-rata; claims via merkle distributor. Ticker: **$ON**. Never sell the token in-app.

### 3.8 Account
- Avatar picker (8 generated gradient avatars), handle, **Vibe status** (🔥 out tonight / 🌙 chilling / 👀 looking for plans), **Ghost mode** (hide your dot), wallet connect (Phantom; truncated address pill + disconnect; mock fallback).

## 4 · Navigation
Bottom dock (glass, centered, icon + label): **Explore · Events · Crews · Market · Rewards**. Top bar: OPINION wordmark, city switch, lighting preset, earning pill, wallet pill.

## 5 · Mock data (demo)
- 6 events/city (3 live, 3 upcoming), 24+ comments across ~15 hexes, 8 friends, 2,000 ambient "people" points (proves 60fps unclustered), crews with 5–12 messages, 6 market listings, Epoch 7 active.
- `useMockRealtime` emits a new comment every 4–7s and a crew message every 6–10s.

## 6 · API contract (worker)
```
GET  /api/health
GET  /api/events?city=nyc                → Event[]
GET  /api/hex/:cell/comments             → Comment[]
POST /api/hex/:cell/comments {text,lat,lng,handle,avatar,wallet?}   → 201 Comment | 403 {error:"not_here"}
GET  /api/hex/:cell/ws                   → WebSocket {type:"comment"|"presence"}
GET  /api/feed                           → Comment[] (latest 30)
GET  /api/me?wallet=                     → {points, hexesExplored, pending}
GET  /api/epochs  · POST /api/epochs/:n/claim {wallet} → {amount, proof[], merkleRoot}
GET  /api/market?event= · POST /api/market
Comment = {id, cell, text, handle, avatar, wallet?, createdAt}
Event   = {id, title, host, venue, lat, lng, startsAt, endsAt, status:"live"|"upcoming", cover, lumaUrl, attendees}
```
Frontend: `VITE_API_URL` set → live mode; unset → demo mode. Both share the same types.

## 7 · Acceptance criteria
1. `npm run build` in `web/` and `tsc --noEmit` in `worker/` — zero errors.
2. Map is black; buildings extruded; live beacons violet + pulsing with orbiting avatars; upcoming mint.
3. Gating: wrong hex → read-only "must be here"; teleport unlocks; server enforces the same rule.
4. Wallet connects with Phantom; degrades to a mock wallet without it.
5. No unstyled white component anywhere; mobile width 375 works with no horizontal scroll.
6. 60fps on a laptop with 2,000 ambient points; reduced-motion respected.
7. One-command deploy: `npm run build --prefix web && npx wrangler deploy --config worker/wrangler.jsonc`.

## 8 · Structure
```
opinion/
  PROMPT.md  docs/HOSTING.md
  web/src/
    App.tsx  main.tsx  index.css
    store.ts                    // zustand: city, tab, me, selection, lighting, teleport
    lib/ mapStyle.ts h3.ts api.ts avatars.ts format.ts
    data/ mock.ts               // seeded generators per city
    hooks/ useGeolocation.ts useMockRealtime.ts
    map/ Map3D.tsx  deckLayers.ts  BeaconLayer.ts (three.js custom layer)
    components/ TopBar Dock Splash HexSheet FeedRail EventsPanel CrewsPanel MarketPanel RewardsPanel AccountPanel WalletPill Toasts
  worker/ wrangler.jsonc  src/index.ts  src/hex-room.ts  migrations/
```

Build it all now. Run the build, fix every error, verify each acceptance criterion in a browser, then report.
