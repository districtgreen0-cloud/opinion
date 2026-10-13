# OPINION: the dark social map

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
