import { err, json, readJson, str } from "./http";
import type { Account } from "./types";
import { emailConfigured, sendMail, sendWelcome } from "./mail";

// Secrets / optional vars that wrangler types cannot know about (set via `wrangler secret put` or .dev.vars).
declare global {
  interface Env {
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    OAUTH_REDIRECT_ORIGIN?: string;
  }
}

const COOKIE = "op_session";
const SESSION_TTL_S = 30 * 24 * 3600;
const STATE_TTL_MS = 10 * 60_000;
const CODE_TTL_MS = 10 * 60_000;
const CODE_MIN_GAP_MS = 60_000;
const CODE_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@.]+$/;
const HANDLE_RE = /^@[a-z0-9._]{2,20}$/;

// ---------- crypto helpers ----------

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function sha256(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}
async function sha256hex(input: string): Promise<string> {
  return [...(await sha256(input))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}

// ---------- accounts ----------

interface AccountRow {
  id: string; email: string | null; google_sub: string | null; name: string | null; picture: string | null;
  handle: string; avatar: string; email_login: number; created_at: number; welcomed_at: number | null;
}
const toAccount = (r: AccountRow): Account => ({
  id: r.id, email: r.email, name: r.name, picture: r.picture, handle: r.handle, avatar: r.avatar,
  providers: [...(r.google_sub ? (["google"] as const) : []), ...(r.email_login ? (["email"] as const) : [])],
  createdAt: r.created_at,
});

const isUnique = (e: unknown) => /UNIQUE|constraint/i.test(String(e));

function baseHandle(email: string): string {
  const local = (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 14);
  return "@" + (local.length >= 2 ? local : "user");
}

interface Identity { email: string; googleSub?: string; name?: string; picture?: string; viaCode?: boolean }

interface Upsert { row: AccountRow; created: boolean }

/** Find-or-create by google_sub, then by verified email (this is what links Google and email-code logins). `created` is true only for a brand-new row. */
async function upsertAccount(env: Env, id: Identity): Promise<Upsert | null> {
  const now = Date.now();
  const find = async (): Promise<AccountRow | null> => {
    if (id.googleSub) {
      const bySub = await env.DB.prepare("SELECT * FROM accounts WHERE google_sub = ?").bind(id.googleSub).first<AccountRow>();
      if (bySub) return bySub;
    }
    return env.DB.prepare("SELECT * FROM accounts WHERE email = ?").bind(id.email).first<AccountRow>();
  };

  let row = await find();
  if (row) {
    if (row.google_sub && id.googleSub && row.google_sub !== id.googleSub) return null; // same email, different Google user
    await env.DB.prepare(
      "UPDATE accounts SET google_sub = COALESCE(google_sub, ?1), name = COALESCE(name, ?2), picture = COALESCE(picture, ?3), email_login = MAX(email_login, ?4) WHERE id = ?5",
    ).bind(id.googleSub ?? null, id.name ?? null, id.picture ?? null, id.viaCode ? 1 : 0, row.id).run();
    return { row: (await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(row.id).first<AccountRow>()) ?? row, created: false };
  }

  const accountId = crypto.randomUUID();
  const avatar = `av:${crypto.getRandomValues(new Uint8Array(1))[0]! % 8}`;
  const base = baseHandle(id.email);
  for (let i = 0; i < 8; i++) {
    const suffix = i === 0 ? "" : String(Math.floor(Math.random() * 10 ** Math.min(i + 1, 5))).padStart(Math.min(i + 1, 5), "0");
    const handle = (base + suffix).slice(0, 21);
    try {
      await env.DB.prepare(
        "INSERT INTO accounts (id, email, google_sub, name, picture, handle, avatar, email_login, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(accountId, id.email, id.googleSub ?? null, id.name ?? null, id.picture ?? null, handle, avatar, id.viaCode ? 1 : 0, now).run();
      const fresh = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(accountId).first<AccountRow>();
      return fresh ? { row: fresh, created: true } : null;
    } catch (e) {
      if (!isUnique(e)) throw e;
      row = await find(); // lost a race on email/google_sub -> use the winner
      if (row) return { row, created: false };
      // otherwise the handle collided: retry with a longer suffix
    }
  }
  return null;
}

// ---------- sessions ----------

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("Cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

const isLocalHost = (req: Request) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(req.url).hostname);

function cookieHeader(req: Request, value: string, maxAge: number): string {
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${isLocalHost(req) ? "" : "; Secure"}`;
}

async function createSession(env: Env, accountId: string): Promise<string> {
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256hex(token), accountId, now, now + SESSION_TTL_S * 1000),
  ]);
  return token;
}

/** Resolve the signed-in account from the op_session cookie, or null. Never throws on bad input. */
export async function getAccount(req: Request, env: Env): Promise<Account | null> {
  const row = await getAccountRow(req, env);
  return row ? toAccount(row) : null;
}

async function getAccountRow(req: Request, env: Env): Promise<AccountRow | null> {
  const token = readCookie(req, COOKIE);
  if (!token || token.length > 128) return null;
  try {
    return await env.DB.prepare(
      "SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?",
    ).bind(await sha256hex(token), Date.now()).first<AccountRow>();
  } catch (e) {
    console.error(JSON.stringify({ msg: "getAccount_failed", error: String(e) }));
    return null;
  }
}

// ---------- Google OAuth (Authorization Code + PKCE) ----------

/** Only same-origin relative paths: "/", "/foo?x=1". Rejects absolute URLs, "//host", "/\host", control chars. */
function safeRedirect(v: string | null): string | null {
  const r = v ?? "/";
  if (r.length > 512 || !r.startsWith("/") || r.startsWith("//") || r.startsWith("/\\") || /[\u0000-\u001f\u007f\\]/.test(r)) return null;
  return r;
}

const redirectUri = (env: Env, url: URL) => `${env.OAUTH_REDIRECT_ORIGIN?.replace(/\/+$/, "") || url.origin}/api/auth/google/callback`;

function redirect(location: string, setCookie?: string): Response {
  const h = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (setCookie) h.append("Set-Cookie", setCookie);
  return new Response(null, { status: 302, headers: h });
}

async function googleStart(req: Request, env: Env, url: URL): Promise<Response> {
  const target = safeRedirect(url.searchParams.get("redirect"));
  if (!target) return err(req, "invalid_redirect", 400);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return err(req, "google_not_configured", 501);

  const state = randomToken(24);
  const verifier = randomToken(32);
  const challenge = b64url(await sha256(verifier));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO oauth_states (state, verifier, redirect, expires_at) VALUES (?, ?, ?, ?)").bind(state, verifier, target, now + STATE_TTL_MS),
  ]);

  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env, url),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}

async function googleCallback(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return err(req, "google_not_configured", 501);
  const state = url.searchParams.get("state");
  if (!state || state.length > 128) return err(req, "invalid_state", 400);

  // Single use: delete + read in one statement.
  const st = await env.DB.prepare("DELETE FROM oauth_states WHERE state = ? RETURNING verifier, redirect, expires_at").bind(state)
    .first<{ verifier: string; redirect: string; expires_at: number }>();
  if (!st || st.expires_at < Date.now()) return err(req, "invalid_state", 400);
  const back = safeRedirect(st.redirect) ?? "/";
  const fail = (code: string) => redirect(`${back}${back.includes("?") ? "&" : "?"}auth_error=${code}`);

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return fail("google_denied");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(env, url),
        grant_type: "authorization_code",
        code_verifier: st.verifier,
      }),
    });
    if (!tokenRes.ok) {
      console.error(JSON.stringify({ msg: "google_token_failed", status: tokenRes.status }));
      return fail("google_token");
    }
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) return fail("google_token");

    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (!infoRes.ok) return fail("google_userinfo");
    const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean | string; name?: string; picture?: string };
    const verified = info.email_verified === true || info.email_verified === "true";
    if (!info.sub || !info.email || !verified) return fail("email_not_verified");

    const acct = await upsertAccount(env, {
      email: info.email.trim().toLowerCase(), googleSub: info.sub,
      ...(info.name ? { name: info.name.slice(0, 120) } : {}),
      ...(info.picture ? { picture: info.picture.slice(0, 512) } : {}),
    });
    if (!acct) return fail("account_conflict");
    const token = await createSession(env, acct.row.id);
    ctx.waitUntil(sendWelcome(env, acct.row, acct.created)); // first sign-up → welcome mail, never blocks the login
    return redirect(back, cookieHeader(req, token, SESSION_TTL_S));
  } catch (e) {
    console.error(JSON.stringify({ msg: "google_callback_failed", error: String(e) }));
    return fail("google_error");
  }
}

// ---------- email one-time codes ----------

function normalizeEmail(v: unknown): string | null {
  const e = str(v)?.trim().toLowerCase();
  return e && e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

async function emailStart(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  if (!email) return err(req, "invalid_email", 400);

  const dev = String(env.DEV_RETURN_CODES) === "1";
  const configured = emailConfigured(env);
  if (!configured && !dev) return err(req, "email_not_configured", 501);

  // Sign up and sign in are different doors: sign-up needs a new address, sign-in an existing account.
  const intent = body?.intent === "signup" ? "signup" : body?.intent === "signin" ? "signin" : null;
  if (intent) {
    const exists = await env.DB.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(email).first();
    if (intent === "signup" && exists) return err(req, "account_exists", 409);
    if (intent === "signin" && !exists) return err(req, "no_account", 404);
  }

  const now = Date.now();
  const last = await env.DB.prepare("SELECT sent_at FROM email_codes WHERE email = ?").bind(email).first<{ sent_at: number }>();
  if (last && now - last.sent_at < CODE_MIN_GAP_MS) {
    const retryAfter = Math.ceil((last.sent_at + CODE_MIN_GAP_MS - now) / 1000);
    return err(req, "rate_limited", 429, { retryAfter }, { "Retry-After": String(retryAfter) });
  }
  await env.DB.prepare("DELETE FROM email_sends WHERE ts < ?").bind(now - 3600_000).run();
  const hour = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(ts) AS oldest FROM email_sends WHERE email = ? AND ts >= ?")
    .bind(email, now - 3600_000).first<{ n: number; oldest: number | null }>();
  if ((hour?.n ?? 0) >= CODE_PER_HOUR) {
    const retryAfter = Math.max(1, Math.ceil(((hour?.oldest ?? now) + 3600_000 - now) / 1000));
    return err(req, "rate_limited", 429, { retryAfter }, { "Retry-After": String(retryAfter) });
  }

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?1, ?2, ?3, 0, ?4) ON CONFLICT(email) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0, sent_at = ?4")
      .bind(email, await sha256hex(code + email), now + CODE_TTL_MS, now),
    env.DB.prepare("INSERT INTO email_sends (email, ts) VALUES (?, ?)").bind(email, now),
  ]);

  if (!configured) return json(req, { ok: true, devCode: code }); // DEV_RETURN_CODES=1 only

  try {
    const signup = intent === "signup";
    await sendMail(env, {
      to: email,
      subject: signup ? `${code} · confirm your email to join OPINION` : `${code} is your OPINION sign-in code`,
      text: `${signup ? "Welcome! Confirm your email with this code to create your OPINION account:" : "Your OPINION sign-in code is"} ${code}\n\nIt expires in 10 minutes. If you didn't request it, ignore this email.`,
      html: `<p>${signup ? "Welcome! Confirm your email with this code to create your OPINION account:" : "Your OPINION sign-in code is"}</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you didn't request it, ignore this email.</p>`,
    });
  } catch (e) {
    console.error(JSON.stringify({ msg: "email_send_failed", error: String(e) }));
    await env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
    return err(req, "email_send_failed", 502);
  }
  return json(req, { ok: true });
}

async function emailVerify(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  const code = str(body?.code)?.trim();
  if (!email || !code || !/^\d{6}$/.test(code)) return err(req, "invalid_code", 400);

  const now = Date.now();
  const row = await env.DB.prepare("SELECT code_hash, expires_at FROM email_codes WHERE email = ?").bind(email).first<{ code_hash: string; expires_at: number }>();
  if (!row) return err(req, "invalid_code", 400);
  if (row.expires_at < now) {
    await env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
    return err(req, "invalid_code", 400);
  }

  // Count the attempt atomically before comparing, so parallel guesses cannot exceed the cap.
  const bump = await env.DB.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND attempts < ? RETURNING attempts").bind(email, MAX_ATTEMPTS).first<{ attempts: number }>();
  if (!bump) {
    await env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
    return err(req, "too_many_attempts", 429);
  }
  if (!safeEqual(row.code_hash, await sha256hex(code + email))) {
    if (bump.attempts >= MAX_ATTEMPTS) {
      await env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
      return err(req, "too_many_attempts", 429);
    }
    return err(req, "invalid_code", 400, { attemptsLeft: MAX_ATTEMPTS - bump.attempts });
  }

  // Single use: only the request that actually deletes the row may sign in.
  const del = await env.DB.prepare("DELETE FROM email_codes WHERE email = ? AND code_hash = ?").bind(email, row.code_hash).run();
  if ((del.meta.changes ?? 0) === 0) return err(req, "invalid_code", 400);

  const acct = await upsertAccount(env, { email, viaCode: true });
  if (!acct) return err(req, "account_error", 500);
  const token = await createSession(env, acct.row.id);
  ctx.waitUntil(sendWelcome(env, acct.row, acct.created)); // first sign-up → welcome mail, never blocks the login
  return json(req, { account: toAccount(acct.row) }, 200, { "Set-Cookie": cookieHeader(req, token, SESSION_TTL_S) });
}

// ---------- me / logout ----------

async function patchMe(req: Request, env: Env): Promise<Response> {
  const row = await getAccountRow(req, env);
  if (!row) return err(req, "unauthenticated", 401);
  const body = await readJson(req);
  if (!body) return err(req, "invalid_body", 400);

  let handle = row.handle, avatar = row.avatar;
  if (body.handle !== undefined) {
    const h = str(body.handle);
    if (!h || !HANDLE_RE.test(h)) return err(req, "invalid", 400, { field: "handle" });
    handle = h;
  }
  if (body.avatar !== undefined) {
    const a = str(body.avatar);
    if (a === null || a.length > 64) return err(req, "invalid", 400, { field: "avatar" });
    avatar = a;
  }
  try {
    await env.DB.prepare("UPDATE accounts SET handle = ?, avatar = ? WHERE id = ?").bind(handle, avatar, row.id).run();
  } catch (e) {
    if (isUnique(e)) return err(req, "handle_taken", 409);
    throw e;
  }
  return json(req, { account: toAccount({ ...row, handle, avatar }) });
}

async function logout(req: Request, env: Env): Promise<Response> {
  const token = readCookie(req, COOKIE);
  if (token && token.length <= 128) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256hex(token)).run();
  return json(req, { ok: true }, 200, { "Set-Cookie": cookieHeader(req, "", 0) });
}

/** Router for /api/auth/*; returns null when the path is not an auth route. */
export async function handleAuth(req: Request, env: Env, ctx: ExecutionContext, path: string, m: string): Promise<Response | null> {
  const url = new URL(req.url);
  if (path === "/api/auth/google/start" && m === "GET") return googleStart(req, env, url);
  if (path === "/api/auth/google/callback" && m === "GET") return googleCallback(req, env, ctx, url);
  if (path === "/api/auth/email/start" && m === "POST") return emailStart(req, env);
  if (path === "/api/auth/email/verify" && m === "POST") return emailVerify(req, env, ctx);
  if (path === "/api/auth/me" && m === "GET") {
    const account = await getAccount(req, env);
    return account ? json(req, { account }) : err(req, "unauthenticated", 401);
  }
  if (path === "/api/auth/me" && m === "PATCH") return patchMe(req, env);
  if (path === "/api/auth/logout" && m === "POST") return logout(req, env);
  return null;
}
