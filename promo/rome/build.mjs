// Assembles out/OPINION-rome.mp4: cards intro → app footage (cut + captions) → hackathon card → outro, with the soundtrack.
// Needs: out/rome/footage.webm + marks.json (capture.mjs), out/rome/cards.mp4 (render-cards.mjs), out/music.wav (audio.py)
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname
const R = `${ROOT}out/rome/`
const marks = JSON.parse(fs.readFileSync(`${R}marks.json`, 'utf8'))
const dur = +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${R}footage.webm`).toString()
const off = marks.stop - dur // marks were taken from script start; the recording starts a few seconds later
const T = (k) => +(marks[k] - off).toFixed(2)

// ── footage cut list: [from, to, caption]
const CUTS = [
  [T('splash') + 0.2, T('splash') + 5.6, null],
  [T('world') - 0.6, T('flyin'), 'Six cities. Now Roma.'],
  [T('flyin'), T('flyin') + 7.2, 'Fly in · Colosseo · Monti · Fori Imperiali'],
  [T('orbit') + 0.3, T('orbit') + 13.5, 'The Colosseum, rebuilt as a hologram over the real amphitheatre'],
  [T('close') + 1.2, T('close') + 7.2, 'Scan lines, glitch streaks, every arch in light'],
  [T('slab') + 0.6, T('slab') + 5.4, 'Tap the arena → sign up at colosseum.com'],
  [T('events') + 0.8, T('events') + 4.2, '“Enter the Arena” · live in the Roma events list'],
  [T('end') + 2.2, T('end') + 7.6, 'Post where you stand. From the Forum to the Tiber.'],
]
const CARDS = { intro: [0, 6], hack: [6, 20], outro: [20, 27] }

// ── captions → transparent PNGs (same type as the app)
const CAP_HTML = (text) => `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:transparent;width:1920px;height:1080px;overflow:hidden}
.cap{position:absolute;left:84px;bottom:190px;max-width:980px;padding:18px 26px 20px;border-radius:18px;background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(8px);box-shadow:0 0 40px rgba(153,69,255,.25)}
.k{font:500 13px 'JetBrains Mono',monospace;letter-spacing:.28em;text-transform:uppercase;color:rgba(255,255,255,.55)}
.t{font:600 40px/1.15 Inter,system-ui,sans-serif;color:#fff;margin-top:8px;letter-spacing:-.01em}</style></head>
<body><div class="cap"><div class="k">OPINION · Roma</div><div class="t">${text}</div></div></body></html>`
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage()
const caps = []
for (const [i, c] of CUTS.entries()) {
  if (!c[2]) continue
  await p.setContent(CAP_HTML(c[2].replace(/</g, '&lt;')))
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(150)
  const file = `${R}cap${i}.png`
  await p.screenshot({ path: file, omitBackground: true })
  caps.push({ i, file })
}
await b.close()

// ── ffmpeg graph
const inputs = [`-i ${R}cards.mp4`, `-i ${R}footage.webm`, `-i ${ROOT}out/music.wav`]
const capIdx = {}
for (const c of caps) { capIdx[c.i] = inputs.length; inputs.push(`-loop 1 -t 60 -i ${c.file}`) }
const f = []
const seg = (label, src, a, bEnd, k) => {
  const len = bEnd - a
  f.push(`[${src}:v]trim=${a}:${bEnd},setpts=PTS-STARTPTS,fps=30,scale=1920:1080,format=yuv420p,fade=t=in:d=0.35,fade=t=out:st=${(len - 0.35).toFixed(2)}:d=0.35[${label}]`)
  void k
  return len
}
// footage cuts, each with its caption burnt in (fade alpha in/out)
let footLen = 0
const footLabels = []
CUTS.forEach((c, i) => {
  const len = c[1] - c[0]
  f.push(`[1:v]trim=${c[0]}:${c[1]},setpts=PTS-STARTPTS,fps=30,scale=1920:1080,format=yuv420p[raw${i}]`)
  if (capIdx[i] !== undefined) {
    f.push(`[${capIdx[i]}:v]format=rgba,fade=t=in:st=0.5:d=0.4:alpha=1,fade=t=out:st=${(len - 0.9).toFixed(2)}:d=0.4:alpha=1[ca${i}]`)
    f.push(`[raw${i}][ca${i}]overlay=0:0:shortest=1[cut${i}]`)
  } else f.push(`[raw${i}]copy[cut${i}]`)
  footLabels.push(`[cut${i}]`)
  footLen += len
})
f.push(`${footLabels.join('')}concat=n=${CUTS.length}:v=1:a=0,fade=t=in:d=0.5,fade=t=out:st=${(footLen - 0.5).toFixed(2)}:d=0.5[foot]`)
const cardLen = (k) => CARDS[k][1] - CARDS[k][0]
seg('intro', 0, CARDS.intro[0], CARDS.intro[1])
seg('hack', 0, CARDS.hack[0], CARDS.hack[1])
seg('outro', 0, CARDS.outro[0], CARDS.outro[1])
f.push(`[intro][foot][hack][outro]concat=n=4:v=1:a=0[v]`)
const total = cardLen('intro') + footLen + cardLen('hack') + cardLen('outro')
f.push(`[2:a]atrim=0:${total.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:d=1,afade=t=out:st=${(total - 4).toFixed(2)}:d=4[a]`)

const cmd = `ffmpeg -y -loglevel error -stats ${inputs.join(' ')} -filter_complex "${f.join(';')}" -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k ${ROOT}out/OPINION-rome.mp4`
console.log(`footage ${footLen.toFixed(1)}s · total ${total.toFixed(1)}s`)
execSync(cmd, { stdio: 'inherit' })
console.log('→ out/OPINION-rome.mp4')
