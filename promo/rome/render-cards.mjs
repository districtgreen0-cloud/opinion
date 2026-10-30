// Renders rome/cards.html frame by frame → out/rome/cards/f%05d.jpg, then encodes out/rome/cards.mp4
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { spawn, execSync } from 'node:child_process'

const FPS = 30, W = 1920, H = 1080
const ROOT = new URL('..', import.meta.url).pathname
const OUT = `${ROOT}out/rome/cards/`
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const vite = spawn('npx', ['vite', '--port', '4791', '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:4791/rome/cards.html')).ok) break } catch {} await new Promise((r) => setTimeout(r, 500)) }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage()
p.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
await p.goto('http://localhost:4791/rome/cards.html')
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
await p.evaluate(() => document.fonts.ready)
const duration = await p.evaluate(() => window.__duration)
const total = Math.round(duration * FPS)
console.log(`cards ${duration}s → ${total} frames`)
for (let f = 0; f < total; f++) {
  await p.evaluate((t) => window.__seek(t), f / FPS)
  await p.screenshot({ path: `${OUT}f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 })
}
await b.close()
vite.kill()
execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i out/rome/cards/f%05d.jpg -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p out/rome/cards.mp4`, { cwd: ROOT, stdio: 'inherit' })
console.log('→ out/rome/cards.mp4')
process.exit(0)
