/**
 * Hex lottery: sign up → follow @x_account on X (self-declared handle) → post an opinion in a hex → one entry per account.
 * The draw is verifiable by anyone:
 *   1. commit:  commit_hash = sha256(seed) is published before entries close
 *   2. freeze:  entries are listed in a fixed order; leaf_i = sha256(draw|account|cell|comment); entries_root = merkle(leaves)
 *   3. anchor:  a Solana mainnet block hash fetched at reveal time (nobody can pick it)
 *   4. winner:  index = sha256(seed ‖ entries_root ‖ anchor) mod n  →  leaf[index]
 * GET /api/draw/:id/proof returns everything needed to recompute it (see README).
 */
import { getAccount } from "./auth";
import { isAdmin } from "./earn";
import { err, json, readJson, str, clean } from "./http";
import { merkleRoot, sha256Hex } from "./merkle";
import { sendMail } from "./mail";

export const X_RE = /^[a-z0-9_]{1,15}$/;
const MIN_OPINION = 12; // characters: "nice" is not an opinion

export interface DrawRow {
  id: string; title: string; prize: string; x_account: string; starts_at: number; ends_at: number;
  commit_hash: string | null; committed_at: number | null; seed: string | null; anchor: string | null;
  entries_root: string | null; entries_count: number; winner_index: number | null; winner_account: string | null;
  winner_leaf: string | null; drawn_at: number | null; created_at: number;
}
interface EntryRow { draw_id: string; account_id: string; x_handle: string; cell: string; comment_id: string; created_at: number }

export const leafOf = (e: EntryRow) => sha256Hex(`${e.draw_id}|${e.account_id}|${e.cell}|${e.comment_id}`);
const normX = (v: unknown) => (str(v) ?? "").trim().replace(/^@/, "").toLowerCase();

/** The draw people can enter now, else the most recent one (so the winner stays visible). */
async function current(env: Env): Promise<DrawRow | null> {
  const now = Date.now();
  return (
    (await env.DB.prepare("SELECT * FROM draws WHERE drawn_at IS NULL AND ends_at > ? ORDER BY starts_at LIMIT 1").bind(now).first<DrawRow>()) ??
    (await env.DB.prepare("SELECT * FROM draws ORDER BY created_at DESC LIMIT 1").first<DrawRow>())
  );
}
const entriesOf = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM draw_entries WHERE draw_id = ? ORDER BY created_at, account_id").bind(id).all<EntryRow>().then((r) => r.results);

/**
 * Called after every successful comment post. Records the poster's entry when a draw is open and they qualify.
 * Never throws (runs inside waitUntil).
 */
export async function recordEntry(env: Env, accountId: string | undefined, cell: string, commentId: string, text: string): Promise<void> {
  try {
    if (!accountId || clean(text).length < MIN_OPINION) return;
    const now = Date.now();
    const d = await env.DB.prepare("SELECT id FROM draws WHERE drawn_at IS NULL AND starts_at <= ? AND ends_at > ? ORDER BY starts_at LIMIT 1").bind(now, now).first<{ id: string }>();
    if (!d) return;
    const acc = await env.DB.prepare("SELECT x_handle FROM accounts WHERE id = ?").bind(accountId).first<{ x_handle: string | null }>();
    if (!acc?.x_handle) return;
    const r = await env.DB.prepare("INSERT OR IGNORE INTO draw_entries (draw_id, account_id, x_handle, cell, comment_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(d.id, accountId, acc.x_handle, cell, commentId, now).run();
    if (r.meta.changes) await env.DB.prepare("UPDATE draws SET entries_count = entries_count + 1 WHERE id = ?").bind(d.id).run();
  } catch (e) {
    console.error(JSON.stringify({ msg: "draw_entry_failed", error: String(e) }));
  }
}

function publicView(d: DrawRow, now = Date.now()) {
  const drawn = !!d.drawn_at;
  return {
    id: d.id, title: d.title, prize: d.prize, xAccount: d.x_account, startsAt: d.starts_at, endsAt: d.ends_at,
    status: drawn ? "drawn" : now < d.starts_at ? "upcoming" : now < d.ends_at ? "open" : "closed",
    commitHash: d.commit_hash, committedAt: d.committed_at, entriesCount: d.entries_count,
    ...(drawn ? { seed: d.seed, anchor: d.anchor, entriesRoot: d.entries_root, winnerIndex: d.winner_index, winnerLeaf: d.winner_leaf, drawnAt: d.drawn_at } : {}),
  };
}

async function getDraw(req: Request, env: Env): Promise<Response> {
  const d = await current(env);
  if (!d) return json(req, { draw: null });
  const acc = await getAccount(req, env);
  let me: Record<string, unknown> | null = null;
  let winner: Record<string, unknown> | null = null;
  if (acc) {
    const row = await env.DB.prepare("SELECT x_handle FROM accounts WHERE id = ?").bind(acc.id).first<{ x_handle: string | null }>();
    const e = await env.DB.prepare("SELECT cell, created_at FROM draw_entries WHERE draw_id = ? AND account_id = ?").bind(d.id, acc.id).first<{ cell: string; created_at: number }>();
    me = { xHandle: row?.x_handle ?? null, entered: !!e, cell: e?.cell ?? null, enteredAt: e?.created_at ?? null, won: !!d.winner_account && d.winner_account === acc.id };
  }
  if (d.drawn_at && d.winner_account) {
    const w = await env.DB.prepare("SELECT a.handle, a.avatar, e.x_handle, e.cell FROM draw_entries e JOIN accounts a ON a.id = e.account_id WHERE e.draw_id = ? AND e.account_id = ?")
      .bind(d.id, d.winner_account).first<{ handle: string; avatar: string; x_handle: string; cell: string }>();
    if (w) winner = { handle: w.handle, avatar: w.avatar, xHandle: w.x_handle, cell: w.cell };
  }
  return json(req, { draw: { ...publicView(d), winner }, me });
}

async function setX(req: Request, env: Env): Promise<Response> {
  const acc = await getAccount(req, env);
  if (!acc) return err(req, "sign_in_required", 401);
  const body = await readJson(req);
  const x = normX(body?.xHandle);
  if (!X_RE.test(x)) return err(req, "invalid_x_handle", 400);
  try {
    await env.DB.prepare("UPDATE accounts SET x_handle = ? WHERE id = ?").bind(x, acc.id).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return err(req, "x_taken", 409);
    throw e;
  }
  return json(req, { ok: true, xHandle: x });
}

/** Public, privacy-safe: the frozen leaf list in draw order (hashes only). */
async function entries(req: Request, env: Env, id: string): Promise<Response> {
  const d = await env.DB.prepare("SELECT * FROM draws WHERE id = ?").bind(id).first<DrawRow>();
  if (!d) return err(req, "not_found", 404);
  const rows = await entriesOf(env, id);
  const leaves = await Promise.all(rows.map(leafOf));
  return json(req, { id, frozen: !!d.drawn_at, count: leaves.length, leaves });
}

async function proof(req: Request, env: Env, id: string): Promise<Response> {
  const d = await env.DB.prepare("SELECT * FROM draws WHERE id = ?").bind(id).first<DrawRow>();
  if (!d) return err(req, "not_found", 404);
  if (!d.drawn_at) return err(req, "not_drawn_yet", 409, { commitHash: d.commit_hash });
  return json(req, {
    id: d.id, title: d.title, commitHash: d.commit_hash, committedAt: d.committed_at, seed: d.seed, anchor: d.anchor, entriesRoot: d.entries_root,
    entriesCount: d.entries_count, winnerIndex: d.winner_index, winnerLeaf: d.winner_leaf, drawnAt: d.drawn_at,
    verify: [
      "1. sha256(hex(seed)) == commitHash  (the seed was fixed before entries closed; the hash was published on X)",
      `2. GET /api/draw/${d.id}/entries → leaves in draw order; merkle root (sorted-pair sha256, odd leaf carried up) == entriesRoot`,
      "3. winnerIndex == BigInt('0x' + sha256(seed + entriesRoot + anchor)) % entriesCount   (strings concatenated as hex/ASCII, utf-8)",
      "4. leaves[winnerIndex] == winnerLeaf",
      "anchor = Solana mainnet block hash at reveal time (recorded; check it exists on any explorer)",
    ],
  });
}

// ── admin
async function create(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return err(req, "forbidden", 403);
  const b = await readJson(req);
  const title = clean(str(b?.title) ?? "").slice(0, 80);
  const prize = clean(str(b?.prize) ?? "").slice(0, 120);
  const x = normX(b?.xAccount);
  const startsAt = Number(b?.startsAt) || Date.now();
  const endsAt = Number(b?.endsAt);
  if (!title || !prize || !X_RE.test(x) || !Number.isFinite(endsAt) || endsAt <= startsAt) return err(req, "invalid", 400);
  const open = await env.DB.prepare("SELECT id FROM draws WHERE drawn_at IS NULL AND ends_at > ?").bind(Date.now()).first();
  if (open) return err(req, "draw_already_open", 409);
  const id = crypto.randomUUID().slice(0, 8);
  await env.DB.prepare("INSERT INTO draws (id, title, prize, x_account, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, title, prize, x, startsAt, endsAt, Date.now()).run();
  return json(req, { ok: true, id });
}

async function commit(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return err(req, "forbidden", 403);
  const d = await current(env);
  if (!d || d.drawn_at) return err(req, "no_open_draw", 404);
  if (d.commit_hash) return err(req, "already_committed", 409, { commitHash: d.commit_hash });
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const seed = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const commitHash = await sha256Hex(seed);
  await env.DB.prepare("UPDATE draws SET seed = ?, commit_hash = ?, committed_at = ? WHERE id = ? AND commit_hash IS NULL").bind(seed, commitHash, Date.now(), d.id).run();
  return json(req, { ok: true, id: d.id, commitHash, post: `OPINION draw "${d.title}" · commitment sha256: ${commitHash}` });
}

/** Public randomness nobody involved can choose: the latest finalized Solana mainnet block hash (two public RPCs). */
const RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
async function solanaAnchor(): Promise<string | null> {
  for (const rpc of RPCS) {
    try {
      const r = await fetch(rpc, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [{ commitment: "finalized" }] }),
      });
      const j = (await r.json()) as { result?: { value?: { blockhash?: string } } };
      if (j.result?.value?.blockhash) return j.result.value.blockhash;
    } catch (e) {
      console.error(JSON.stringify({ msg: "anchor_rpc_failed", rpc, error: String(e) }));
    }
  }
  return null;
}

async function reveal(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!isAdmin(req, env)) return err(req, "forbidden", 403);
  const d = await env.DB.prepare("SELECT * FROM draws WHERE drawn_at IS NULL ORDER BY starts_at DESC LIMIT 1").first<DrawRow>(); // the newest undrawn one
  if (!d) return err(req, "no_open_draw", 404);
  if (!d.seed || !d.commit_hash) return err(req, "not_committed", 409);
  const now = Date.now();
  if (now < d.ends_at) return err(req, "still_open", 409, { endsAt: d.ends_at });
  const rows = await entriesOf(env, d.id);
  if (!rows.length) return err(req, "no_entries", 409);
  const body = await readJson(req).catch(() => null);
  const anchor = (str(body?.anchor) ?? "").trim() || (await solanaAnchor());
  if (!anchor) return err(req, "anchor_unavailable", 503);
  const leaves = await Promise.all(rows.map(leafOf));
  const root = await merkleRoot(leaves);
  const idx = Number(BigInt("0x" + (await sha256Hex(d.seed + root + anchor))) % BigInt(leaves.length));
  const winner = rows[idx]!;
  const r = await env.DB.prepare(
    "UPDATE draws SET anchor = ?, entries_root = ?, entries_count = ?, winner_index = ?, winner_account = ?, winner_leaf = ?, drawn_at = ? WHERE id = ? AND drawn_at IS NULL",
  ).bind(anchor, root, leaves.length, idx, winner.account_id, leaves[idx], now, d.id).run();
  if (!r.meta.changes) return err(req, "already_drawn", 409);
  ctx.waitUntil(mailWinner(env, d, winner.account_id));
  return json(req, { ok: true, id: d.id, anchor, entriesRoot: root, entriesCount: leaves.length, winnerIndex: idx, winnerLeaf: leaves[idx], winnerXHandle: winner.x_handle, winnerCell: winner.cell });
}

async function mailWinner(env: Env, d: DrawRow, accountId: string): Promise<void> {
  try {
    const a = await env.DB.prepare("SELECT email, handle, x_handle FROM accounts WHERE id = ?").bind(accountId).first<{ email: string | null; handle: string; x_handle: string | null }>();
    if (!a?.email) return;
    const app = env.APP_URL || "https://app.useopinion.io";
    const text = `Hi ${a.handle},\n\nYou won the OPINION draw "${d.title}": ${d.prize}.\n\nYour entry was picked by a public, verifiable draw (${app}/api/draw/${d.id}/proof).\n\nReply to this email from the X account @${a.x_handle ?? ""} (or DM @${d.x_account} on X from it) so we can confirm it's you and arrange delivery.\n\n— OPINION`;
    await sendMail(env, {
      to: a.email, from: env.MAIL_FROM_HELLO ?? env.EMAIL_FROM, ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
      subject: `You won the OPINION draw: ${d.prize}`, text,
      html: `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
    });
  } catch (e) {
    console.error(JSON.stringify({ msg: "draw_mail_failed", error: String(e) }));
  }
}

/** Cancel an undrawn draw (aborted campaign, or one that closed with no entries). Drawn draws are immutable. */
async function cancel(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return err(req, "forbidden", 403);
  const d = await env.DB.prepare("SELECT id FROM draws WHERE drawn_at IS NULL ORDER BY starts_at DESC LIMIT 1").first<{ id: string }>();
  if (!d) return err(req, "no_open_draw", 404);
  await env.DB.batch([env.DB.prepare("DELETE FROM draw_entries WHERE draw_id = ?").bind(d.id), env.DB.prepare("DELETE FROM draws WHERE id = ?").bind(d.id)]);
  return json(req, { ok: true, cancelled: d.id });
}

async function entriesCsv(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return err(req, "forbidden", 403);
  const d = await current(env);
  if (!d) return err(req, "not_found", 404);
  const rows = await env.DB.prepare("SELECT e.created_at, a.handle, e.x_handle, a.email, e.cell, e.comment_id, (e.account_id = d.winner_account) AS won FROM draw_entries e JOIN accounts a ON a.id = e.account_id JOIN draws d ON d.id = e.draw_id WHERE e.draw_id = ? ORDER BY e.created_at, e.account_id")
    .bind(d.id).all<{ created_at: number; handle: string; x_handle: string; email: string | null; cell: string; comment_id: string; won: number }>();
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["i,time,handle,x_handle,email,cell,comment_id,won", ...rows.results.map((r, i) => [i, new Date(r.created_at).toISOString(), r.handle, "@" + r.x_handle, r.email, r.cell, r.comment_id, r.won ? "WINNER" : ""].map(q).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="draw-${d.id}-entries.csv"`, "Cache-Control": "no-store" } });
}

async function adminState(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return err(req, "forbidden", 403);
  const d = await current(env);
  if (!d) return json(req, { draw: null, entries: [] });
  const rows = await env.DB.prepare("SELECT e.created_at, a.handle, e.x_handle, e.cell FROM draw_entries e JOIN accounts a ON a.id = e.account_id WHERE e.draw_id = ? ORDER BY e.created_at, e.account_id").bind(d.id).all();
  return json(req, { draw: { ...publicView(d), seed: d.seed, winnerAccount: d.winner_account }, entries: rows.results });
}

const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>OPINION · Draw internal</title><style>
:root{color-scheme:dark}body{margin:0;background:#000;color:#e8e8ee;font:13px/1.5 Inter,system-ui,sans-serif;padding:24px;max-width:960px}
h1{font-size:18px;margin:0 0 4px}small,.m{color:#8a8a93}.m{font:11px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;margin-top:18px}
.card{border:1px solid #222;border-radius:14px;padding:14px;background:#0a0a0c;margin:12px 0}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
input,button{background:#111;border:1px solid #333;color:#fff;border-radius:10px;padding:8px 10px;font:inherit}button{cursor:pointer}button.go{background:#14f195;color:#000;border-color:#14f195;font-weight:600}
table{width:100%;border-collapse:collapse;margin:8px 0}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #1a1a1f;font-variant-numeric:tabular-nums}th{color:#8a8a93;font-weight:500}
pre{white-space:pre-wrap;word-break:break-all;background:#0f0f16;border:1px solid #2a2a36;border-radius:10px;padding:10px;font-size:12px}.win{color:#14f195;font-weight:600}
</style></head><body><h1>Draw · internal</h1><div class="m">commit → entries → reveal · every step is public and recomputable</div>
<form id="f" class="row" style="margin:14px 0"><input id="t" type="password" placeholder="Admin token" size="40" autocomplete="off"><button>Load</button></form>
<div id="out"><small>Enter the admin token. It stays in this tab only.</small></div>
<script>
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const H=()=>({Authorization:'Bearer '+$('#t').value,'content-type':'application/json'});
const when=t=>t?new Date(t).toISOString().replace('T',' ').slice(0,16)+' UTC':'—';
async function call(p,body){const r=await fetch(p,{method:'POST',headers:H(),body:JSON.stringify(body||{})});const j=await r.json().catch(()=>({}));if(!r.ok)alert(r.status+' '+(j.error||''));return j}
async function load(){const r=await fetch('/api/draw/admin/state',{headers:H()});if(!r.ok){$('#out').innerHTML='<small>'+r.status+' · check the token</small>';return}
const {draw:d,entries:e}=await r.json();let h='';
if(!d||d.status==='drawn'){h+='<div class="card"><div class="m">New draw</div><div class="row" style="margin-top:8px"><input id="ti" placeholder="Title" size="24"><input id="pr" placeholder="Prize (e.g. 1 crypto card)" size="26"><input id="xa" placeholder="X account to follow (no @)" size="22"><input id="days" type="number" value="7" min="0.01" step="0.5" style="width:70px"> days<button class="go" id="mk">Create</button></div></div>'}
if(d){h+='<div class="card"><b>'+esc(d.title)+'</b> · '+esc(d.prize)+' · follow @'+esc(d.xAccount)+'<br><small>'+d.status.toUpperCase()+' · '+when(d.startsAt)+' → '+when(d.endsAt)+' · entries: <b>'+d.entriesCount+'</b> · id '+d.id+'</small>'
+'<div class="row" style="margin-top:10px">'+(d.commitHash?'':'<button class="go" id="cm">1 · Commit (lock the seed)</button>')+(d.commitHash&&d.status!=='drawn'?'<input id="an" placeholder="Anchor (optional: Solana block hash; auto if empty)" size="34"><button class="go" id="rv">2 · Reveal + pick winner'+(d.status==='open'?' (after '+when(d.endsAt)+')':'')+'</button>':'')+'<a href="/api/draw/admin/entries.csv?token=x" id="csv"><button type="button">Entries CSV</button></a>'+(d.status!=='drawn'?'<button type="button" id="cx" style="border-color:#633;color:#f88">Cancel draw</button>':'')+'</div>'
+(d.commitHash?'<div class="m">Post this on X before the draw closes</div><pre>OPINION draw “'+esc(d.title)+'” · commitment sha256: '+d.commitHash+'\\nEntries close '+when(d.endsAt)+' · winner = sha256(seed ‖ entries root ‖ Solana block hash) mod n · proof: https://app.useopinion.io/api/draw/'+d.id+'/proof</pre>':'')
+(d.status==='drawn'?'<div class="m">Result</div><pre>winner index '+d.winnerIndex+' of '+d.entriesCount+'\\nseed '+d.seed+'\\nanchor '+d.anchor+'\\nroot '+d.entriesRoot+'\\nleaf '+d.winnerLeaf+'\\nproof https://app.useopinion.io/api/draw/'+d.id+'/proof</pre>':'')+'</div>'
+'<div class="m">Entries ('+e.length+')</div><table><tr><th>#</th><th>When</th><th>Handle</th><th>X</th><th>Hex</th></tr>'+e.map((r,i)=>'<tr'+(d.winnerIndex===i?' class="win"':'')+'><td>'+i+'</td><td>'+when(r.created_at)+'</td><td>'+esc(r.handle)+'</td><td>@'+esc(r.x_handle)+'</td><td>'+esc(r.cell)+'</td></tr>').join('')+'</table>'}
$('#out').innerHTML=h;
const mk=$('#mk');if(mk)mk.onclick=async()=>{const days=+$('#days').value||7;await call('/api/draw/admin/create',{title:$('#ti').value,prize:$('#pr').value,xAccount:$('#xa').value,startsAt:Date.now(),endsAt:Date.now()+days*86400000});load()};
const cm=$('#cm');if(cm)cm.onclick=async()=>{await call('/api/draw/admin/commit');load()};
const rv=$('#rv');if(rv)rv.onclick=async()=>{if(!confirm('Reveal the seed and pick the winner? This cannot be undone.'))return;const j=await call('/api/draw/admin/reveal',{anchor:$('#an').value.trim()});if(j.ok)alert('Winner: @'+j.winnerXHandle+' · hex '+j.winnerCell);load()};
const cx=$('#cx');if(cx)cx.onclick=async()=>{if(!confirm('Cancel this draw and delete its entries?'))return;await call('/api/draw/admin/cancel');load()};
const csv=$('#csv');if(csv)csv.onclick=async ev=>{ev.preventDefault();const r=await fetch('/api/draw/admin/entries.csv',{headers:H()});const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='draw-entries.csv';a.click()};}
$('#f').onsubmit=e=>{e.preventDefault();load()};
</script></body></html>`;

export async function handleDraw(req: Request, env: Env, ctx: ExecutionContext, path: string, m: string): Promise<Response | null> {
  if (path === "/api/draw" && m === "GET") return getDraw(req, env);
  if (path === "/api/draw/x" && m === "POST") return setX(req, env);
  if (path === "/api/draw/admin" && m === "GET")
    return new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" } });
  if (path === "/api/draw/admin/state" && m === "GET") return adminState(req, env);
  if (path === "/api/draw/admin/create" && m === "POST") return create(req, env);
  if (path === "/api/draw/admin/commit" && m === "POST") return commit(req, env);
  if (path === "/api/draw/admin/reveal" && m === "POST") return reveal(req, env, ctx);
  if (path === "/api/draw/admin/cancel" && m === "POST") return cancel(req, env);
  if (path === "/api/draw/admin/entries.csv" && m === "GET") return entriesCsv(req, env);
  const pub = path.match(/^\/api\/draw\/([a-z0-9-]{4,16})\/(entries|proof)$/);
  if (pub && m === "GET") return pub[2] === "entries" ? entries(req, env, pub[1]!) : proof(req, env, pub[1]!);
  return null;
}
