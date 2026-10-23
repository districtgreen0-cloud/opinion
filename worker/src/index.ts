import { handleFeeds } from "./feeds";
import { handleSports } from "./sports";
import { earnCron, handleEarn } from "./earn";
import { handleMemories } from "./memories";
import { handleDraw, recordEntry } from "./draw";
import { getResolution, isValidCell, latLngToCell } from "h3-js";
import { HexRoom } from "./hex-room";
import { buildTree, type Leaf } from "./merkle";
import { corsHeaders, err, json, readJson, clean, str, WALLET_RE } from "./http";
import { handleZk, ZkRoom } from "./zk";
import { getAccount, handleAuth } from "./auth";
import type { Comment, JobStatus, NewComment, OpinionEvent, PostKind } from "./types";

export { HexRoom, ZkRoom };

const POINTS_PER_COMMENT = 10;

// ---------- D1 row mappers ----------

interface EventRow {
  id: string; title: string; host: string; venue: string; lat: number; lng: number;
  starts_at: number; ends_at: number; status: "live" | "upcoming"; cover: string; luma_url: string; attendees: number;
}
const toEvent = (r: EventRow): OpinionEvent => ({
  id: r.id, title: r.title, host: r.host, venue: r.venue, lat: r.lat, lng: r.lng,
  startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, cover: r.cover, lumaUrl: r.luma_url, attendees: r.attendees,
});

interface EpochRow { n: number; starts_at: number; ends_at: number; pool: number }
const epochStatus = (e: EpochRow, now: number): "upcoming" | "active" | "ended" =>
  now < e.starts_at ? "upcoming" : now < e.ends_at ? "active" : "ended";

/**
 * Reward weights. MOCK: uses lifetime users.points as the weight. A real implementation would snapshot
 * per-epoch points at epoch close so the merkle root is immutable.
 */
async function epochLeaves(env: Env, pool: number): Promise<Leaf[]> {
  const { results } = await env.DB.prepare("SELECT wallet, points FROM users WHERE points > 0 ORDER BY wallet LIMIT 5000").all<{ wallet: string; points: number }>();
  const total = results.reduce((s, r) => s + r.points, 0);
  if (total === 0) return [];
  return results
    .map((r) => ({ wallet: r.wallet, amount: Math.floor((pool * r.points) / total) }))
    .filter((l) => l.amount > 0);
}

// ---------- handlers ----------

async function validateCell(req: Request, env: Env, cell: string): Promise<Response | null> {
  const res = Number(env.H3_RES);
  if (!isValidCell(cell) || getResolution(cell) !== res) return err(req, "invalid_cell", 400);
  return null;
}

async function postComment(req: Request, env: Env, ctx: ExecutionContext, cell: string): Promise<Response> {
  const bad = await validateCell(req, env, cell);
  if (bad) return bad;

  const body = await readJson(req);
  if (!body) return err(req, "invalid_body", 400);


  const lat = body.lat, lng = body.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return err(req, "invalid_location", 400);
  }

  const handle = clean(str(body.handle) ?? "").slice(0, 32) || "anon";
  const avatar = (str(body.avatar) ?? "").slice(0, 512);
  let wallet: string | undefined;
  if (body.wallet !== undefined && body.wallet !== null && body.wallet !== "") {
    const w = str(body.wallet);
    if (!w || !WALLET_RE.test(w)) return err(req, "invalid_wallet", 400);
    wallet = w;
  }

  const kindRaw = body.kind;
  if (kindRaw !== undefined && kindRaw !== null && !["note", "topic", "reply", "job"].includes(kindRaw as string)) {
    return err(req, "invalid", 400, { field: "kind" });
  }
  const kind: PostKind = (kindRaw as PostKind | undefined | null) ?? "note";

  // notes: 1..280 · replies: 1..500 · topics/jobs: optional body up to 500 (the title carries them)
  const rawText = str(body.text);
  const text = rawText === null ? "" : clean(rawText);
  const [minLen, maxLen] = kind === "note" ? [1, 280] : kind === "reply" ? [1, 500] : [0, 500];
  if (text.length < minLen || text.length > maxLen) {
    return err(req, "invalid_text", 400, { detail: `text must be ${minLen}..${maxLen} chars for ${kind}` });
  }

  let title: string | undefined;
  if (kind === "topic" || kind === "job") {
    const t = clean(str(body.title) ?? "");
    if (t.length < 1 || t.length > 80) return err(req, "invalid", 400, { field: "title" });
    title = t;
  }
  let parentId: string | undefined;
  if (kind === "reply") {
    const p = str(body.parentId);
    if (!p || p.length > 64) return err(req, "invalid", 400, { field: "parentId" });
    parentId = p;
  }
  let priceUsdc: number | undefined;
  if (kind === "job") {
    const pr = body.priceUsdc;
    if (typeof pr !== "number" || !Number.isFinite(pr) || pr < 1 || pr > 100_000 || Math.abs(pr * 100 - Math.round(pr * 100)) > 1e-6) {
      return err(req, "invalid", 400, { field: "priceUsdc" });
    }
    priceUsdc = Math.round(pr * 100) / 100;
    if (!wallet) return err(req, "wallet_required", 400);
  }

  // SERVER-SIDE LOCATION GATE.
  // NOTE: browser geolocation is trivially spoofable (devtools sensors, mock-location apps). This check only
  // proves the *claimed* coordinates fall inside the cell. Production should add attestation: signed location
  // proofs from a native/secure client, device integrity checks, velocity/teleport checks, plus rate limits.
  const yourCell = latLngToCell(lat, lng, Number(env.H3_RES));
  if (yourCell !== cell) return err(req, "not_here", 403, { yourCell });

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const account = await getAccount(req, env); // optional: anonymous posting keeps working
  const input: NewComment = {
    text, handle, avatar, kind,
    ...(account ? { accountId: account.id } : {}),
    ...(wallet ? { wallet } : {}),
    ...(title ? { title } : {}),
    ...(parentId ? { parentId } : {}),
    ...(priceUsdc !== undefined ? { priceUsdc } : {}),
  };
  const result = await env.HEX_ROOM.getByName(cell).postComment(cell, input, ip);
  if (!result.ok && result.error === "invalid") return err(req, "invalid", 400, { field: result.field });
  if (!result.ok) {
    return err(req, "rate_limited", 429, { retryAfter: result.retryAfter }, { "Retry-After": String(result.retryAfter) });
  }

  if (kind === "job") {
    // Global job index; awaited so /api/jobs and escrow actions see the job immediately.
    const c = result.comment;
    await env.DB.prepare(
      "INSERT INTO jobs (id, cell, title, text, price_usdc, status, poster_handle, poster_avatar, poster_wallet, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)",
    ).bind(c.id, c.cell, c.title ?? "", c.text, c.priceUsdc ?? 0, c.handle, c.avatar, c.wallet ?? "", c.createdAt, c.createdAt).run();
  }
  ctx.waitUntil(recordActivity(env, result.comment, handle, avatar));
  ctx.waitUntil(recordEntry(env, account?.id, cell, result.comment.id, text)); // hex lottery entry, if a draw is open
  return json(req, { comment: result.comment }, 201);
}

/** Mirror into the global feed index, record hex visit, award points. */
async function recordActivity(env: Env, c: Comment, handle: string, avatar: string): Promise<void> {
  try {
    const stmts: D1PreparedStatement[] = c.kind === "reply" ? [] : [
      env.DB.prepare("INSERT OR IGNORE INTO comments_index (id, cell, text, handle, avatar, wallet, created_at, kind, title, price_usdc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(c.id, c.cell, c.text, c.handle, c.avatar, c.wallet ?? null, c.createdAt, c.kind ?? "note", c.title ?? null, c.priceUsdc ?? null),
      // keep the feed index bounded
      env.DB.prepare("DELETE FROM comments_index WHERE id NOT IN (SELECT id FROM comments_index ORDER BY created_at DESC LIMIT 1000)"),
    ];
    if (c.wallet) {
      stmts.push(
        env.DB.prepare("INSERT INTO users (wallet, handle, avatar, points, hexes_explored, created_at) VALUES (?, ?, ?, 0, 0, ?) ON CONFLICT(wallet) DO UPDATE SET handle = excluded.handle, avatar = excluded.avatar")
          .bind(c.wallet, handle, avatar, c.createdAt),
        env.DB.prepare("INSERT OR IGNORE INTO hex_visits (wallet, cell, first_seen) VALUES (?, ?, ?)").bind(c.wallet, c.cell, c.createdAt),
        // hexes_explored only increments when this comment's timestamp is the first_seen row (i.e. first visit)
        env.DB.prepare("UPDATE users SET points = points + ?1, hexes_explored = hexes_explored + (SELECT COUNT(*) FROM hex_visits WHERE wallet = ?2 AND cell = ?3 AND first_seen = ?4) WHERE wallet = ?2")
          .bind(POINTS_PER_COMMENT, c.wallet, c.cell, c.createdAt),
      );
    }
    await env.DB.batch(stmts);
  } catch (e) {
    console.error(JSON.stringify({ msg: "recordActivity_failed", error: String(e) }));
  }
}

async function listEvents(req: Request, env: Env, url: URL): Promise<Response> {
  const city = (url.searchParams.get("city") ?? "nyc").toLowerCase();
  const { results } = await env.DB.prepare("SELECT * FROM events WHERE city = ? ORDER BY starts_at ASC LIMIT 100").bind(city).all<EventRow>();
  return json(req, { events: results.map(toEvent) });
}

async function feed(req: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT * FROM comments_index ORDER BY created_at DESC LIMIT 30").all<{
    id: string; cell: string; text: string; handle: string; avatar: string; wallet: string | null; created_at: number;
    kind: PostKind | null; title: string | null; price_usdc: number | null;
  }>();
  const comments: Comment[] = results.filter((r) => r.kind !== "reply").map((r) => ({
    id: r.id, cell: r.cell, text: r.text, handle: r.handle, avatar: r.avatar, createdAt: r.created_at,
    kind: r.kind ?? "note",
    ...(r.wallet ? { wallet: r.wallet } : {}),
    ...(r.title ? { title: r.title } : {}),
    ...(r.price_usdc !== null ? { priceUsdc: r.price_usdc } : {}),
  }));
  return json(req, { comments });
}

async function me(req: Request, env: Env, url: URL): Promise<Response> {
  const wallet = url.searchParams.get("wallet") ?? "";
  if (!WALLET_RE.test(wallet)) return err(req, "invalid_wallet", 400);
  const now = Date.now();
  const user = await env.DB.prepare("SELECT * FROM users WHERE wallet = ?").bind(wallet).first<{
    handle: string; avatar: string; points: number; hexes_explored: number;
  }>();
  const [{ results: epochs }, { results: claims }] = await Promise.all([
    env.DB.prepare("SELECT * FROM epochs ORDER BY n DESC LIMIT 20").all<EpochRow>(),
    env.DB.prepare("SELECT epoch FROM claims WHERE wallet = ?").bind(wallet).all<{ epoch: number }>(),
  ]);
  const claimed = new Set(claims.map((c) => c.epoch));
  let claimable = 0;
  let projected = 0;
  const pending: { epoch: number; amount: number; status: string }[] = [];
  if (user && user.points > 0) {
    for (const e of epochs) {
      const status = epochStatus(e, now);
      if (status === "upcoming" || claimed.has(e.n)) continue;
      const amount = (await epochLeaves(env, e.pool)).find((l) => l.wallet === wallet)?.amount ?? 0;
      if (amount === 0) continue;
      pending.push({ epoch: e.n, amount, status });
      if (status === "ended") claimable += amount;
      else projected += amount;
    }
  }
  return json(req, {
    wallet,
    handle: user?.handle ?? null,
    avatar: user?.avatar ?? null,
    points: user?.points ?? 0,
    hexesExplored: user?.hexes_explored ?? 0,
    pendingRewards: claimable,
    projectedRewards: projected,
    pending,
  });
}

async function listEpochs(req: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const { results } = await env.DB.prepare("SELECT * FROM epochs ORDER BY n DESC LIMIT 50").all<EpochRow>();
  return json(req, {
    epochs: results.map((e) => ({ n: e.n, startsAt: e.starts_at, endsAt: e.ends_at, pool: e.pool, status: epochStatus(e, now) })),
  });
}

async function claimEpoch(req: Request, env: Env, n: number): Promise<Response> {
  const body = await readJson(req);
  const wallet = str(body?.wallet);
  if (!wallet || !WALLET_RE.test(wallet)) return err(req, "invalid_wallet", 400);
  const epoch = await env.DB.prepare("SELECT * FROM epochs WHERE n = ?").bind(n).first<EpochRow>();
  if (!epoch) return err(req, "epoch_not_found", 404);
  if (epochStatus(epoch, Date.now()) !== "ended") return err(req, "epoch_not_ended", 409);

  const leaves = await epochLeaves(env, epoch.pool);
  const leaf = leaves.find((l) => l.wallet === wallet);
  if (!leaf) return err(req, "not_eligible", 404);

  const tree = await buildTree(leaves);
  const proof = tree.proofFor(wallet) ?? [];
  // Record the claim (idempotent). Actual token transfer happens on-chain via the Solana merkle distributor
  // program, which is out of scope: the client would submit {amount, proof} to it along with the merkleRoot.
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO claims (wallet, epoch, amount, claimed_at) VALUES (?, ?, ?, ?)")
    .bind(wallet, n, leaf.amount, Date.now()).run();
  const alreadyClaimed = (ins.meta.changes ?? 0) === 0;
  return json(req, { amount: leaf.amount, proof, merkleRoot: tree.root, alreadyClaimed });
}

async function listMarket(req: Request, env: Env, url: URL): Promise<Response> {
  const eventId = url.searchParams.get("event");
  const q = eventId
    ? env.DB.prepare("SELECT * FROM listings WHERE event_id = ? ORDER BY created_at DESC LIMIT 100").bind(eventId)
    : env.DB.prepare("SELECT * FROM listings ORDER BY created_at DESC LIMIT 100");
  const { results } = await q.all<{ id: string; event_id: string; seller: string; price_usdc: number; status: string; created_at: number }>();
  return json(req, {
    listings: results.map((r) => ({ id: r.id, eventId: r.event_id, seller: r.seller, priceUsdc: r.price_usdc, status: r.status, createdAt: r.created_at })),
  });
}

async function createListing(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (!body) return err(req, "invalid_body", 400);
  const eventId = str(body.eventId);
  const seller = str(body.seller);
  const price = body.priceUsdc;
  if (!eventId) return err(req, "invalid_event", 400);
  if (!seller || !WALLET_RE.test(seller)) return err(req, "invalid_seller", 400);
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 100_000) return err(req, "invalid_price", 400);
  const ev = await env.DB.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!ev) return err(req, "event_not_found", 404);
  const listing = { id: crypto.randomUUID(), eventId, seller, priceUsdc: Math.round(price * 100) / 100, status: "open", createdAt: Date.now() };
  await env.DB.prepare("INSERT INTO listings (id, event_id, seller, price_usdc, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)")
    .bind(listing.id, listing.eventId, listing.seller, listing.priceUsdc, listing.createdAt).run();
  return json(req, { listing }, 201);
}

// ---------- jobs (P2P USDC escrow state machine) ----------

interface JobRow {
  id: string; cell: string; title: string; text: string; price_usdc: number; status: JobStatus;
  poster_handle: string; poster_avatar: string; poster_wallet: string;
  worker_handle: string | null; worker_wallet: string | null; created_at: number; updated_at: number;
}
const toJob = (r: JobRow): Comment => ({
  id: r.id, cell: r.cell, text: r.text, handle: r.poster_handle, avatar: r.poster_avatar, wallet: r.poster_wallet,
  createdAt: r.created_at, kind: "job", title: r.title, priceUsdc: r.price_usdc, jobStatus: r.status,
  ...(r.worker_handle ? { workerHandle: r.worker_handle } : {}),
  ...(r.worker_wallet ? { workerWallet: r.worker_wallet } : {}),
});

const JOB_STATUSES = ["open", "funded", "taken", "delivered", "paid", "cancelled"];

async function listJobs(req: Request, env: Env, url: URL): Promise<Response> {
  const status = url.searchParams.get("status") ?? "all";
  if (status !== "all" && !JOB_STATUSES.includes(status)) return err(req, "invalid", 400, { field: "status" });
  const cell = url.searchParams.get("cell");
  if (cell !== null && !/^[0-9a-fA-F]{15}$/.test(cell)) return err(req, "invalid_cell", 400);
  const where: string[] = [];
  const args: string[] = [];
  if (status !== "all") { where.push("status = ?"); args.push(status); }
  if (cell) { where.push("cell = ?"); args.push(cell.toLowerCase()); }
  const sql = `SELECT * FROM jobs${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 200`;
  const { results } = await env.DB.prepare(sql).bind(...args).all<JobRow>();
  return json(req, { jobs: results.map(toJob) });
}

/**
 * Escrow flow (INTENDED on-chain behaviour; the Solana escrow program is out of scope, this backend only tracks state):
 *  fund    - poster deposits `price_usdc` USDC from poster_wallet into a PDA escrow token account (seeds: job id).
 *  take    - worker wallet is recorded as the payout destination; funds stay locked in the PDA.
 *  deliver - worker marks work delivered (off-chain attestation).
 *  release - poster signs; the PDA transfers USDC to worker_wallet and the escrow account is closed.
 *  cancel  - allowed only before `taken`; if funded, the PDA refunds USDC to poster_wallet.
 */
const TRANSITIONS: Record<string, { from: JobStatus[]; to: JobStatus; actor: "poster" | "worker" | "other" }> = {
  fund: { from: ["open"], to: "funded", actor: "poster" },
  take: { from: ["funded"], to: "taken", actor: "other" },
  deliver: { from: ["taken"], to: "delivered", actor: "worker" },
  release: { from: ["delivered"], to: "paid", actor: "poster" },
  cancel: { from: ["open", "funded"], to: "cancelled", actor: "poster" },
};

async function jobAction(req: Request, env: Env, id: string, action: string): Promise<Response> {
  const t = TRANSITIONS[action];
  if (!t) return err(req, "not_found", 404);
  const body = await readJson(req);
  if (!body) return err(req, "invalid_body", 400);
  const wallet = str(body.wallet);
  if (!wallet || !WALLET_RE.test(wallet)) return err(req, "invalid_wallet", 400);
  const handle = clean(str(body.handle) ?? "").slice(0, 32) || "anon";

  const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRow>();
  if (!job) return err(req, "job_not_found", 404);

  const allowed =
    t.actor === "poster" ? wallet === job.poster_wallet : t.actor === "worker" ? wallet === job.worker_wallet : wallet !== job.poster_wallet;
  if (!allowed) return err(req, "forbidden", 403);
  if (!t.from.includes(job.status)) return err(req, "bad_state", 409, { status: job.status });

  const now = Date.now();
  const isTake = action === "take";
  // Compare-and-set on status so concurrent actions cannot both win.
  const upd = await env.DB.prepare(
    "UPDATE jobs SET status = ?1, updated_at = ?2, worker_handle = CASE WHEN ?3 THEN ?4 ELSE worker_handle END, worker_wallet = CASE WHEN ?3 THEN ?5 ELSE worker_wallet END WHERE id = ?6 AND status = ?7",
  ).bind(t.to, now, isTake ? 1 : 0, handle, wallet, id, job.status).run();
  if ((upd.meta.changes ?? 0) === 0) {
    const cur = await env.DB.prepare("SELECT status FROM jobs WHERE id = ?").bind(id).first<{ status: string }>();
    return err(req, "bad_state", 409, { status: cur?.status });
  }

  const updated = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRow>();
  const comment = updated ? toJob(updated) : { ...toJob(job), jobStatus: t.to };
  // Mirror into the hex thread (DO broadcasts {type:"job", comment} to its sockets).
  const fromRoom = await env.HEX_ROOM.getByName(job.cell).updateJob(id, t.to, isTake ? handle : undefined, isTake ? wallet : undefined);
  return json(req, { job: fromRoom ?? comment });
}

// ---------- router ----------

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const m = req.method;

  if (m === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });

  if (path.startsWith("/api/auth/")) {
    const res = await handleAuth(req, env, ctx, path, m);
    if (res) return res;
  }

  if (path.startsWith("/api/memories") || path.startsWith("/api/media/")) {
    const res = await handleMemories(req, env, url, path, m);
    if (res) return res;
  }

  if (path.startsWith("/api/earn/")) {
    const res = await handleEarn(req, env, path, m);
    if (res) return res;
  }

  if (path === "/api/draw" || path.startsWith("/api/draw/")) {
    const res = await handleDraw(req, env, ctx, path, m);
    if (res) return res;
  }

  if (path.startsWith("/api/zk/")) {
    const res = await handleZk(req, env, url, path, m);
    if (res) return res;
  }

  if (path === "/api/feeds/events" && m === "GET") return handleFeeds(req, env, ctx);
  if (path === "/api/feeds/sports" && m === "GET") return handleSports(req, env, ctx);
  if (path === "/api/health" && m === "GET") return json(req, { ok: true, service: "opinion", time: Date.now() });
  if (path === "/api/events" && m === "GET") return listEvents(req, env, url);
  if (path === "/api/feed" && m === "GET") return feed(req, env);
  if (path === "/api/me" && m === "GET") return me(req, env, url);
  if (path === "/api/epochs" && m === "GET") return listEpochs(req, env);
  if (path === "/api/market" && m === "GET") return listMarket(req, env, url);
  if (path === "/api/market" && m === "POST") return createListing(req, env);

  if (path === "/api/jobs" && m === "GET") return listJobs(req, env, url);
  const jobAct = path.match(/^\/api\/jobs\/([0-9a-fA-F-]{8,64})\/([a-z]+)$/);
  if (jobAct && m === "POST") return jobAction(req, env, jobAct[1] as string, jobAct[2] as string);

  const claim = path.match(/^\/api\/epochs\/(\d{1,6})\/claim$/);
  if (claim && m === "POST") return claimEpoch(req, env, Number(claim[1]));

  const hex = path.match(/^\/api\/hex\/([0-9a-fA-F]{15})\/(comments|ws)$/);
  if (hex) {
    const cell = (hex[1] as string).toLowerCase();
    if (hex[2] === "comments") {
      if (m === "GET") {
        const bad = await validateCell(req, env, cell);
        if (bad) return bad;
        return json(req, { comments: await env.HEX_ROOM.getByName(cell).getComments() });
      }
      if (m === "POST") return postComment(req, env, ctx, cell);
    } else if (m === "GET") {
      if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return err(req, "expected_websocket", 426);
      const bad = await validateCell(req, env, cell);
      if (bad) return bad;
      return env.HEX_ROOM.getByName(cell).fetch(req);
    }
    return err(req, "method_not_allowed", 405);
  }

  if (path.startsWith("/api/")) return err(req, "not_found", 404);
  return err(req, "not_found", 404); // non-API paths are served by Workers Static Assets
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (e) {
      console.error(JSON.stringify({ msg: "unhandled", error: String(e), url: req.url }));
      return err(req, "internal_error", 500);
    }
  },
  // hourly: publish Earn aggregates (≥ 24 h delay, K-anonymity, noise) and drop raw events past retention
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(earnCron(env).catch((e) => console.error(JSON.stringify({ msg: "earn_cron_failed", error: String(e) }))));
  },
} satisfies ExportedHandler<Env>;
