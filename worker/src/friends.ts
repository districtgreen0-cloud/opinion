/**
 * Friend requests between signed-in accounts.
 *   GET  /api/friends                    → { links: [{ handle, avatar, status: 'friends' | 'pending' | 'incoming', since }] }
 *   POST /api/friends/request {handle}   → sends a request (or accepts, if they already asked you)
 *   POST /api/friends/accept  {handle}   → accept their request
 *   POST /api/friends/remove  {handle}   → decline / cancel / unfriend
 */
import { getAccount } from "./auth";
import { err, json, readJson, str } from "./http";

const MAX_PENDING_OUT = 100;

async function list(env: Env, me: string) {
  const r = await env.DB.prepare(
    `SELECT a.handle, a.avatar, l.status, l.from_id, COALESCE(l.accepted_at, l.created_at) AS since
     FROM friend_links l JOIN accounts a ON a.id = CASE WHEN l.from_id = ?1 THEN l.to_id ELSE l.from_id END
     WHERE l.from_id = ?1 OR l.to_id = ?1 ORDER BY since DESC LIMIT 500`,
  ).bind(me).all<{ handle: string; avatar: string; status: string; from_id: string; since: number }>();
  return r.results.map((x) => ({ handle: x.handle, avatar: x.avatar, since: x.since, status: x.status === "friends" ? "friends" : x.from_id === me ? "pending" : "incoming" }));
}

const other = (env: Env, raw: unknown) => {
  const h = (str(raw) ?? "").trim().toLowerCase();
  if (!h || h.length > 32) return null;
  return env.DB.prepare("SELECT id, handle FROM accounts WHERE lower(handle) = ?").bind(h.startsWith("@") ? h : "@" + h).first<{ id: string; handle: string }>();
};

export async function handleFriends(req: Request, env: Env, path: string, m: string): Promise<Response | null> {
  if (path !== "/api/friends" && !path.startsWith("/api/friends/")) return null;
  const me = await getAccount(req, env);
  if (!me) return err(req, "sign_in_required", 401);
  if (path === "/api/friends" && m === "GET") return json(req, { links: await list(env, me.id) }, 200, { "Cache-Control": "no-store" });
  if (m !== "POST") return null;

  const body = await readJson(req);
  const them = await other(env, body?.handle);
  if (!them) return err(req, "no_account", 404);
  if (them.id === me.id) return err(req, "self", 400);
  const now = Date.now();
  // a request from them to me, still waiting
  const acceptTheirs = () =>
    env.DB.prepare("UPDATE friend_links SET status = 'friends', accepted_at = ? WHERE from_id = ? AND to_id = ? AND status = 'pending'").bind(now, them.id, me.id).run();

  if (path === "/api/friends/request") {
    const theirs = await env.DB.prepare("SELECT status FROM friend_links WHERE from_id = ? AND to_id = ?").bind(them.id, me.id).first<{ status: string }>();
    if (theirs) {
      if (theirs.status === "pending") await acceptTheirs(); // both asked: you're friends
    } else {
      const out = await env.DB.prepare("SELECT COUNT(*) AS n FROM friend_links WHERE from_id = ? AND status = 'pending'").bind(me.id).first<{ n: number }>();
      if ((out?.n ?? 0) >= MAX_PENDING_OUT) return err(req, "too_many_pending", 429);
      await env.DB.prepare("INSERT OR IGNORE INTO friend_links (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)").bind(me.id, them.id, now).run();
    }
  } else if (path === "/api/friends/accept") {
    const r = await acceptTheirs();
    if (!r.meta.changes) return err(req, "no_request", 404);
  } else if (path === "/api/friends/remove") {
    await env.DB.prepare("DELETE FROM friend_links WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)").bind(me.id, them.id).run();
  } else return null;
  return json(req, { links: await list(env, me.id) });
}
