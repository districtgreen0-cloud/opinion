/**
 * Memories: camera photos pinned to a hex (never drawn on the map, only listed inside the hex).
 *   POST /api/memories                 multipart: cell, lat, lng, full (webp/jpeg ≤ 900 KB), thumb (≤ 120 KB)
 *   GET  /api/memories?cell=<h3>       newest first, hidden ones excluded
 *   POST /api/memories/<id>/report     3 distinct reports → hidden pending review
 *   GET  /api/media/memories/...       image bytes from R2, immutable cache
 * Rules: signed in · standing in the hex (same check as posts) · 1 per person per hex · 3 per person per UTC day.
 */
import { getResolution, isValidCell, latLngToCell } from "h3-js";
import { getAccount } from "./auth";
import { err, json } from "./http";

declare global {
  interface Env {
    MEDIA?: R2Bucket;
  }
}

const DAY = 86_400_000;
const PER_DAY = 3;
const MAX_FULL = 900 * 1024;
const MAX_THUMB = 120 * 1024;
const HIDE_AT = 3;

type Row = { id: string; handle: string; avatar: string; cell: string; full_key: string; thumb_key: string; created_at: number };
const out = (r: Row) => ({ id: r.id, handle: r.handle, avatar: r.avatar, cell: r.cell, createdAt: r.created_at, full: `/api/media/${r.full_key}`, thumb: `/api/media/${r.thumb_key}` });

/** Real image bytes only: WebP (RIFF....WEBP) or JPEG (FF D8 FF). Content-Type headers are not trusted. */
function sniff(b: Uint8Array): "image/webp" | "image/jpeg" | null {
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

async function create(req: Request, env: Env): Promise<Response> {
  if (!env.MEDIA) return err(req, "media_not_configured", 501);
  const acc = await getAccount(req, env);
  if (!acc) return err(req, "sign_in_required", 401);
  if (Number(req.headers.get("Content-Length") ?? 0) > MAX_FULL + MAX_THUMB + 16 * 1024) return err(req, "too_large", 413);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err(req, "invalid_body", 400);
  }
  const cell = String(form.get("cell") ?? "").toLowerCase();
  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  const res = Number(env.H3_RES);
  if (!isValidCell(cell) || getResolution(cell) !== res) return err(req, "invalid_cell", 400);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return err(req, "invalid_location", 400);
  if (latLngToCell(lat, lng, res) !== cell) return err(req, "not_here", 403, { yourCell: latLngToCell(lat, lng, res) });

  const full = form.get("full");
  const thumb = form.get("thumb");
  if (!(full instanceof File) || !(thumb instanceof File) || full.size > MAX_FULL || thumb.size > MAX_THUMB || !full.size || !thumb.size) return err(req, "invalid_image", 400);
  const fullBytes = new Uint8Array(await full.arrayBuffer());
  const thumbBytes = new Uint8Array(await thumb.arrayBuffer());
  const ft = sniff(fullBytes);
  const tt = sniff(thumbBytes);
  if (!ft || !tt) return err(req, "invalid_image", 400);

  const now = Date.now();
  const dayStart = Math.floor(now / DAY) * DAY;
  const [today, inHex] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM memories WHERE account_id = ? AND created_at >= ?").bind(acc.id, dayStart).first<{ n: number }>(),
    env.DB.prepare("SELECT id FROM memories WHERE account_id = ? AND cell = ?").bind(acc.id, cell).first<{ id: string }>(),
  ]);
  if (inHex) return err(req, "hex_limit", 409);
  if ((today?.n ?? 0) >= PER_DAY) return err(req, "daily_limit", 429, { resetsAt: dayStart + DAY });

  const id = crypto.randomUUID();
  const ext = (t: string) => (t === "image/webp" ? "webp" : "jpg");
  const fullKey = `memories/${cell}/${id}.${ext(ft)}`;
  const thumbKey = `memories/${cell}/${id}_t.${ext(tt)}`;
  const meta = (t: string) => ({ httpMetadata: { contentType: t, cacheControl: "public, max-age=31536000, immutable" } });
  await Promise.all([env.MEDIA.put(fullKey, fullBytes, meta(ft)), env.MEDIA.put(thumbKey, thumbBytes, meta(tt))]);
  const row: Row = { id, handle: acc.handle ?? "anon", avatar: acc.avatar ?? "", cell, full_key: fullKey, thumb_key: thumbKey, created_at: now };
  try {
    await env.DB.prepare("INSERT INTO memories (id, account_id, handle, avatar, cell, full_key, thumb_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, acc.id, row.handle, row.avatar, cell, fullKey, thumbKey, now).run();
  } catch {
    await env.MEDIA.delete([fullKey, thumbKey]); // lost a race with a parallel upload to the same hex
    return err(req, "hex_limit", 409);
  }
  return json(req, { memory: out(row), left: PER_DAY - (today?.n ?? 0) - 1 }, 201);
}

async function list(req: Request, env: Env, url: URL): Promise<Response> {
  const cell = (url.searchParams.get("cell") ?? "").toLowerCase();
  if (!isValidCell(cell)) return err(req, "invalid_cell", 400);
  const rows = (await env.DB.prepare("SELECT id, handle, avatar, cell, full_key, thumb_key, created_at FROM memories WHERE cell = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 60").bind(cell).all<Row>()).results;
  return json(req, { memories: rows.map(out) });
}

async function report(req: Request, env: Env, id: string): Promise<Response> {
  const acc = await getAccount(req, env);
  if (!acc) return err(req, "sign_in_required", 401);
  const r = await env.DB.prepare("INSERT OR IGNORE INTO memory_reports (memory_id, account_id, created_at) VALUES (?, ?, ?)").bind(id, acc.id, Date.now()).run();
  if (r.meta.changes) {
    await env.DB.prepare("UPDATE memories SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ? THEN 1 ELSE hidden END WHERE id = ?").bind(HIDE_AT, id).run();
  }
  return json(req, { ok: true });
}

async function media(req: Request, env: Env, key: string): Promise<Response> {
  if (!env.MEDIA || !/^memories\/[0-9a-f]{15}\/[0-9a-f-]{36}(_t)?\.(webp|jpg)$/.test(key)) return err(req, "not_found", 404);
  const obj = await env.MEDIA.get(key);
  if (!obj) return err(req, "not_found", 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("X-Content-Type-Options", "nosniff");
  return new Response(obj.body, { headers: h });
}

export async function handleMemories(req: Request, env: Env, url: URL, path: string, m: string): Promise<Response | null> {
  if (path === "/api/memories" && m === "POST") return create(req, env);
  if (path === "/api/memories" && m === "GET") return list(req, env, url);
  const rep = path.match(/^\/api\/memories\/([0-9a-f-]{36})\/report$/);
  if (rep && m === "POST") return report(req, env, rep[1] as string);
  if (path.startsWith("/api/media/") && m === "GET") return media(req, env, path.slice("/api/media/".length));
  return null;
}
