# OPINION: the human oracle for the real world

**Live app:** https://app.useopinion.io · **Website:** https://useopinion.io

OPINION is a live 3D social map where people become the world's sensor network. The planet is split into
H3 hexagons (~15,000 m²) and **you can only post inside the hex you're standing in**, so every note, topic,
job or photo carries proof of place. Those signals become real-time, location-verified data for people,
apps and machines, and contributors get rewarded.

### What you can try in the live app
- **Globe entry → city picker → cinematic fly-in** (London, New York, San Francisco, Beograd, Novi Sad)
- **3D map** with glass landmarks and live activity per hex
- **Hexes:** Topics, Notes, **USDC P2P Jobs** (escrow state machine), **Memories** (camera-only photo, 1 per hex)
- **Events** (Luma feeds) and **Sports** (OSM stadiums/courts + live fixtures from ESPN / TheSportsDB)
- **Sign in / Sign up:** **Solflare** wallet, Google or email code · profiles, friends, end-to-end-encrypted chat
- **Earn mode:** opt-in, per-tier consented data contribution with export/delete (aggregates only, K≥50 + noise)
- **Live GPS** with a three.js compass, **turn-by-turn navigation** (OSRM), zoom rail, light/dark themes
- **10k / 1M user simulation** to visualise network scale

### Status (honest)
- The public link runs in **demo mode**: realtime is simulated and data stays in your browser.
- The Cloudflare backend (Workers, Durable Objects, D1, R2) is built and tested locally, but not deployed yet.
- The Solana escrow program and **$ON** rewards are designed for **devnet** and are not deployed on-chain yet.

### Stack
React 19 · Vite · MapLibre GL · deck.gl · three.js · GSAP · h3-js · Cloudflare Workers / Durable Objects / D1 / R2 · Solana (Solflare)

---

## Developer notes


A black 3D city where events glow, friends drift, and you can only speak inside the H3 hex you're standing in.
375go-style earn-by-exploring × Radiate-style social event map × Solana `$ON` rewards.

- `PROMPT.md`: the master build prompt (paste into Claude to rebuild or extend)
- `web/`: React + Vite + MapLibre + deck.gl + three.js + GSAP + h3-js
- `worker/`: Cloudflare Worker + Durable Object per hex + D1
- `BUILD.md`: install, run, deploy, CI (start here)
- `docs/HOSTING.md`: why Cloudflare, plus the deploy steps

```bash
npm run dev            # demo mode on http://localhost:4700 (mock realtime, no backend)
npm run dev:api        # worker on :8787; run web with VITE_API_URL=http://localhost:8787 for live mode
npm run deploy         # full stack to Cloudflare (see docs/HOSTING.md first)
```
