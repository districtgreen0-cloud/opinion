/**
 * 🎰 Slot machine (admin only): picks one person at random from the draw pool with crypto randomness,
 * logs every spin, lets the admin mark a pick ineligible (then spin again) or confirm the winner.
 * Pools: 'entries' = draw entrants (sign-up + OPINION + X handle) · 'opinions' = everyone who left an OPINION.
 */
import { isAdmin } from "./earn";
import { err, json, readJson, str, clean } from "./http";
import { current, mailWinner, type DrawRow } from "./draw";

interface PoolRow { id: string; handle: string; avatar: string; email: string | null; x_handle: string | null; cell: string | null; opinion: string | null; created_at: number }

async function pool(env: Env, d: DrawRow, which: string): Promise<PoolRow[]> {
  const sql = which === "opinions"
    ? `SELECT a.id, a.handle, a.avatar, a.email, a.x_handle, a.opinion_cell AS cell, a.created_at,
         (SELECT COALESCE(NULLIF(p.text, ''), p.title) FROM post_log p WHERE p.id = a.opinion_comment) AS opinion
       FROM accounts a WHERE a.opinion_at IS NOT NULL ORDER BY a.created_at`
    : `SELECT a.id, a.handle, a.avatar, a.email, e.x_handle, e.cell, e.created_at,
         (SELECT COALESCE(NULLIF(p.text, ''), p.title) FROM post_log p WHERE p.id = e.comment_id) AS opinion
       FROM draw_entries e JOIN accounts a ON a.id = e.account_id WHERE e.draw_id = ?1 ORDER BY e.created_at`;
  const r = which === "opinions" ? await env.DB.prepare(sql).all<PoolRow>() : await env.DB.prepare(sql).bind(d.id).all<PoolRow>();
  return r.results;
}
const spinsOf = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM draw_spins WHERE draw_id = ? ORDER BY at DESC").bind(id).all<{ id: number; account_id: string; handle: string; verdict: string | null; note: string | null; at: number; pool: string; pool_size: number }>().then((r) => r.results);

/** Uniform pick in [0, n) without modulo bias. */
function fairIndex(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (;;) {
    const v = crypto.getRandomValues(new Uint32Array(1))[0]!;
    if (v < limit) return v % n;
  }
}

async function state(req: Request, env: Env, url: URL): Promise<Response> {
  const d = await current(env);
  if (!d) return json(req, { draw: null, pool: [], spins: [] });
  const which = url.searchParams.get("pool") === "opinions" ? "opinions" : "entries";
  const [rows, spins] = await Promise.all([pool(env, d, which), spinsOf(env, d.id)]);
  const out = new Set(spins.filter((s) => s.verdict === "ineligible").map((s) => s.account_id));
  return json(req, {
    draw: { id: d.id, title: d.title, prize: d.prize, endsAt: d.ends_at, drawnAt: d.drawn_at, winnerAccount: d.winner_account },
    pool: rows.map((r) => ({ ...r, out: out.has(r.id) })), spins,
  });
}

async function spin(req: Request, env: Env): Promise<Response> {
  const d = await current(env);
  if (!d) return err(req, "no_draw", 404);
  if (d.drawn_at) return err(req, "already_drawn", 409);
  const b = await readJson(req);
  const which = b?.pool === "opinions" ? "opinions" : "entries";
  const spins = await spinsOf(env, d.id);
  if (spins.some((s) => s.verdict === null)) return err(req, "decide_first", 409); // one open pick at a time
  const out = new Set(spins.filter((s) => s.verdict === "ineligible").map((s) => s.account_id));
  const rows = (await pool(env, d, which)).filter((r) => !out.has(r.id));
  if (!rows.length) return err(req, "pool_empty", 409);
  const pick = rows[fairIndex(rows.length)]!;
  const r = await env.DB.prepare("INSERT INTO draw_spins (draw_id, account_id, handle, pool, pool_size, at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
    .bind(d.id, pick.id, pick.handle, which, rows.length, Date.now()).first<{ id: number }>();
  return json(req, { spinId: r?.id, pick, poolSize: rows.length });
}

async function verdict(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const d = await current(env);
  if (!d) return err(req, "no_draw", 404);
  const b = await readJson(req);
  const id = Number(b?.spinId);
  const v = b?.verdict === "winner" ? "winner" : b?.verdict === "ineligible" ? "ineligible" : null;
  if (!Number.isInteger(id) || !v) return err(req, "invalid", 400);
  const s = await env.DB.prepare("SELECT * FROM draw_spins WHERE id = ? AND draw_id = ? AND verdict IS NULL").bind(id, d.id).first<{ account_id: string }>();
  if (!s) return err(req, "not_pending", 409);
  const note = clean(str(b?.note) ?? "").slice(0, 200) || null;
  if (v === "winner") {
    const now = Date.now();
    const done = await env.DB.prepare("UPDATE draws SET winner_account = ?, drawn_at = ?, anchor = 'manual' WHERE id = ? AND drawn_at IS NULL").bind(s.account_id, now, d.id).run();
    if (!done.meta.changes) return err(req, "already_drawn", 409);
    if (b?.email === true) ctx.waitUntil(mailWinner(env, d, s.account_id, true));
  }
  await env.DB.prepare("UPDATE draw_spins SET verdict = ?, note = ? WHERE id = ?").bind(v, note, id).run();
  return json(req, { ok: true });
}

/** Undo a confirmed winner (e.g. they could not travel after all). Spins stay in the log. */
async function reopen(req: Request, env: Env): Promise<Response> {
  const d = await current(env);
  if (!d?.drawn_at || d.anchor !== "manual") return err(req, "not_manual_winner", 409);
  await env.DB.batch([
    env.DB.prepare("UPDATE draws SET winner_account = NULL, drawn_at = NULL, anchor = NULL WHERE id = ?").bind(d.id),
    env.DB.prepare("UPDATE draw_spins SET verdict = 'ineligible', note = COALESCE(note, '') || ' (winner withdrawn)' WHERE draw_id = ? AND verdict = 'winner'").bind(d.id),
  ]);
  return json(req, { ok: true });
}

export async function handleSlot(req: Request, env: Env, ctx: ExecutionContext, path: string, m: string): Promise<Response | null> {
  if (path === "/api/draw/admin/slot" && m === "GET")
    return new Response(SLOT_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'" } });
  if (!path.startsWith("/api/draw/admin/slot/")) return null;
  if (!isAdmin(req, env)) return err(req, "forbidden", 403);
  if (path === "/api/draw/admin/slot/state" && m === "GET") return state(req, env, new URL(req.url));
  if (path === "/api/draw/admin/slot/spin" && m === "POST") return spin(req, env);
  if (path === "/api/draw/admin/slot/verdict" && m === "POST") return verdict(req, env, ctx);
  if (path === "/api/draw/admin/slot/reopen" && m === "POST") return reopen(req, env);
  return null;
}

const SLOT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>OPINION · Slot machine</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;--p:#9945ff;--g:#14f195;--line:rgba(255,255,255,.12)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(90% 70% at 50% 0%,rgba(153,69,255,.18),transparent 60%),#000;color:#ececf4;font:14px/1.5 Inter,system-ui,sans-serif;padding:20px 16px 60px}
.wrap{max-width:760px;margin:0 auto}.k{font:500 11px 'JetBrains Mono',monospace;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.5)}
h1{font:700 30px/1.05 'Space Grotesk',Inter,sans-serif;letter-spacing:-.02em;margin:6px 0 2px}.sol{background:linear-gradient(90deg,var(--p),var(--g));-webkit-background-clip:text;color:transparent}
input,button,select{font:inherit;color:#fff;background:#0d0d12;border:1px solid var(--line);border-radius:12px;padding:9px 12px}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.machine{position:relative;margin:22px 0 14px;padding:18px;border-radius:30px;background:linear-gradient(180deg,#16121f,#08070b);border:1px solid rgba(153,69,255,.35);box-shadow:0 0 60px rgba(153,69,255,.18),inset 0 1px 0 rgba(255,255,255,.08)}
.lights{display:flex;justify-content:space-between;padding:0 6px 12px}.lights i{width:8px;height:8px;border-radius:50%;background:#2a2238}.lights i.on{background:var(--g);box-shadow:0 0 10px var(--g)}.lights i.on.v{background:var(--p);box-shadow:0 0 10px var(--p)}
.window{position:relative;height:270px;overflow:hidden;border-radius:18px;background:#030305;border:1px solid var(--line)}
.window::before,.window::after{content:'';position:absolute;inset-inline:0;height:90px;z-index:2;pointer-events:none}.window::before{top:0;background:linear-gradient(#030305,transparent)}.window::after{bottom:0;background:linear-gradient(transparent,#030305)}
.payline{position:absolute;inset-inline:8px;top:90px;height:90px;z-index:3;pointer-events:none;border-radius:14px;background:rgba(153,69,255,.07);box-shadow:inset 0 0 0 1.5px rgba(20,241,149,.55),0 0 26px rgba(20,241,149,.18)}
.payline::before,.payline::after{content:'';position:absolute;inset-inline:0;height:2px;background:linear-gradient(90deg,var(--p),var(--g))}.payline::before{top:0}.payline::after{bottom:0}
.reel{position:absolute;inset-inline:0;top:0;will-change:transform}
.cell{height:90px;display:flex;align-items:center;gap:14px;padding:0 22px}
.av{width:46px;height:46px;flex:none;border-radius:50%;display:grid;place-items:center;font:700 18px 'Space Grotesk';color:#000}
.who{min-width:0}.h{font:600 19px 'Space Grotesk',Inter;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.x{font:500 12px 'JetBrains Mono',monospace;color:rgba(255,255,255,.55)}
.blur .cell{filter:blur(1.2px)}
.lever{display:flex;justify-content:center;margin-top:16px}
.spin{font:700 18px 'Space Grotesk';letter-spacing:.2em;padding:14px 46px;border:0;border-radius:999px;color:#000;background:linear-gradient(90deg,var(--p),var(--g));box-shadow:0 10px 40px rgba(153,69,255,.35);transition:transform .15s}
.spin:active{transform:scale(.96)}
.card{border:1px solid var(--line);border-radius:20px;padding:16px;background:#0a0a0f;margin-top:14px}
.pick .h{font-size:24px}.op{margin-top:8px;color:rgba(255,255,255,.75);font-size:13.5px}.meta{margin-top:8px;font:12px 'JetBrains Mono',monospace;color:rgba(255,255,255,.55);word-break:break-all}
.ok{background:var(--g);color:#000;border-color:var(--g);font-weight:600}.no{border-color:#7a2a3a;color:#ff9aa8}
.tag{font:600 10px 'JetBrains Mono';letter-spacing:.14em;text-transform:uppercase;padding:2px 7px;border-radius:999px;border:1px solid var(--line);color:rgba(255,255,255,.6)}.tag.w{border-color:var(--g);color:var(--g)}.tag.n{border-color:#7a2a3a;color:#ff9aa8}
table{width:100%;border-collapse:collapse;font-size:12.5px}td,th{text-align:left;padding:7px 6px;border-bottom:1px solid #16161c}th{color:rgba(255,255,255,.45);font-weight:500}.strike td{color:rgba(255,255,255,.3);text-decoration:line-through}
.win-burst{position:fixed;inset:0;pointer-events:none;z-index:9}.win-burst b{position:absolute;width:8px;height:14px;border-radius:2px}
small{color:rgba(255,255,255,.45)}
</style></head><body><div class="wrap">
<div class="k">OPINION · internal</div><h1>🎰 <span class="sol">Slot machine</span></h1><small>Random pick from your registrants. Check the person can travel, then confirm or spin again. Every spin is logged.</small>
<form id="auth" class="row" style="margin-top:14px"><input id="t" type="password" placeholder="Admin token" size="34" autocomplete="off"><button>Load</button></form>
<div id="app" hidden>
  <div class="card" style="margin-top:14px"><b id="title"></b><div id="sub" class="meta" style="margin-top:2px"></div>
    <div class="row" style="margin-top:10px"><label class="k" for="pool" style="letter-spacing:.12em">Pool</label>
      <select id="pool"><option value="entries">Draw entrants (OPINION + X handle)</option><option value="opinions">Everyone with an OPINION</option></select><span id="count" class="k"></span></div></div>
  <div class="machine"><div class="lights" id="lights"></div><div class="window"><div class="reel" id="reel"></div><div class="payline"></div></div>
    <div class="lever"><button class="spin" id="spin">SPIN</button></div></div>
  <div id="result"></div>
  <div class="card"><div class="k" style="margin-bottom:6px">Spin log</div><table id="log"></table></div>
  <div class="card"><div class="k" style="margin-bottom:6px">Pool</div><table id="poolT"></table></div>
</div></div><div class="win-burst" id="burst"></div>
<script>
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const H=()=>({Authorization:'Bearer '+$('#t').value,'content-type':'application/json'});
const api=(p,b)=>fetch('/api/draw/admin/slot/'+p,b?{method:'POST',headers:H(),body:JSON.stringify(b)}:{headers:H()}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j});
const when=t=>t?new Date(t).toLocaleString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
const COLORS=['#9945ff','#14f195','#00c2ff','#ff8a1f','#e7c88c','#b26bff','#ff6b6b','#5de0c8'];
const color=p=>COLORS[[...String(p.avatar||p.handle)].reduce((a,c)=>a+c.charCodeAt(0),0)%COLORS.length];
const ROW=90;let S=null,pending=null,spinning=false;
const lights=$('#lights');for(let i=0;i<18;i++)lights.appendChild(document.createElement('i'));
let lt=0;setInterval(()=>{lt++;[...lights.children].forEach((l,i)=>{const on=spinning?((i+lt)%3===0):((i+Math.floor(lt/3))%6===0);l.className=on?('on'+(i%2?' v':'')):''})},spinning?70:160);
const cellHTML=p=>'<div class="cell"><div class="av" style="background:'+color(p)+'">'+esc((p.handle||'?').replace('@','')[0]?.toUpperCase())+'</div><div class="who"><div class="h">'+esc(p.handle)+'</div><div class="x">'+(p.x_handle?'@'+esc(p.x_handle):'no X handle')+'</div></div></div>';
function idle(){const live=S.pool.filter(p=>!p.out);const show=live.length?live:[{handle:'Nobody yet',x_handle:''}];
 // the payline shows the pending pick or the confirmed winner, otherwise the start of the pool
 const sp=S.spins.find(x=>x.verdict===null);const fid=S.draw&&S.draw.drawnAt?S.draw.winnerAccount:sp&&sp.account_id;const f=fid&&S.pool.find(x=>x.id===fid);
 const mid=f||show[1%show.length];const list=[show[0]===mid&&show.length>1?show[1]:show[0],mid,show[2%show.length]===mid&&show.length>1?show[(3)%show.length]:show[2%show.length]];
 $('#reel').innerHTML=list.map(cellHTML).join('');$('#reel').style.transform='translateY(0px)'}
async function load(){S=await api('state?pool='+$('#pool').value);$('#app').hidden=false;$('#auth').hidden=true;render();if(!spinning)idle()}
function render(){const d=S.draw;if(!d){$('#title').textContent='No draw found';return}
 $('#title').textContent=d.title+' · '+d.prize;
 $('#sub').textContent=d.drawnAt?'WINNER CONFIRMED '+when(d.drawnAt):'Entries close '+when(d.endsAt)+' London'+(Date.now()<d.endsAt?' · still open':'');
 const live=S.pool.filter(p=>!p.out);$('#count').textContent=live.length+' in the pool'+(S.pool.length-live.length?' · '+(S.pool.length-live.length)+' ruled out':'');
 pending=S.spins.find(s=>s.verdict===null)||null;
 $('#spin').disabled=spinning||!!d.drawnAt||!!pending||!live.length;
 $('#log').innerHTML='<tr><th>When</th><th>Pick</th><th>Pool</th><th>Result</th><th>Note</th></tr>'+S.spins.map(s=>'<tr><td>'+when(s.at)+'</td><td>'+esc(s.handle)+'</td><td>'+s.pool_size+'</td><td>'+(s.verdict==='winner'?'<span class="tag w">winner</span>':s.verdict==='ineligible'?'<span class="tag n">not eligible</span>':'<span class="tag">pending</span>')+'</td><td>'+esc(s.note)+'</td></tr>').join('');
 $('#poolT').innerHTML='<tr><th>Handle</th><th>X</th><th>Email</th><th>OPINION</th></tr>'+S.pool.map(p=>'<tr class="'+(p.out?'strike':'')+'"><td>'+esc(p.handle)+'</td><td>'+(p.x_handle?'<a style="color:#14f195" target="_blank" rel="noreferrer" href="https://x.com/'+esc(p.x_handle)+'">@'+esc(p.x_handle)+'</a>':'—')+'</td><td>'+esc(p.email)+'</td><td>'+esc(p.opinion)+'</td></tr>').join('');
 const w=d.drawnAt&&S.pool.find(p=>p.id===d.winnerAccount);
 if(d.drawnAt)$('#result').innerHTML='<div class="card pick"><span class="tag w">Winner confirmed</span><div class="h" style="margin-top:8px">'+esc(w?w.handle:'(winner)')+'</div><div class="meta">'+(w?esc(w.email)+' · @'+esc(w.x_handle||'—'):'')+'</div><div class="row" style="margin-top:12px"><button class="no" id="reopen">Withdraw winner and spin again</button></div></div>';
 else if(pending){const p=S.pool.find(x=>x.id===pending.account_id)||{handle:pending.handle};showPick(p)}
 else $('#result').innerHTML='';
 const ro=$('#reopen');if(ro)ro.onclick=async()=>{if(!confirm('Withdraw this winner? They are marked not eligible and you can spin again.'))return;await api('reopen',{});await load()}}
function showPick(p){$('#result').innerHTML='<div class="card pick"><span class="tag">Picked · check before confirming</span><div class="h" style="margin-top:8px">'+esc(p.handle)+'</div><div class="meta">'+esc(p.email)+' · '+(p.x_handle?'<a style="color:#14f195" target="_blank" rel="noreferrer" href="https://x.com/'+esc(p.x_handle)+'">@'+esc(p.x_handle)+' ↗</a>':'no X handle')+' · hex '+esc(p.cell||'—')+'</div>'+(p.opinion?'<div class="op">“'+esc(p.opinion)+'”</div>':'')
 +'<div class="row" style="margin-top:14px"><input id="note" placeholder="Note (optional): why / how you checked" style="flex:1;min-width:200px"></div>'
 +'<div class="row" style="margin-top:8px"><button class="ok" id="yes">✓ Eligible · confirm winner</button><label class="row" style="gap:6px"><input type="checkbox" id="mail" checked style="width:auto"> email them</label><button class="no" id="no">✕ Not eligible · spin again</button></div></div>';
 $('#yes').onclick=async()=>{if(!confirm('Confirm '+p.handle+' as the winner?'))return;await api('verdict',{spinId:pending.id,verdict:'winner',note:$('#note').value,email:$('#mail').checked});burst();await load()};
 $('#no').onclick=async()=>{await api('verdict',{spinId:pending.id,verdict:'ineligible',note:$('#note').value});await load()}}
function ease(t){return 1-Math.pow(1-t,4)}
async function doSpin(){if(spinning)return;spinning=true;render();$('#result').innerHTML='';
 let r;try{r=await api('spin',{pool:$('#pool').value})}catch(e){spinning=false;alert(e.message);return load()}
 const live=S.pool.filter(p=>!p.out);const reel=$('#reel');const N=Math.max(42,live.length*4);const list=[];
 for(let i=0;i<N;i++)list.push(live[(i*7+3)%live.length]);
 const target=N-2;list[target]=r.pick;list.push(live[0]||r.pick);
 reel.innerHTML=list.map(cellHTML).join('');const end=-(target-1)*ROW;const dur=5200;const t0=performance.now();reel.parentElement.classList.add('blur');
 await new Promise(res=>{const step=now=>{const t=Math.min(1,(now-t0)/dur);const k=ease(t);const over=t>.92?Math.sin((t-.92)/.08*Math.PI)*6:0;reel.style.transform='translateY('+(end*k+over)+'px)';if(t>.7)reel.parentElement.classList.remove('blur');t<1?requestAnimationFrame(step):res()};requestAnimationFrame(step)});
 reel.style.transform='translateY('+end+'px)';spinning=false;await load();showPick(r.pick)}
function burst(){const b=$('#burst');for(let i=0;i<90;i++){const e=document.createElement('b');e.style.left=Math.random()*100+'vw';e.style.top='-20px';e.style.background=['#9945ff','#14f195','#fff'][i%3];b.appendChild(e);const x=(Math.random()-.5)*200,rot=Math.random()*720;e.animate([{transform:'translate(0,0) rotate(0)'},{transform:'translate('+x+'px,'+(innerHeight+40)+'px) rotate('+rot+'deg)'}],{duration:1800+Math.random()*1400,easing:'cubic-bezier(.2,.6,.4,1)'}).onfinish=()=>e.remove()}}
$('#auth').onsubmit=e=>{e.preventDefault();load().catch(()=>alert('Check the token'))};
$('#pool').onchange=()=>load();$('#spin').onclick=doSpin;
</script></body></html>`;
