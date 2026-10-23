/**
 * Earn mode backend: opt-in, consented data contribution.
 *
 *   Consent ledger   POST /api/earn/consent · POST /api/earn/withdraw · GET /api/earn/terms
 *   Event intake     POST /api/earn/events   (batched by the app; only tiers the user agreed to)
 *   Your data        GET  /api/earn/me · GET /api/earn/export · POST /api/earn/delete
 *   Aggregation      scheduled() hourly: per day × res-8 cell, K ≥ 50 people, Laplace noise, 24 h delay, 90-day raw retention
 *   Internal         GET  /api/earn/admin (dashboard page) · GET /api/earn/admin/summary · POST /api/earn/admin/aggregate
 *
 * Never stored here: account id, email, IP, user agent, raw GPS, anything from other sites or apps.
 * Events carry subject = HMAC-SHA256(EARN_SALT, account id) so a person's rows can be found (export / delete) only by them.
 */
import { cellToParent, getResolution, isValidCell } from "h3-js";
import { getAccount } from "./auth";
import { err, json, readJson } from "./http";

declare global {
  interface Env {
    EARN_SALT?: string // `wrangler secret put EARN_SALT` (random 32+ bytes). Required for intake.
    ADMIN_TOKEN?: string // `wrangler secret put ADMIN_TOKEN` (internal dashboard bearer token)
    EARN_TERMS_VERSION?: string
    EARN_K?: string // minimum distinct people per published cell (default 50)
  }
}

export const TIERS = ["presence", "observations", "interests"] as const
type Tier = (typeof TIERS)[number]
const KINDS: Record<Tier, readonly string[]> = {
  presence: ["dwell"],
  observations: ["busy", "post"],
  interests: ["follow"],
}
// interest categories a buyer may see (closed list: no free text leaves the device)
const INTERESTS = new Set(["event", "sport", "topic", "note", "job", "soccer", "basketball", "tennis", "music", "food", "art", "tech", "crypto", "nightlife"])
const POST_KINDS = new Set(["note", "topic", "job"])

const AGG_RES = 8
const HOUR = 3_600_000
const DAY = 86_400_000
const RETENTION_DAYS = 90
const MAX_BATCH = 200
const MAX_PER_DAY = 2000
const EPSILON = 1 // differential-privacy budget per published number

const version = (env: Env) => env.EARN_TERMS_VERSION || "2026-10-v1"

export const TERMS = {
  summary: [
    "Earn mode is optional. OPINION works fully without it, and you can pause or stop any time.",
    "You choose what to share: presence (which area you're in, by the hour), observations (your answers and posts), interests (categories you follow).",
    "We never collect your contacts, messages, browsing, cookies from other sites, or data from other apps.",
    "Locations are coarsened to ~0.7 km² areas and hourly buckets before they reach us. No raw GPS trail is stored.",
    "Buyers only ever see aggregates covering at least 50 people, with statistical noise, delayed 24 h. Never data about you.",
    "Raw contributions are deleted after 90 days. You can export or delete everything now from “My data”.",
    "A share of data revenue goes to contributors as points that convert to $ON each epoch.",
  ],
}

// ---------- helpers ----------
const enc = new TextEncoder()
async function sha256hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
async function subjectOf(env: Env, accountId: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.EARN_SALT ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(accountId))
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("")
}
type ConsentRow = { id: string; account_id: string; version: string; tiers: string; granted_at: number; withdrawn_at: number | null; receipt: string }
const activeConsent = (env: Env, accountId: string) =>
  env.DB.prepare("SELECT * FROM earn_consents WHERE account_id = ? AND withdrawn_at IS NULL ORDER BY granted_at DESC LIMIT 1").bind(accountId).first<ConsentRow>()
const tiersOf = (c: ConsentRow | null): Record<Tier, boolean> => {
  const t = c ? (JSON.parse(c.tiers) as Partial<Record<Tier, boolean>>) : {}
  return { presence: !!t.presence, observations: !!t.observations, interests: !!t.interests }
}
function coarsen(cell: unknown): string | null {
  if (typeof cell !== "string" || !isValidCell(cell)) return null
  const r = getResolution(cell)
  if (r < AGG_RES) return null // too coarse to be useful, and not what the app sends
  return r === AGG_RES ? cell : cellToParent(cell, AGG_RES)
}
const laplace = (scale: number) => {
  const u = Math.random() - 0.5
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u))
}

// ---------- consent ledger ----------
async function consent(req: Request, env: Env): Promise<Response> {
  const acc = await getAccount(req, env)
  if (!acc) return err(req, "sign_in_required", 401)
  const b = await readJson(req)
  if (!b) return err(req, "bad_json", 400)
  if (b.version !== version(env)) return err(req, "terms_changed", 409, { version: version(env) })
  const t = (b.tiers ?? {}) as Record<string, unknown>
  const tiers = { presence: t.presence === true, observations: t.observations === true, interests: t.interests === true }
  if (!tiers.presence && !tiers.observations && !tiers.interests) return err(req, "no_tiers", 400)
  const now = Date.now()
  const id = crypto.randomUUID()
  const record = { id, account: acc.id, version: version(env), tiers, granted_at: now }
  const receipt = await sha256hex(JSON.stringify(record))
  await env.DB.batch([
    env.DB.prepare("UPDATE earn_consents SET withdrawn_at = ? WHERE account_id = ? AND withdrawn_at IS NULL").bind(now, acc.id),
    env.DB.prepare("INSERT INTO earn_consents (id, account_id, version, tiers, granted_at, receipt) VALUES (?, ?, ?, ?, ?, ?)").bind(id, acc.id, version(env), JSON.stringify(tiers), now, receipt),
  ])
  return json(req, { consent: { id, version: version(env), tiers, grantedAt: now, receipt } })
}

async function withdraw(req: Request, env: Env): Promise<Response> {
  const acc = await getAccount(req, env)
  if (!acc) return err(req, "sign_in_required", 401)
  await env.DB.prepare("UPDATE earn_consents SET withdrawn_at = ? WHERE account_id = ? AND withdrawn_at IS NULL").bind(Date.now(), acc.id).run()
  return json(req, { ok: true })
}

// ---------- intake ----------
async function events(req: Request, env: Env): Promise<Response> {
  if (!env.EARN_SALT) return err(req, "earn_not_configured", 501)
  const acc = await getAccount(req, env)
  if (!acc) return err(req, "sign_in_required", 401)
  const c = await activeConsent(env, acc.id)
  if (!c) return err(req, "no_consent", 403)
  const allowed = tiersOf(c)
  const b = await readJson(req, 64 * 1024)
  const list = Array.isArray(b?.events) ? (b!.events as Record<string, unknown>[]).slice(0, MAX_BATCH) : null
  if (!list) return err(req, "bad_json", 400)
  const subject = await subjectOf(env, acc.id)
  const now = Date.now()
  const today = await env.DB.prepare("SELECT COUNT(*) AS n FROM earn_events WHERE subject = ? AND created_at > ?").bind(subject, now - DAY).first<{ n: number }>()
  const room = Math.max(0, MAX_PER_DAY - (today?.n ?? 0))
  const rows: D1PreparedStatement[] = []
  let rejected = 0
  for (const e of list) {
    if (rows.length >= room) break
    const tier = e.tier as Tier
    const kind = String(e.kind ?? "")
    const t = Number(e.t)
    if (!TIERS.includes(tier) || !allowed[tier] || !KINDS[tier].includes(kind) || !Number.isFinite(t) || t > now + 60_000 || t < now - 2 * DAY || t < c.granted_at) {
      rejected++
      continue
    }
    let cell: string | null = null
    let value: string | null = null
    if (tier === "presence" || kind === "busy" || kind === "post") {
      cell = coarsen(e.cell)
      if (!cell) {
        rejected++
        continue
      }
    }
    if (kind === "busy") {
      const v = Math.round(Number(e.value))
      if (!(v >= 1 && v <= 5)) {
        rejected++
        continue
      }
      value = String(v)
    } else if (kind === "post") {
      if (!POST_KINDS.has(String(e.value))) {
        rejected++
        continue
      }
      value = String(e.value)
    } else if (kind === "follow") {
      if (!INTERESTS.has(String(e.value))) {
        rejected++
        continue
      }
      value = String(e.value)
    }
    rows.push(
      env.DB.prepare("INSERT INTO earn_events (subject, tier, kind, cell, bucket, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(subject, tier, kind, cell, Math.floor(t / HOUR) * HOUR, value, now),
    )
  }
  if (rows.length) await env.DB.batch(rows)
  return json(req, { accepted: rows.length, rejected, capped: list.length - rows.length - rejected })
}

// ---------- your data ----------
async function mine(req: Request, env: Env, full: boolean): Promise<Response> {
  const acc = await getAccount(req, env)
  if (!acc) return err(req, "sign_in_required", 401)
  const consents = (await env.DB.prepare("SELECT id, version, tiers, granted_at, withdrawn_at, receipt FROM earn_consents WHERE account_id = ? ORDER BY granted_at DESC").bind(acc.id).all()).results
  const subject = env.EARN_SALT ? await subjectOf(env, acc.id) : null
  const counts = subject ? (await env.DB.prepare("SELECT tier, COUNT(*) AS n FROM earn_events WHERE subject = ? GROUP BY tier").bind(subject).all()).results : []
  const evs = subject
    ? (await env.DB.prepare(`SELECT tier, kind, cell, bucket, value, created_at FROM earn_events WHERE subject = ? ORDER BY id DESC ${full ? "" : "LIMIT 100"}`).bind(subject).all()).results
    : []
  const body = { terms: { version: version(env), ...TERMS }, consents, counts, events: evs, exportedAt: Date.now() }
  if (!full) return json(req, body)
  return json(req, body, 200, { "Content-Disposition": `attachment; filename="opinion-my-data-${new Date().toISOString().slice(0, 10)}.json"` })
}

async function deleteMine(req: Request, env: Env): Promise<Response> {
  const acc = await getAccount(req, env)
  if (!acc) return err(req, "sign_in_required", 401)
  const now = Date.now()
  const stmts = [env.DB.prepare("UPDATE earn_consents SET withdrawn_at = ? WHERE account_id = ? AND withdrawn_at IS NULL").bind(now, acc.id)]
  if (env.EARN_SALT) stmts.push(env.DB.prepare("DELETE FROM earn_events WHERE subject = ?").bind(await subjectOf(env, acc.id)))
  const r = await env.DB.batch(stmts)
  // published aggregates are already anonymous (K ≥ 50, noised) and are not individually removable
  return json(req, { ok: true, deletedEvents: r[1]?.meta.changes ?? 0 })
}

// ---------- aggregation (cron) ----------
export async function aggregateDay(env: Env, day: number): Promise<{ day: number; cells: number; suppressed: number }> {
  const K = Number(env.EARN_K) || 50
  const from = day
  const to = day + DAY
  // distinct people per cell (presence)
  const people = (await env.DB.prepare(
    "SELECT cell, COUNT(DISTINCT subject) AS n FROM earn_events WHERE tier = 'presence' AND bucket >= ? AND bucket < ? AND cell IS NOT NULL GROUP BY cell",
  ).bind(from, to).all<{ cell: string; n: number }>()).results
  // busy answers: one vote per person per cell (their mean), then averaged → a person can't swing it
  const busy = (await env.DB.prepare(
    "SELECT cell, COUNT(*) AS n, AVG(v) AS avg FROM (SELECT cell, subject, AVG(CAST(value AS REAL)) AS v FROM earn_events WHERE kind = 'busy' AND bucket >= ? AND bucket < ? GROUP BY cell, subject) GROUP BY cell",
  ).bind(from, to).all<{ cell: string; n: number; avg: number }>()).results
  // interests are city-wide shares (no cell), distinct people per category
  const interests = (await env.DB.prepare(
    "SELECT value AS cat, COUNT(DISTINCT subject) AS n FROM earn_events WHERE kind = 'follow' AND bucket >= ? AND bucket < ? GROUP BY value",
  ).bind(from, to).all<{ cat: string; n: number }>()).results

  const out: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM earn_aggregates WHERE day = ?").bind(day)]
  let suppressed = 0
  const put = (cell: string, metric: string, value: number, n: number) =>
    out.push(env.DB.prepare("INSERT INTO earn_aggregates (day, cell, metric, value, n) VALUES (?, ?, ?, ?, ?)").bind(day, cell, metric, value, n))
  for (const r of people) {
    const noisy = Math.round(r.n + laplace(1 / EPSILON))
    if (r.n < K || noisy < K) suppressed++
    else put(r.cell, "people", noisy, noisy)
  }
  for (const r of busy) {
    if (r.n < K) {
      suppressed++
      continue
    }
    const v = Math.min(5, Math.max(1, r.avg + laplace(4 / (r.n * EPSILON)))) // sensitivity of a mean over [1,5]
    put(r.cell, "busy_avg", Math.round(v * 100) / 100, Math.round(r.n + laplace(1 / EPSILON)))
  }
  for (const r of interests) {
    const noisy = Math.round(r.n + laplace(1 / EPSILON))
    if (r.n < K || noisy < K) suppressed++
    else put("*", `interest:${r.cat}`, noisy, noisy)
  }
  out.push(env.DB.prepare("INSERT OR REPLACE INTO earn_runs (day, ran_at, cells, suppressed) VALUES (?, ?, ?, ?)").bind(day, Date.now(), out.length - 1, suppressed))
  await env.DB.batch(out)
  return { day, cells: out.length - 2, suppressed }
}

/** Hourly: publish every finished day that is ≥ 24 h old and not yet published; drop raw events past retention. */
export async function earnCron(env: Env): Promise<void> {
  const now = Date.now()
  const lastFull = Math.floor((now - DAY) / DAY) * DAY - DAY // the day that ended at least 24 h ago
  const done = await env.DB.prepare("SELECT MAX(day) AS d FROM earn_runs").first<{ d: number | null }>()
  for (let d = Math.max((done?.d ?? lastFull - DAY) + DAY, lastFull - 6 * DAY); d <= lastFull; d += DAY) await aggregateDay(env, d)
  await env.DB.prepare("DELETE FROM earn_events WHERE created_at < ?").bind(now - RETENTION_DAYS * DAY).run()
}

// ---------- internal dashboard ----------
export function isAdmin(req: Request, env: Env) {
  const h = req.headers.get("Authorization") ?? ""
  return !!env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 24 && h === `Bearer ${env.ADMIN_TOKEN}`
}
async function summary(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return err(req, "forbidden", 403)
  const q = <T>(sql: string, ...a: unknown[]) => env.DB.prepare(sql).bind(...a).all<T>().then((r) => r.results)
  const [consents, tiers, perDay, runs, aggs] = await Promise.all([
    q("SELECT SUM(withdrawn_at IS NULL) AS active, SUM(withdrawn_at IS NOT NULL) AS withdrawn, COUNT(DISTINCT account_id) AS people FROM earn_consents"),
    q("SELECT tiers, COUNT(*) AS n FROM earn_consents WHERE withdrawn_at IS NULL GROUP BY tiers"),
    q("SELECT (created_at / 86400000) * 86400000 AS day, tier, COUNT(*) AS n, COUNT(DISTINCT subject) AS people FROM earn_events WHERE created_at > ? GROUP BY day, tier ORDER BY day DESC", Date.now() - 14 * DAY),
    q("SELECT * FROM earn_runs ORDER BY day DESC LIMIT 14"),
    q("SELECT * FROM earn_aggregates ORDER BY day DESC, n DESC LIMIT 200"),
  ])
  return json(req, { k: Number(env.EARN_K) || 50, epsilon: EPSILON, retentionDays: RETENTION_DAYS, consents: consents[0], tiers, perDay, runs, aggregates: aggs })
}

const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>OPINION · Earn internal</title><style>
:root{color-scheme:dark}body{margin:0;background:#000;color:#e8e8ee;font:13px/1.5 Inter,system-ui,sans-serif;padding:24px}
h1{font-size:18px;margin:0 0 4px}small,.m{color:#8a8a93}.m{font:11px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:16px 0}.card{border:1px solid #222;border-radius:14px;padding:12px;background:#0a0a0c}
.big{font-size:24px;font-weight:600}table{width:100%;border-collapse:collapse;margin:8px 0 20px}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #1a1a1f;font-variant-numeric:tabular-nums}
th{color:#8a8a93;font-weight:500}input,button{background:#111;border:1px solid #333;color:#fff;border-radius:10px;padding:8px 10px;font:inherit}button{cursor:pointer}
</style></head><body><h1>Earn · internal</h1><div class="m">Aggregates only · K-anonymity + Laplace noise · not for export to buyers without review</div>
<form id="f" style="margin:14px 0;display:flex;gap:8px"><input id="t" type="password" placeholder="Admin token" size="40" autocomplete="off"><button>Load</button><button type="button" id="run">Run yesterday</button></form>
<div id="out"><small>Enter the admin token. It stays in this tab only.</small></div>
<script>
const $=s=>document.querySelector(s),d=t=>new Date(t).toISOString().slice(0,10),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tbl=(rows,cols)=>'<table><tr>'+cols.map(c=>'<th>'+esc(c[0])+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+esc(c[1](r))+'</td>').join('')+'</tr>').join('')+'</table>';
async function load(){const r=await fetch('/api/earn/admin/summary',{headers:{Authorization:'Bearer '+$('#t').value}});if(!r.ok){$('#out').innerHTML='<small>'+r.status+' · check the token</small>';return}
const j=await r.json(),c=j.consents||{};$('#out').innerHTML='<div class="grid">'+[['Active consents',c.active??0],['Withdrawn',c.withdrawn??0],['People ever',c.people??0],['K threshold',j.k],['ε per number',j.epsilon],['Raw retention',j.retentionDays+' d']].map(x=>'<div class="card"><div class="m">'+x[0]+'</div><div class="big">'+esc(x[1])+'</div></div>').join('')+'</div>'
+'<div class="m">Tier mix (active)</div>'+tbl(j.tiers,[['Tiers',r=>r.tiers],['People',r=>r.n]])
+'<div class="m">Intake · last 14 days</div>'+tbl(j.perDay,[['Day',r=>d(r.day)],['Tier',r=>r.tier],['Events',r=>r.n],['People',r=>r.people]])
+'<div class="m">Aggregation runs</div>'+tbl(j.runs,[['Day',r=>d(r.day)],['Published',r=>r.cells],['Suppressed (<K)',r=>r.suppressed],['Ran',r=>new Date(r.ran_at).toISOString().replace('T',' ').slice(0,16)]])
+'<div class="m">Published aggregates (what buyers could see)</div>'+tbl(j.aggregates,[['Day',r=>d(r.day)],['Cell (res 8)',r=>r.cell],['Metric',r=>r.metric],['Value',r=>r.value],['n (noised)',r=>r.n]])}
$('#f').onsubmit=e=>{e.preventDefault();load()};
$('#run').onclick=async()=>{await fetch('/api/earn/admin/aggregate',{method:'POST',headers:{Authorization:'Bearer '+$('#t').value}});load()};
</script></body></html>`

// ---------- router ----------
export async function handleEarn(req: Request, env: Env, path: string, m: string): Promise<Response | null> {
  if (path === "/api/earn/terms" && m === "GET") return json(req, { version: version(env), ...TERMS, tiers: TIERS })
  if (path === "/api/earn/consent" && m === "POST") return consent(req, env)
  if (path === "/api/earn/withdraw" && m === "POST") return withdraw(req, env)
  if (path === "/api/earn/events" && m === "POST") return events(req, env)
  if (path === "/api/earn/me" && m === "GET") return mine(req, env, false)
  if (path === "/api/earn/export" && m === "GET") return mine(req, env, true)
  if (path === "/api/earn/delete" && m === "POST") return deleteMine(req, env)
  if (path === "/api/earn/admin" && m === "GET")
    return new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" } })
  if (path === "/api/earn/admin/summary" && m === "GET") return summary(req, env)
  if (path === "/api/earn/admin/aggregate" && m === "POST") {
    if (!isAdmin(req, env)) return err(req, "forbidden", 403)
    const url = new URL(req.url)
    // default: the latest day that ended ≥ 24 h ago (same delay as the cron)
    const day = Number(url.searchParams.get("day")) || Math.floor((Date.now() - DAY) / DAY) * DAY - DAY
    return json(req, await aggregateDay(env, day))
  }
  return null
}
