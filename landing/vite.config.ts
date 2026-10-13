import { defineConfig, type Plugin } from 'vite'

/**
 * <x-shot name="file" alt="…" [phone] [eager] [sizes="…"] [class="…"]></x-shot>
 * expands at build time into a real <picture> (AVIF + WebP, 2 widths) so the page works without JS.
 */
function shots(): Plugin {
  const attr = (s: string, k: string) => s.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1]
  return {
    name: 'x-shot',
    transformIndexHtml(html) {
      return html.replace(/<x-shot([^>]*)><\/x-shot>/g, (_, a: string) => {
        const name = attr(a, 'name')!
        const alt = attr(a, 'alt') ?? ''
        const cls = attr(a, 'class')
        const phone = /\bphone\b/.test(a)
        const eager = /\beager\b/.test(a)
        const [big, small] = phone ? [720, 400] : [1600, 800]
        const h = phone ? Math.round((big * 1977) / 1179) : big * 0.625
        const sizes = attr(a, 'sizes') ?? (phone ? '(max-width: 900px) 60vw, 22vw' : '(max-width: 900px) 100vw, 70vw')
        const set = (ext: string) => `/img/${name}-${small}.${ext} ${small}w, /img/${name}-${big}.${ext} ${big}w`
        return `<picture${cls ? ` class="${cls}"` : ''}><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}"><img src="/img/${name}-${big}.webp" width="${big}" height="${h}" alt="${alt}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`
      })
    },
  }
}

export default defineConfig({
  plugins: [shots()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
})
