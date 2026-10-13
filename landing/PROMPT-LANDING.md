# Build prompt: OPINION landing page — "The Human Oracle"

> Paste everything below the line into Claude Code (Opus for the build; Sonnet is fine for copy passes or asset prep).
> Working directory: `~/opinion/landing`. The colour screenshots it needs are already in `~/opinion/landing/assets/`.

---

## Role

You are a senior creative developer and art director: award-level scroll storytelling, GSAP (every plugin, all free now), three.js r186, and strict performance discipline. Build a **single-page landing site for OPINION**. It should feel like a piece of art, not a template.

---

## 1. What OPINION is (the story to tell)

**One line:** OPINION is the human oracle for the physical world: real-time, location-verified information produced by the people who are actually there.

**The story (use this arc; rewrite the words to be sharp, don't paste it):**

1. **The world has a blind spot.** Satellites see roofs. Cameras see corners. Platforms see clicks. Nobody sees what is happening *right now, on this street*: the queue, the closure, the crowd, the vibe, the job that needs doing in the next hour. That knowledge lives in people's heads and dies there.
2. **Information is produced by a few and lived by everyone.** Today a handful of newsrooms, platforms and data brokers decide what is known about a place. They aren't there. You are.
3. **OPINION decentralizes information production.** The planet is divided into ~15,000 m² hexagons (H3 resolution 10). **You can only speak where you stand.** Every post is pinned to the hex you're physically in, checked on your device and again on the server, then signed and time-stamped. One hex, one voice, one moment.
4. **From voices to an oracle.** Thousands of small, verified observations stream into live feeds per hex, per city, per topic. Blockchains have price oracles; OPINION is an **oracle for reality**. Apps, AI agents, cities and robots can query what is true on the ground, now.
5. **Robots need ground truth from humans.** Physical AI and world models learn from data, but the street changes faster than any map. OPINION gives them human-collected, location-proofed, privacy-preserving ground truth: crowd density, closures, signal states, venue status, events, sentiment.
6. **People find their people.** The same layer connects humans: topics, events, sports, crews, friends and end-to-end-encrypted chat, all anchored to real places. You meet people who care about the same thing because you were in the same place.
7. **Contributors get rewarded.** Useful, verified signals earn points that convert to **$ON** in epochs. Information has value, so the people who produce it should share in it.

**Mission (put this big):** *Decentralize information production. Connect people who care about the same things. Give machines a truthful view of the real world, sourced from real people.*

**Tagline options** (pick one for the hero, use the others as section kickers):
- "The human oracle for the real world."
- "Share your own, help world, make friends, get rewarded." (the app's own line; use it in the footer)
- "You can only speak where you stand."
- "Ground truth, from the ground."

**Honesty rules for all copy (non-negotiable):**
- No invented metrics. Don't write "2.7B signals" or fake user counts. Use real, current numbers only, or no number:
  - 5 live cities: London, New York, San Francisco, Beograd, Novi Sad.
  - 6,280+ sports venues mapped: 1,088 stadiums/arenas/centres + 5,193 pitches/courts (OpenStreetMap).
  - 4,875 traffic signals mapped (OpenStreetMap; phases are simulated).
  - H3 resolution-10 hexes; 23 crypto cards researched from issuer sources.
- Mark what is in progress: "$ON rewards on Solana devnet", "oracle API: early access". Never claim mainnet or partnerships.
- Data credits in the footer: OpenStreetMap contributors, Luma, ESPN / TheSportsDB, OpenFreeMap.

---

## 2. Every function, explained (source for the Functions section and the copy)

Write each as **name + one sharp line + 1–2 sentences**. These are the real features of the app:

| Function | What it does | Why it matters for the oracle |
|---|---|---|
| **Live 3D map** | Dark, glassy 3D city (MapLibre + deck.gl + three.js) with real buildings, streets, people dots and live activity glowing per hex. | The interface *is* the data: you see information where it happens. |
| **Hexes (proof of place)** | The world is split into H3 res-10 hexagons. You can post only inside the hex you're standing in, verified on-device and server-side. | Every signal carries a location proof, which is the core of trustworthy data. |
| **Notes** | Short, fast observations: "line is 20 min", "rooftop opening", "street closed". They fade with time. | The raw real-time stream: high-frequency ground truth. |
| **Topics** | Threaded discussions anchored to a place. | Turns noise into structured local knowledge and reputation. |
| **Jobs (USDC P2P)** | Post a paid task in a hex; someone nearby takes it; payment runs peer-to-peer in USDC through escrow. | Information and action, paid fairly; the start of a local work layer. |
| **Events** | Real upcoming events from Luma (and Eventbrite), pinned as light beacons; landmark events get custom 3D glass buildings (Breakpoint at Olympia, Hacker House at Somerset House). | Live calendar of the city: where people will be. |
| **Sports** | Every stadium, arena and court from OpenStreetMap as glass footprints and icons, plus real fixtures (ESPN / TheSportsDB) with live scores pinned to the real stadium. | Crowd and mobility signals around the biggest gatherings in a city. |
| **Crews** | Group chat around an event: wave, coordinate, meet. | Connection: people with the same plans find each other. |
| **Profiles & Friends** | Tap any avatar: a small card with posts, hexes and recent activity; add as friend; message. | Reputation and a social graph built on real presence, not followers. |
| **ZK Chat** | End-to-end-encrypted rooms and DMs (ECDH P-256 → AES-256-GCM, keys rotate when members change); the relay sees only ciphertext. | Private coordination without a platform reading it. |
| **Market** | Jobs list, ticket resale with escrow, and crypto cards available in your region. | The economic layer of a city in one place. |
| **Rewards ($ON)** | Points for discovering hexes and for useful signals; epochs convert points to $ON. | Contributors own the value of the information they create. |
| **Timeline import** | Import your Google Timeline on-device to see your real footprint as hexes. It never leaves your browser. | Shows privacy-first design: your data stays yours. |
| **Traffic lights** | Real signal positions from OpenStreetMap, with simulated phases, glowing at street level. | A first taste of the machine layer: infrastructure state as a feed. |
| **Landmarks** | Hand-built three.js glass architecture: Breakpoint 2026 (Olympia), Hacker House (Somerset House), and the 1884 Old Belgrade Railway Station as a pastel-gold "Build Station". | Places become stages: culture and data together. |
| **Globe entry & city picker** | The app opens on a spinning 3D globe; a slot-machine reel picks the city; a cinematic dive lands you in the streets. | First impression: the whole planet is the canvas. |
| **Ghost mode, lighting, teleport** | Hide yourself, switch Midnight / Neon / Dusk lighting, and (demo) teleport anywhere. | Control and privacy by default. |

**Oracle layer (explain as the "API" section):** each observation is a signed record. Show this as a code block, monochrome:

```json
{
  "hex": "8a195da49b5ffff",
  "res": 10,
  "kind": "note",
  "text": "queue at the gate ~20 min",
  "t": "2026-11-15T18:42:07Z",
  "author": "did:sol:7xKX…",
  "presence": { "verified": "device+server", "accuracy_m": 12 },
  "reputation": 0.92,
  "sig": "ed25519:…"
}
```

Consumers: apps and wallets, AI agents, city dashboards, robotics and world models, event organizers. Label it **"Oracle API · early access"**.

---

## 3. Art direction

**Reference:** https://vangrid.io/. Study it before building. What to take from it:
- A pure black hero with a **white point-cloud globe** inside thin **HUD rings and arcs**, sparse coordinates and tick marks.
- **Bold, uppercase, geometric headings**, tight leading, centred; small body copy.
- **Mono micro-labels** in brackets: `// SPATIAL //`, counters like `34.092`.
- A **fixed bottom HUD bar**: a thin ruler with ticks, a live counter, two compact buttons (one white, one grey), and tiny footer links.
- **Scroll-scrubbed camera moves** on the globe, and pinned sections.
- **One section that inverts to white** (their "Strategic Domains" 4-panel grid).

**OPINION's twist: black, white and colour.**
- The whole site is **monochrome, mostly black**: `#000` background, `#0a0a0a` / `#111` surfaces, text `#f2f2f2`, secondary `#8a8a8a`, hairlines `rgba(255,255,255,.08)`. No accent colour anywhere in the UI: no gradients on buttons, no coloured icons.
- **The only colour on the entire page is the app screenshots.** They're the "windows into the live world". Make that the concept:
  - Screenshots enter **in greyscale and bloom into full colour** as they reach the centre of the viewport (ScrollTrigger scrub on `filter: grayscale(1) contrast(1.1)` → `grayscale(0)`), and stay coloured.
  - Each screenshot sits in a thin hairline frame with a tiny mono caption (`// LONDON · STRAND · LIVE`).
  - Some reveal through a **hexagon clip-path mask** that expands from the centre (the hex is our symbol).
- **No header. No nav. No top logo. No top buttons.** The hero *is* the brand: a giant white **OPINION** wordmark in the hero type, pure white on black. It's the only "logo" on the page.

**Typography (Google Fonts):**
- Display: **Geist** 800/900, uppercase, letter-spacing −0.04em, line-height 0.9. Hero wordmark ~`clamp(64px, 17vw, 260px)`.
- Body: **Geist** 400/500, 15–17px, line-height 1.55, max 60ch.
- HUD / labels / numbers: **Geist Mono** 400–500, 10–12px, uppercase, letter-spacing 0.18–0.24em, tabular numbers.

**Texture:** a very subtle film grain overlay (an SVG noise canvas at 4% opacity) and faint scanline rings around the globe. Keep it understated.

---

## 4. Page structure (scroll story)

Use **Lenis** for smooth scroll and **one master GSAP timeline per pinned scene**. Elements that travel between scenes belong to a single timeline. Debounce rebuilds on resize.

**0. Preloader (≤1.6 s)**
- Black screen, mono counter `000 → 100` centred, a 1px white line filling under it.
- Then the line splits and wipes up to reveal the hero.
- Skip on repeat visits (sessionStorage).

**1. Hero: "THE HUMAN ORACLE"**
- **three.js globe:** ~12k white points sampled from a land mask (load an equirectangular land/water PNG, e.g. `https://unpkg.com/three-globe/example/img/earth-water.png`, and keep points on land). Points twinkle; the far side fades. Add a faint graticule and 2–3 thin HUD rings (SVG or three.js lines) rotating at different speeds, with tick marks and coordinate readouts.
- **City pins:** London, New York, San Francisco, Beograd and Novi Sad pulse as small white rings. Thin great-circle arcs draw between them in sequence.
- **Type:** the giant **OPINION** wordmark centred over the globe. SplitText chars rise from a mask with blur; the last two letters **ON** do a 3D Y-axis spin (three turns, expo.out), an echo of the app's logo.
- Below it, one line: *"The human oracle for the real world."* Then a mono kicker: `// LIVE FROM 5 CITIES //`.
- **Fixed bottom HUD (persists all page):**
  - a ruler with ticks that slide as you scroll;
  - left: live UTC clock (`23:41:07 UTC`);
  - centre: two compact buttons, **OPEN THE MAP** (white) → https://opinion-london.calderabalkan.workers.dev/ and **ORACLE API** (grey, "early access" mailto);
  - right: scroll progress `034.092`-style counter;
  - tiny links under it (X · Discord · Docs: placeholders, mark TODO).

**2. Dive (pinned, scrubbed)**
- Scroll pushes the camera into the globe toward London: points stream past (dolly + FOV change), the HUD rings expand off-screen.
- At the end, a **hexagon mask** opens from the centre to reveal the first **colour** shot: `assets/hero-london-hackerhouse.jpg`. It's the moment black-and-white becomes colour.
- Mono caption: `// LONDON · SOMERSET HOUSE · HEX 8a195da4…`.

**3. Manifesto (pinned typographic)**
- Three lines, each scrubbed word by word from 15% to 100% white:
  - "INFORMATION IS PRODUCED BY A FEW."
  - "IT IS LIVED BY EVERYONE."
  - "WE'RE GIVING IT BACK TO THE PEOPLE WHO ARE THERE."
- Small body copy underneath explaining the blind spot (story points 1–2).

**4. How it works: STAND → SPEAK → VERIFY → STREAM**
- A horizontal pinned scroll with 4 panels. Each has a big number `01–04`, a heading, two lines of copy and a line-art diagram drawn with DrawSVG: a hexagon with a person dot; a message bubble snapping into the hex; a check plus a signature; a stream of records flowing out.
- The panel 4 diagram flows into section 5.

**5. The Oracle**
- A monochrome pipeline diagram with SVG paths drawn on scroll, and small mono labels animated with ScrambleText: **PEOPLE → HEX (H3) → SIGNED OBSERVATION → REPUTATION & CONSENSUS → LIVE FEEDS → APPS · AI AGENTS · CITIES · ROBOTS**.
- Beside it, the JSON record from §2 in a hairline code panel. Lines type in; values flicker once.
- One colour screenshot next to it: `assets/signals-hexgrid-strand.jpg` (hex grid + traffic lights), captioned `// MACHINE LAYER · SIGNAL STATES`.

**6. Functions**
- A grid of all the functions from §2: 3 columns on desktop, 1 on mobile.
- Each card is black with a hairline border: mono index `F/01`, name, one line and 1–2 sentences, plus a small **colour** thumbnail where one exists.
- Hover: the card border goes white, the thumbnail scales to 1.03, the index scrambles.
- Stagger the cards in with ScrollTrigger.batch.
- Map thumbnails:
  - Live 3D map → `app-desktop-london.jpg`
  - Events → `breakpoint-olympia.jpg`
  - Sports → `stadium-emirates.jpg` / `app-desktop-sports.jpg`
  - Landmarks → `belgrade-build-station.jpg`
  - Profiles → `phone-profile.png`
  - Globe entry → `splash-globe.jpg` / `globe-world.jpg`
  - City picker → `phone-city-reel.png`
  - Traffic lights → `signals-hexgrid-strand.jpg`
- The others are text only.

**7. Connect: "FIND YOUR PEOPLE"**
- Three iPhone frames (simple CSS bezel, black) with colour screenshots `phone-london.png`, `phone-sports.png` and `phone-profile.png`, floating with parallax at different speeds.
- Copy about topics, crews, friends and ZK chat.
- The phones tilt slightly toward the cursor (desktop only).

**8. For physical AI (the inverted white section, vangrid's "Strategic Domains" move)**
- The background flips to **white**, text to black: a smooth flip, with a full-width white panel wiping up.
- Heading: **"GROUND TRUTH FOR MACHINES."**
- A 4-panel grid: **EMBODIED AI · AUTONOMOUS MOBILITY · SMART CITIES · LIVE EVENTS & CROWDS**. Each panel is a light-grey tile with a big uppercase label and a **colour** screenshot cropped tall: `sf-soma-night.jpg`, `signals-hexgrid-strand.jpg`, `globe-world.jpg`, `stadium-emirates.jpg`.
- One paragraph on why human-verified, location-proofed data matters for world models, and on privacy: aggregated, consented, no raw tracking sold.

**9. $ON**
- Back to black.
- A minimal block: points → epochs → $ON. A huge outlined "$ON" whose stroke draws in.
- Three lines: earn for discovering hexes, for useful verified signals, for completing jobs.
- Badge: `SOLANA · DEVNET`.

**10. Cities**
- A giant outlined marquee of city names (LONDON · NEW YORK · SAN FRANCISCO · BEOGRAD · NOVI SAD), scroll-velocity driven: speed and skew follow scroll speed.
- The globe returns, small, with pins.

**11. Final CTA**
- Huge two-line statement: **"STAND SOMEWHERE. / SAY SOMETHING TRUE."** with a SplitText line reveal.
- One white button: **OPEN THE MAP →**.
- Under it, in small grey type, the app's own line: *"Share your own, help world, make friends, get rewarded."*
- **Footer:** mono, tiny, with data credits and © 2026 OPINION.

---

## 5. Motion system (GSAP)

- Register plugins: ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin, CustomEase, Observer (and Flip if useful). Lenis drives ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add(t => lenis.raf(t*1000))`, `lagSmoothing(0)`).
- **House eases:** `expo.out` for reveals; `power3.inOut` for camera moves; `CustomEase.create('hud','0.7,0,0.2,1')` for HUD.
- Scenes are pinned with `scrub: 1` (globe dive, manifesto, how-it-works horizontal, white inversion). Everything else uses `toggleActions: 'play none none reverse'` reveals.
- **The greyscale→colour bloom** is one reusable helper: `bloom(el)` scrubs filter and a 1.06→1 scale between `top 85%` and `center 55%`.
- Three.js reads a shared `progress` object that GSAP tweens, never its own scroll math. Pause the render loop when the canvas is off-screen (IntersectionObserver).
- `gsap.matchMedia()`: under `prefers-reduced-motion`, no pinning, no scrub, no globe dive. Show static frames, instant colour, and the globe rendered once.
- Measure after `document.fonts.ready` and image decode, then `ScrollTrigger.refresh()`.

## 6. three.js details (r186)

- One `WebGLRenderer` (antialias on desktop only, `pixelRatio ≤ 2`), `PerspectiveCamera(35)`.
- **Points globe:** a custom ShaderMaterial with additive blending, size attenuation, twinkle from a seed attribute, and a far-side fade via a facing term. Draw an opaque black core sphere first (it writes depth) so back points are hidden. Add a fresnel rim in **white only** (no colour; the site is monochrome).
- **Arcs:** QuadraticBezier lines with a `uProgress` shader uniform that draws them; white at 60% opacity.
- **Dive:** tween camera z from 4.6 to 1.05 and FOV 35 to 70 while rotating the globe so London faces the camera. Points get bigger and streak.
- Dispose everything on teardown, and handle resize.
- Budgets: 12k points desktop / 5k mobile; 60 fps on an M1 and 30+ on a mid iPhone.

## 7. Tech, files, deploy

- **Stack:** Vite + TypeScript, no framework. Dependencies: `gsap`, `lenis`, `three`.
- **Layout:**
  - `index.html`
  - `src/main.ts` (boot, Lenis, ScrollTrigger)
  - `src/globe.ts` (three.js)
  - `src/scenes/*.ts` (one file per section)
  - `src/styles.css`
  - `public/assets/` (copy from `./assets`)
- **Images:** convert screenshots to AVIF/WebP at 1600w and 800w, served via `<picture>` with explicit width/height and `loading="lazy"` (except the dive shot). Keep the total page weight under 3.5 MB.
- **SEO and share:**
  - `<title>OPINION — The human oracle for the real world</title>`
  - meta description = the app line
  - og:image 1200×630, black, wordmark only (white)
  - `lang="en"`
- **Accessibility:** real `<h1>` (the wordmark) and semantic sections, focus styles, sufficient contrast, `aria-hidden` on decorative canvases, and nothing essential that exists only in canvas.
- **Responsive:** test at 375 / 768 / 1440 / 1920. On mobile the horizontal scroll becomes vertical stacking, phones stack, and the globe gets fewer points.
- **Deploy:** Cloudflare Workers static assets (a `wrangler.jsonc` with `assets.directory: "./dist"`), as a separate Worker named `opinion-landing`. Don't touch the app's Worker.

## 8. Acceptance checklist

- [ ] No nav bar, no top logo, no top buttons. The hero wordmark is the only brand mark.
- [ ] The UI is strictly black and white. The **only** colour on the page is the screenshots, and each one blooms from greyscale to colour on scroll.
- [ ] Every function from §2 appears with an explanation.
- [ ] The story arc from §1 is readable start to finish, even with JavaScript off (static fallback content in HTML).
- [ ] No invented metrics. In-progress items are labelled (devnet, early access).
- [ ] Smooth at 60 fps on desktop, with no layout shift. Reduced motion is respected. No console errors.
- [ ] Lighthouse: Performance ≥ 85 mobile, Accessibility ≥ 95, SEO 100.
- [ ] Before finishing, screenshot each section at 1440 and 375 and review them like an art director: alignment, rhythm, contrast, and the "colour only in the windows" rule.

## Assets available (`./assets`, all real app captures in colour)

| File | What it shows | Suggested use |
|---|---|---|
| `hero-london-hackerhouse.jpg` | Somerset House glass landmark, London, no UI | Dive reveal (§2) |
| `breakpoint-olympia.jpg` | Breakpoint 2026 glass arena at Olympia | Events card |
| `belgrade-build-station.jpg` | 1884 Old Belgrade Railway Station in pastel-gold glass | Landmarks card |
| `stadium-emirates.jpg` | Emirates Stadium glass footprint + fixture tag | Sports / white section |
| `signals-hexgrid-strand.jpg` | Hex grid + live traffic lights, Strand | Oracle / machine layer |
| `sf-soma-night.jpg` | San Francisco SoMa in 3D | White section: Embodied AI |
| `globe-world.jpg` | The app's world globe with city beacons | Smart cities / cities |
| `splash-globe.jpg` | The app's loading globe | Globe entry card |
| `app-desktop-london.jpg` / `app-desktop-sports.jpg` | Full desktop UI | Functions |
| `phone-london.png` / `phone-belgrade.png` / `phone-sports.png` / `phone-profile.png` / `phone-city-reel.png` | iPhone UI | Connect section phones |
