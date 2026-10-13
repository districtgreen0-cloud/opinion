/** Render crashes → the inline boot guard in index.html (works even when this bundle can't load). */
declare global {
  interface Window {
    __opinionFatal?: (title: string, extra?: string) => void
  }
}

export function reportFatal(err: unknown) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  window.__opinionFatal?.('Something went wrong while rendering.', msg)
}
