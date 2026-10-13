/**
 * ============================================================================================
 *  ZERO-KNOWLEDGE (END-TO-END ENCRYPTED) CHAT RELAY
 * ============================================================================================
 *  This relay is zero-knowledge: it NEVER sees plaintext or private keys. It stores and forwards
 *  only opaque ciphertext envelopes (iv + ct, base64url) and PUBLIC keys. Room keys are wrapped
 *  client-side for each member (ZkWrapped) before upload; the server cannot unwrap them. Room names
 *  for groups may be client-encrypted and are treated as opaque strings.
 *
 *  What the server DOES know (metadata): public keys + handles/avatars, which fps belong to which
 *  room, who (fp) sent an envelope and when, ciphertext sizes, and client IPs (rate limiting only).
 *
 *  Membership is ADVISORY. Requests are not authenticated: anyone who knows an fp can claim it in
 *  `by` / `from`. This keeps the relay simple, and confidentiality is unaffected (non-members cannot
 *  decrypt), but a real deployment MUST require a signature from the member's identity key on every
 *  request (e.g. ECDSA over method+path+body+timestamp, verified against the pub key in zk_keys) so
 *  only the genuine member can post / only the genuine admin can change a room. That is the NEXT
 *  HARDENING STEP; it is intentionally not implemented here.
 *
 *  Layout: public key directory in D1 (zk_keys), membership index in D1 (zk_room_members, for
 *  "rooms of fp"), and one SQLite-backed Durable Object per room (ZkRoom) holding the room record,
 *  the last 500 envelopes and the hibernating WebSockets for fan-out.
 * ============================================================================================
 */
import { DurableObject } from "cloudflare:workers";
import { clean, err, json, readJson, str } from "./http";
import type { ZkEnvelope, ZkKey, ZkRoom as ZkRoomRecord, ZkWrapped } from "./types";

const FP_RE = /^[0-9a-f]{64}$/;
const B64U_RE = /^[A-Za-z0-9_-]+$/;
const ROOM_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ENV_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const COORD_LEN = 43; // 32 bytes base64url, P-256 x / y
const IV_LEN = 16; // 12 bytes base64url
const MAX_CT = 16 * 1024;
const MAX_WRAPPED_CT = 512;
const MAX_MEMBERS = 50;
const MAX_NAME = 200;
const KEEP = 500;
const PAGE = 200;
const RATE_LIMIT = 30; // messages
const RATE_WINDOW_MS = 60_000; // per minute, per IP, per room
const MAX_ROOM_BODY = 64 * 1024;
const MAX_MSG_BODY = 32 * 1024;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isB64u = (v: unknown, len?: number, max?: number): v is string =>
  typeof v === "string" && v.length > 0 && B64U_RE.test(v) && (len === undefined || v.length === len) && (max === undefined || v.length <= max);

async function fingerprint(x: string, y: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${x}.${y}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- room validation (pure) ----------

export type RoomResult = { ok: true; room: ZkRoomRecord } | { ok: false; status: number; error: string; field?: string };
const bad = (error: string, field?: string, status = 400): RoomResult => ({ ok: false, status, error, ...(field ? { field } : {}) });

/** Validates a posted room record against the stored one (null on create). Returns the normalized record to store. */
export function validateRoom(id: string, input: unknown, by: unknown, prev: ZkRoomRecord | null, now: number): RoomResult {
  if (!isObj(input)) return bad("invalid", "room");
  if (typeof by !== "string" || !FP_RE.test(by)) return bad("invalid", "by");
  if (input.id !== id) return bad("invalid", "id");
  if (input.kind !== "dm" && input.kind !== "group") return bad("invalid", "kind");
  const kind = input.kind;
  if (typeof input.name !== "string" || input.name.length > MAX_NAME) return bad("invalid", "name");
  if (typeof input.admin !== "string" || !FP_RE.test(input.admin)) return bad("invalid", "admin");
  const admin = input.admin;
  if (!Array.isArray(input.members) || input.members.length < 1 || input.members.length > MAX_MEMBERS) return bad("invalid", "members");
  const members: string[] = [];
  for (const m of input.members) {
    if (typeof m !== "string" || !FP_RE.test(m)) return bad("invalid", "members");
    if (!members.includes(m)) members.push(m);
  }
  if (members.length !== input.members.length) return bad("invalid", "members");
  if (kind === "dm" && members.length > 2) return bad("invalid", "members");
  if (!members.includes(admin)) return bad("invalid", "admin");
  if (typeof input.epoch !== "number" || !Number.isInteger(input.epoch) || input.epoch < 0 || input.epoch > 1_000_000) return bad("invalid", "epoch");
  const epoch = input.epoch;

  if (prev) {
    if (by !== prev.admin) return bad("forbidden", "by", 403);
    if (admin !== prev.admin || kind !== prev.kind) return bad("invalid", "admin");
    const same = members.length === prev.members.length && members.every((m) => prev.members.includes(m));
    if (same ? epoch !== prev.epoch : epoch !== prev.epoch + 1) return bad("invalid_epoch", "epoch");
  } else {
    if (by !== admin) return bad("forbidden", "by", 403);
  }

  if (!isObj(input.keys)) return bad("invalid", "keys");
  const keys: ZkRoomRecord["keys"] = {};
  const entries = Object.entries(input.keys);
  if (entries.length > 1001) return bad("invalid", "keys");
  for (const [e, v] of entries) {
    if (!/^\d{1,7}$/.test(e) || Number(e) > epoch || !isObj(v) || typeof v.by !== "string" || !FP_RE.test(v.by) || !isObj(v.to)) return bad("invalid", "keys");
    const to: Record<string, ZkWrapped> = {};
    const tos = Object.entries(v.to);
    if (tos.length > MAX_MEMBERS) return bad("invalid", "keys");
    for (const [fp, w] of tos) {
      if (!FP_RE.test(fp) || !isObj(w) || !isB64u(w.iv, IV_LEN) || !isB64u(w.ct, undefined, MAX_WRAPPED_CT)) return bad("invalid", "keys");
      to[fp] = { iv: w.iv, ct: w.ct as string };
    }
    keys[e] = { by: v.by, to };
  }
  const cur = keys[String(epoch)];
  if (!cur || !members.every((m) => cur.to[m])) return bad("missing_wrapped_key", "keys");

  return { ok: true, room: { id, kind, name: input.name, members, admin, epoch, keys, updatedAt: now } };
}

// ---------- Durable Object ----------

interface MsgRow extends Record<string, SqlStorageValue> { id: string; from_fp: string; epoch: number; iv: string; ct: string; ts: number }
const toEnvelope = (room: string, r: MsgRow): ZkEnvelope => ({ id: r.id, room, from: r.from_fp, epoch: r.epoch, iv: r.iv, ct: r.ct, ts: r.ts });

export type PutResult = { ok: true; room: ZkRoomRecord } | { ok: false; status: number; error: string; field?: string };
export type PostResult =
  | { ok: true; envelope: ZkEnvelope }
  | { ok: false; status: number; error: string; field?: string; retryAfter?: number };

/** One Durable Object per room (idFromName(roomId)). Room record + last 500 envelopes + hibernating WebSocket fan-out. */
export class ZkRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS msgs (
          id TEXT PRIMARY KEY, from_fp TEXT NOT NULL, epoch INTEGER NOT NULL, iv TEXT NOT NULL, ct TEXT NOT NULL, ts INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_msgs_ts ON msgs (ts);
        CREATE TABLE IF NOT EXISTS rate (ip TEXT NOT NULL, ts INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_rate_ip ON rate (ip, ts);
      `);
    });
  }

  /** RPC: the stored room record, or null. */
  getRoom(): ZkRoomRecord | null {
    const row = this.ctx.storage.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'room'").toArray()[0];
    return row ? (JSON.parse(row.v) as ZkRoomRecord) : null;
  }

  /** RPC: create or update (rules in validateRoom). Broadcasts {type:'room'}. */
  putRoom(id: string, input: unknown, by: unknown): PutResult {
    const r = validateRoom(id, input, by, this.getRoom(), Date.now());
    if (!r.ok) return r;
    this.ctx.storage.sql.exec("INSERT INTO meta (k, v) VALUES ('room', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", JSON.stringify(r.room));
    this.broadcast({ type: "room", room: r.room });
    return r;
  }

  /** RPC: validate + store + broadcast an opaque envelope. */
  postMessage(id: string, input: unknown, ip: string): PostResult {
    const sql = this.ctx.storage.sql;
    const room = this.getRoom();
    if (!room) return { ok: false, status: 404, error: "not_found" };
    if (!isObj(input)) return { ok: false, status: 400, error: "invalid", field: "envelope" };
    const { from, epoch, iv, ct } = input;
    if (typeof from !== "string" || !FP_RE.test(from)) return { ok: false, status: 400, error: "invalid", field: "from" };
    if (!room.members.includes(from)) return { ok: false, status: 403, error: "not_a_member" };
    if (typeof epoch !== "number" || !Number.isInteger(epoch) || epoch < 0 || epoch > room.epoch) return { ok: false, status: 400, error: "invalid", field: "epoch" };
    if (!isB64u(iv, IV_LEN)) return { ok: false, status: 400, error: "invalid", field: "iv" };
    if (!isB64u(ct, undefined, MAX_CT)) return { ok: false, status: 400, error: "invalid", field: "ct" };
    const eid = input.id === undefined ? crypto.randomUUID() : input.id;
    if (typeof eid !== "string" || !ENV_ID_RE.test(eid.replace(/-/g, "_"))) return { ok: false, status: 400, error: "invalid", field: "id" };
    if (sql.exec("SELECT 1 FROM msgs WHERE id = ?", eid).toArray().length) return { ok: false, status: 409, error: "duplicate" };

    const now = Date.now();
    sql.exec("DELETE FROM rate WHERE ts < ?", now - RATE_WINDOW_MS);
    const recent = sql.exec<{ n: number; oldest: number | null }>("SELECT COUNT(*) AS n, MIN(ts) AS oldest FROM rate WHERE ip = ? AND ts >= ?", ip, now - RATE_WINDOW_MS).one();
    if (recent.n >= RATE_LIMIT) {
      return { ok: false, status: 429, error: "rate_limited", retryAfter: Math.max(1, Math.ceil(((recent.oldest ?? now) + RATE_WINDOW_MS - now) / 1000)) };
    }
    sql.exec("INSERT INTO rate (ip, ts) VALUES (?, ?)", ip, now);

    // Server-assigned, strictly increasing ts so `?since=ts` paging never skips or repeats.
    const last = sql.exec<{ m: number | null }>("SELECT MAX(ts) AS m FROM msgs").one().m ?? 0;
    const ts = Math.max(now, last + 1);
    const envelope: ZkEnvelope = { id: eid, room: id, from, epoch, iv, ct, ts };
    sql.exec("INSERT INTO msgs (id, from_fp, epoch, iv, ct, ts) VALUES (?, ?, ?, ?, ?, ?)", eid, from, epoch, iv, ct, ts);
    sql.exec("DELETE FROM msgs WHERE id NOT IN (SELECT id FROM msgs ORDER BY ts DESC LIMIT ?)", KEEP);

    this.broadcast({ type: "msg", envelope });
    return { ok: true, envelope };
  }

  /** RPC: up to 200 envelopes after `since`, oldest -> newest (the first 200 after it). */
  getMessages(id: string, since: number): ZkEnvelope[] {
    return this.ctx.storage.sql
      .exec<MsgRow>("SELECT * FROM msgs WHERE ts > ? ORDER BY ts ASC LIMIT ?", since, PAGE)
      .toArray()
      .map((r) => toEnvelope(id, r));
  }

  /** WebSocket upgrade (Hibernation API). Server -> client only; clients send POSTs. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket upgrade", { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === "ping") ws.send("pong");
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // already closed
    }
  }

  webSocketError(): void {}

  private broadcast(msg: unknown): void {
    const payload = JSON.stringify(msg);
    for (const s of this.ctx.getWebSockets()) {
      try {
        s.send(payload);
      } catch {
        // socket going away
      }
    }
  }
}

// ---------- HTTP handlers ----------

interface KeyRow { fp: string; handle: string; avatar: string; pub_json: string; created_at: number }
const toKey = (r: KeyRow): ZkKey => ({ fp: r.fp, handle: r.handle, avatar: r.avatar, pub: JSON.parse(r.pub_json) as ZkKey["pub"], createdAt: r.created_at });

async function postKey(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (!body) return err(req, "invalid_body", 400);
  const fp = body.fp, pub = body.pub;
  if (typeof fp !== "string" || !FP_RE.test(fp)) return err(req, "invalid", 400, { field: "fp" });
  if (!isObj(pub) || pub.kty !== "EC" || pub.crv !== "P-256" || !isB64u(pub.x, COORD_LEN) || !isB64u(pub.y, COORD_LEN)) return err(req, "invalid", 400, { field: "pub" });
  if ((await fingerprint(pub.x, pub.y)) !== fp) return err(req, "fp_mismatch", 400, { field: "fp" });
  const handle = clean(str(body.handle) ?? "").slice(0, 32) || "anon";
  const avatar = (str(body.avatar) ?? "").slice(0, 512);
  const canon = { kty: "EC", crv: "P-256", x: pub.x, y: pub.y };
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO zk_keys (fp, handle, avatar, pub_json, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(fp) DO UPDATE SET handle = excluded.handle, avatar = excluded.avatar",
  ).bind(fp, handle, avatar, JSON.stringify(canon), now).run();
  const row = await env.DB.prepare("SELECT * FROM zk_keys WHERE fp = ?").bind(fp).first<KeyRow>();
  return json(req, row ? toKey(row) : null, 201);
}

async function getKeys(req: Request, env: Env, url: URL, fp: string | null): Promise<Response> {
  if (fp !== null) {
    if (!FP_RE.test(fp)) return err(req, "invalid", 400, { field: "fp" });
    const row = await env.DB.prepare("SELECT * FROM zk_keys WHERE fp = ?").bind(fp).first<KeyRow>();
    return row ? json(req, toKey(row)) : err(req, "not_found", 404);
  }
  const handle = clean(url.searchParams.get("handle") ?? "").slice(0, 32);
  if (!handle) return err(req, "invalid", 400, { field: "handle" });
  const row = await env.DB.prepare("SELECT * FROM zk_keys WHERE lower(handle) = lower(?) ORDER BY created_at ASC LIMIT 1").bind(handle).first<KeyRow>();
  return row ? json(req, toKey(row)) : err(req, "not_found", 404);
}

async function putRoom(req: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(req, MAX_ROOM_BODY);
  if (!body) return err(req, "invalid_body", 400);
  const res = await env.ZK_ROOM.getByName(id).putRoom(id, body.room, body.by);
  if (!res.ok) return err(req, res.error, res.status, res.field ? { field: res.field } : {});
  // Membership index for GET /api/zk/rooms?member=fp (rewritten on every accepted PUT).
  await env.DB.batch([
    env.DB.prepare("DELETE FROM zk_room_members WHERE room = ?").bind(id),
    ...res.room.members.map((fp) => env.DB.prepare("INSERT OR IGNORE INTO zk_room_members (room, fp) VALUES (?, ?)").bind(id, fp)),
  ]);
  return json(req, res.room);
}

async function listRooms(req: Request, env: Env, url: URL): Promise<Response> {
  const member = url.searchParams.get("member") ?? "";
  if (!FP_RE.test(member)) return err(req, "invalid", 400, { field: "member" });
  const { results } = await env.DB.prepare("SELECT room FROM zk_room_members WHERE fp = ? LIMIT 100").bind(member).all<{ room: string }>();
  const rooms = await Promise.all(results.map((r) => env.ZK_ROOM.getByName(r.room).getRoom()));
  return json(req, { rooms: rooms.filter((r): r is ZkRoomRecord => !!r && r.members.includes(member)) });
}

/** Returns null when the path is not a /api/zk/* route this module owns. */
export async function handleZk(req: Request, env: Env, url: URL, path: string, m: string): Promise<Response | null> {
  if (path === "/api/zk/keys") {
    if (m === "POST") return postKey(req, env);
    if (m === "GET") return getKeys(req, env, url, null);
    return err(req, "method_not_allowed", 405);
  }
  const key = path.match(/^\/api\/zk\/keys\/([^/]+)$/);
  if (key) return m === "GET" ? getKeys(req, env, url, key[1] as string) : err(req, "method_not_allowed", 405);

  if (path === "/api/zk/rooms") return m === "GET" ? listRooms(req, env, url) : err(req, "method_not_allowed", 405);

  const r = path.match(/^\/api\/zk\/rooms\/([^/]+)(?:\/(messages|ws))?$/);
  if (!r) return null;
  const id = r[1] as string;
  if (!ROOM_ID_RE.test(id)) return err(req, "invalid_room_id", 400);
  const stub = env.ZK_ROOM.getByName(id);

  if (!r[2]) {
    if (m === "PUT") return putRoom(req, env, id);
    if (m === "GET") {
      const room = await stub.getRoom();
      return room ? json(req, room) : err(req, "not_found", 404);
    }
    return err(req, "method_not_allowed", 405);
  }

  if (r[2] === "messages") {
    if (m === "POST") {
      const body = await readJson(req, MAX_MSG_BODY);
      if (!body) return err(req, "invalid_body", 400);
      const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
      const res = await stub.postMessage(id, body.envelope, ip);
      if (!res.ok) {
        return err(req, res.error, res.status, { ...(res.field ? { field: res.field } : {}), ...(res.retryAfter ? { retryAfter: res.retryAfter } : {}) }, res.retryAfter ? { "Retry-After": String(res.retryAfter) } : {});
      }
      return json(req, res.envelope, 201);
    }
    if (m === "GET") {
      if (!(await stub.getRoom())) return err(req, "not_found", 404);
      const since = Number(url.searchParams.get("since") ?? 0);
      return json(req, { messages: await stub.getMessages(id, Number.isFinite(since) ? since : 0) });
    }
    return err(req, "method_not_allowed", 405);
  }

  if (m !== "GET") return err(req, "method_not_allowed", 405);
  if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return err(req, "expected_websocket", 426);
  if (!(await stub.getRoom())) return err(req, "not_found", 404);
  return stub.fetch(req);
}
