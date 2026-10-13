// Share-preview Worker: serves the static app, plus the live event feeds (Luma iCal, optional Eventbrite)
// and sports fixtures (ESPN, TheSportsDB)
// so the demo shows real upcoming events. Everything else is the SPA from ./dist.
import { handleFeeds, type FeedEnv } from '../worker/src/feeds'
import { handleSports, type SportsEnv } from '../worker/src/sports'

type Env = FeedEnv & SportsEnv & { ASSETS: { fetch(req: Request): Promise<Response> } }

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/feeds/events' && req.method === 'GET') return handleFeeds(req, env, ctx)
    if (url.pathname === '/api/feeds/sports' && req.method === 'GET') return handleSports(req, env, ctx)
    return env.ASSETS.fetch(req)
  },
}
