// Renders the promo frame by frame (deterministic: window.__seek(t)) → out/frames/f%05d.jpg
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

const FPS = 30
const W = 1920, H = 1080
const OUT = new URL('./out/frames/', import.meta.url).pathname
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

// dev server
const vite = spawn('npx', ['vite', '--port', '4790', '--strictPort'], { cwd: new URL('.', import.meta.url).pathname, stdio: 'ignore' })
const up = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch('http://localhost:4790/'); if (r.ok) return } catch {} await new Promise((r) => setTimeout(r, 500)) } throw new Error('vite did not start') }
await up()

const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage()
p.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
await p.goto('http://localhost:4790/')
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
const duration = await p.evaluate(() => window.__duration)
const total = Math.round(duration * FPS)
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null // e.g. "10,45,90" → a few preview frames (seconds)
console.log(`duration ${duration}s → ${total} frames @ ${FPS}fps`)
const t0 = Date.now()
if (only) {
  for (const s of only) {
    await p.evaluate((t) => window.__seek(t), s)
    await p.screenshot({ path: `${OUT}preview_${String(s).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 92 })
  }
} else {
  for (let f = 0; f < total; f++) {
    await p.evaluate((t) => window.__seek(t), f / FPS)
    await p.screenshot({ path: `${OUT}f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 })
    if (f % 150 === 0) console.log(`frame ${f}/${total} · ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  }
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
await b.close()
vite.kill()
process.exit(0)
