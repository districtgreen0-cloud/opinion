// First page: choropleth world + capitals; tap a capital; search; empty new city.
import { chromium } from 'playwright-core'
const OUT = new URL('./shots/', import.meta.url).pathname
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const errs = [], R = {}
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
for (const [name, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const c = await b.newContext({ viewport: vp })
  const p = await c.newPage()
  p.on('pageerror', (e) => errs.push(e.message))
  await p.addInitScript(() => sessionStorage.setItem('opinion:splash', '1'))
  await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded() && window.__map.getLayer('capital-dot'), null, { timeout: 120000 }); await p.waitForTimeout(3500)
  await p.screenshot({ path: `${OUT}world-${name}.png` })
  R[name] = await p.evaluate(() => { const m = window.__map; return { dots: m.queryRenderedFeatures({ layers: ['capital-dot'] }).length, names: m.queryRenderedFeatures({ layers: ['capital-name'] }).length, zoom: +m.getZoom().toFixed(2) } })
  if (name === 'desk') {
    await p.getByRole('textbox', { name: 'Search any city' }).fill('Bratis'); await p.waitForTimeout(1500)
    R.search = await p.getByRole('list', { name: 'Matching cities' }).innerText().catch((e) => String(e).slice(0, 80))
    await p.screenshot({ path: `${OUT}world-search.png` })
    R.bar = await p.getByRole('dialog', { name: 'Choose your city' }).count() + await p.getByText('Fly in →').count()
    await p.getByRole('button', { name: /Bratislava/ }).click(); await p.waitForTimeout(1500)
    R.fly = await p.locator('.fly-n').innerText()
    await p.screenshot({ path: `${OUT}world-fly.png` })
    await p.waitForTimeout(6000)
    R.bratislava = await p.evaluate(() => +window.__map.getZoom().toFixed(1))
    await c.close(); continue
    const xy = await p.evaluate(() => { const q = window.__map.project([2.3522, 48.8566]); return [q.x, q.y] }) // Paris
    await p.evaluate(() => window.__map.jumpTo({ center: [2.35, 48.86], zoom: 4 })); await p.waitForTimeout(800)
    const f = await p.evaluate(() => { const m = window.__map; const c = m.queryRenderedFeatures({ layers: ['capital-dot'] }).find((x) => x.properties.n === 'Paris'); const q = m.project(c.geometry.coordinates); return [q.x, q.y] })
    await p.mouse.click(f[0], f[1]); await p.waitForTimeout(8000)
    await p.screenshot({ path: `${OUT}world-paris.png` })
    R.paris = await p.evaluate(() => ({ zoom: +window.__map.getZoom().toFixed(1), center: window.__map.getCenter(), bubbles: document.querySelectorAll('.bubble').length }))
    R.top = await p.locator('body').innerText().then((t) => t.includes('Paris'))
  }
  await c.close()
}
console.log(JSON.stringify({ R, errs }, null, 1)); await b.close()
