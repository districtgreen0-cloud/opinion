import { DurableObject } from "cloudflare:workers";
import type { Comment, JobStatus, NewComment, PostKind, PostResult } from "./types";

const KEEP = 200;
const RATE_LIMIT = 5; // posts
const RATE_WINDOW_MS = 60_000; // per minute, per IP, per hex room

interface Row extends Record<string, SqlStorageValue> {
  id: string;
  cell: string;
  text: string;
  handle: string;
  avatar: string;
  wallet: string | null;
  account_id: string | null;
  created_at: number;
  kind: PostKind | null;
  title: string | null;
  parent_id: string | null;
  price_usdc: number | null;
  job_status: JobStatus | null;
  worker_handle: string | null;
  worker_wallet: string | null;
}

const NOTE = "(kind IS NULL OR kind = 'note')";

const toComment = (r: Row): Comment => {
  const c: Comment = {
    id: r.id,
    cell: r.cell,
    text: r.text,
    handle: r.handle,
    avatar: r.avatar,
    createdAt: r.created_at,
  };
  if (r.wallet) c.wallet = r.wallet;
  if (r.account_id) c.accountId = r.account_id;
  c.kind = r.kind ?? "note";
  if (r.title) c.title = r.title;
  if (r.parent_id) c.parentId = r.parent_id;
  if (r.price_usdc !== null) c.priceUsdc = r.price_usdc;
  if (r.job_status) c.jobStatus = r.job_status;
  if (r.worker_handle) c.workerHandle = r.worker_handle;
  if (r.worker_wallet) c.workerWallet = r.worker_wallet;
  return c;
};

/** One Durable Object per H3 cell (idFromName(cell)). Stores comments, fans out over hibernating WebSockets. */
export class HexRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          cell TEXT NOT NULL,
          text TEXT NOT NULL,
          handle TEXT NOT NULL,
          avatar TEXT NOT NULL,
          wallet TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_comments_created ON comments (created_at DESC);
        CREATE TABLE IF NOT EXISTS rate (ip TEXT NOT NULL, ts INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_rate_ip ON rate (ip, ts);
      `);
      // Schema upgrade for objects created before post kinds existed (ALTER TABLE ADD COLUMN is not idempotent).
      const have = new Set(this.ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(comments)").toArray().map((c) => c.name));
      const add: [string, string][] = [
        ["kind", "TEXT"], ["title", "TEXT"], ["parent_id", "TEXT"], ["price_usdc", "REAL"],
        ["job_status", "TEXT"], ["worker_handle", "TEXT"], ["worker_wallet", "TEXT"], ["account_id", "TEXT"],
      ];
      for (const [col, type] of add) if (!have.has(col)) this.ctx.storage.sql.exec(`ALTER TABLE comments ADD COLUMN ${col} ${type}`);
      this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id)");
    });
  }

  /** RPC: oldest -> newest. Last 200 notes plus every topic, reply and job (those are never evicted). */
  getComments(): Comment[] {
    const rows = this.ctx.storage.sql
      .exec<Row>(
        `SELECT * FROM comments WHERE (${NOTE} AND id IN (SELECT id FROM comments WHERE ${NOTE} ORDER BY created_at DESC, rowid DESC LIMIT ?))
         OR NOT ${NOTE} ORDER BY created_at ASC, rowid ASC`,
        KEEP,
      )
      .toArray();
    return rows.map(toComment);
  }

  /** RPC: store + broadcast. Location gating happens in the Worker before this is called. */
  postComment(cell: string, input: NewComment, ip: string): PostResult {
    const sql = this.ctx.storage.sql;
    const now = Date.now();

    const kind: PostKind = input.kind ?? "note";
    if (kind === "reply") {
      const parent = sql.exec<{ kind: string | null }>("SELECT kind FROM comments WHERE id = ?", input.parentId ?? "").toArray()[0];
      if (!parent || parent.kind !== "topic") return { ok: false, error: "invalid", field: "parentId" };
    }

    // Simple per-IP rate limit (5 posts / min). Production: add signed location proofs / attestation too.
    sql.exec("DELETE FROM rate WHERE ts < ?", now - RATE_WINDOW_MS);
    const recent = sql
      .exec<{ n: number; oldest: number | null }>("SELECT COUNT(*) AS n, MIN(ts) AS oldest FROM rate WHERE ip = ? AND ts >= ?", ip, now - RATE_WINDOW_MS)
      .one();
    if (recent.n >= RATE_LIMIT) {
      const retryAfter = Math.max(1, Math.ceil(((recent.oldest ?? now) + RATE_WINDOW_MS - now) / 1000));
      return { ok: false, error: "rate_limited", retryAfter };
    }
    sql.exec("INSERT INTO rate (ip, ts) VALUES (?, ?)", ip, now);

    const comment: Comment = {
      id: crypto.randomUUID(),
      cell,
      text: input.text,
      handle: input.handle,
      avatar: input.avatar,
      createdAt: now,
    };
    if (input.wallet) comment.wallet = input.wallet;
    if (input.accountId) comment.accountId = input.accountId;
    comment.kind = kind;
    if (kind === "topic" || kind === "job") comment.title = input.title;
    if (kind === "reply") comment.parentId = input.parentId;
    if (kind === "job") {
      comment.priceUsdc = input.priceUsdc;
      comment.jobStatus = "open";
    }

    sql.exec(
      "INSERT INTO comments (id, cell, text, handle, avatar, wallet, created_at, kind, title, parent_id, price_usdc, job_status, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      comment.id, cell, comment.text, comment.handle, comment.avatar, comment.wallet ?? null, now,
      kind, comment.title ?? null, comment.parentId ?? null, comment.priceUsdc ?? null, comment.jobStatus ?? null, comment.accountId ?? null,
    );
    // Only notes are evicted; topics, replies and jobs are kept forever.
    sql.exec(`DELETE FROM comments WHERE ${NOTE} AND id NOT IN (SELECT id FROM comments WHERE ${NOTE} ORDER BY created_at DESC, rowid DESC LIMIT ?)`, KEEP);

    this.broadcast({ type: "comment", comment });
    return { ok: true, comment };
  }

  /** RPC: mirror a job state change (made via /api/jobs/:id/:action) into the hex thread and broadcast it. */
  updateJob(id: string, status: JobStatus, workerHandle?: string, workerWallet?: string): Comment | null {
    const sql = this.ctx.storage.sql;
    sql.exec(
      "UPDATE comments SET job_status = ?, worker_handle = COALESCE(?, worker_handle), worker_wallet = COALESCE(?, worker_wallet) WHERE id = ? AND kind = 'job'",
      status, workerHandle ?? null, workerWallet ?? null, id,
    );
    const row = sql.exec<Row>("SELECT * FROM comments WHERE id = ? AND kind = 'job'", id).toArray()[0];
    if (!row) return null;
    const comment = toComment(row);
    this.broadcast({ type: "job", comment });
    return comment;
  }

  /** WebSocket upgrade (Hibernation API). */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Client -> server messages are only keep-alives; posting goes through POST /comments (gated).
    if (message === "ping") ws.send("pong");
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // already closed
    }
    this.broadcastPresence(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.broadcastPresence(ws);
  }

  private broadcastPresence(excluding?: WebSocket): void {
    const sockets = this.ctx.getWebSockets().filter((s) => s !== excluding);
    const payload = JSON.stringify({ type: "presence", count: sockets.length });
    for (const s of sockets) {
      try {
        s.send(payload);
      } catch {
        // socket going away
      }
    }
  }

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
