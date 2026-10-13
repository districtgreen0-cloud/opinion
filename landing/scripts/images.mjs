// Converts ./assets screenshots into AVIF + WebP at two widths for <picture>, plus land mask + og image.
import sharp from 'sharp'
import { readdirSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'

const SRC = 'assets', OUT = 'public/img'
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(SRC)) {
  const name = f.replace(/\.(jpe?g|png)$/i, '')
  const phone = name.startsWith('phone-')
  const widths = phone ? [720, 400] : [1600, 800]
  for (const w of widths) {
    const img = sharp(`${SRC}/${f}`).resize({ width: w })
    await img.clone().avif({ quality: phone ? 50 : 46, effort: 5 }).toFile(`${OUT}/${name}-${w}.avif`)
    await img.clone().webp({ quality: phone ? 72 : 70 }).toFile(`${OUT}/${name}-${w}.webp`)
  }
  console.log('✓', name)
}

// Land mask for the point globe (white = water in the source; we invert when sampling).
if (existsSync('scripts/earth-water.png')) {
  await sharp('scripts/earth-water.png').resize(720, 360).greyscale().png({ palette: true, colors: 2 }).toFile('public/earth-mask.png')
  console.log('✓ earth mask')
}

// og:image — black, white wordmark only.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="100%" height="100%" fill="#000"/>
<text x="600" y="370" text-anchor="middle" font-family="Helvetica Neue, Arial" font-weight="900" font-size="190" letter-spacing="-8" fill="#fff">OPINION</text></svg>`
await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile('public/og.jpg')
console.log('✓ og')
