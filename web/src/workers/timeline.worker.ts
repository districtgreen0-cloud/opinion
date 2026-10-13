/// <reference lib="webworker" />
import { buildFootprint } from '../lib/timeline'

// Parse off the main thread so a 300 MB Records.json doesn't freeze the map.
self.onmessage = async (e: MessageEvent<File[]>) => {
  try {
    const jsons: unknown[] = []
    for (const f of e.data) {
      self.postMessage({ type: 'progress', text: `Reading ${f.name}…` })
      jsons.push(JSON.parse(await f.text()))
    }
    self.postMessage({ type: 'progress', text: 'Mapping to hexes…' })
    self.postMessage({ type: 'done', footprint: buildFootprint(jsons) })
  } catch (err) {
    self.postMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) })
  }
}
