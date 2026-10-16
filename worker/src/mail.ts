/**
 * Outbound mail via Cloudflare Email Service (the `EMAIL` send_email binding; no API key).
 *
 *  EMAIL_FROM       sender for sign-in codes (also the "configured" sentinel: while it is still @example.com nothing is sent)
 *  MAIL_FROM_HELLO  sender for the welcome mail (falls back to EMAIL_FROM)
 *  MAIL_REPLY_TO    where replies to the welcome mail go
 *  APP_URL          link in the welcome mail (default https://app.useopinion.io)
 */

declare global {
  interface Env {
    MAIL_FROM_HELLO?: string;
    MAIL_REPLY_TO?: string;
    APP_URL?: string;
  }
}

const WELCOME_RETRY_MS = 24 * 3600_000; // a failed welcome is retried on the next login, but only for day-old accounts

export function parseFrom(v: string): string | EmailAddress {
  const m = v.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m && m[1] ? { email: m[2]!.trim(), name: m[1].replace(/^"|"$/g, "") } : m ? m[2]!.trim() : v.trim();
}

export const emailConfigured = (env: Env) => Boolean(env.EMAIL) && !/@example\.com\b/i.test(env.EMAIL_FROM);

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string; // "Name <addr>"; defaults to EMAIL_FROM
  replyTo?: string;
}

/** Sends one message. Returns false when mail is not configured; throws on a delivery error (callers decide). */
export async function sendMail(env: Env, msg: MailMessage): Promise<boolean> {
  if (!emailConfigured(env)) return false;
  await env.EMAIL.send({
    to: msg.to,
    from: parseFrom(msg.from ?? env.EMAIL_FROM),
    ...(msg.replyTo ? { replyTo: parseFrom(msg.replyTo) } : {}),
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
  return true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface WelcomeInput { handle?: string; name?: string | null; loginUrl: string; code?: string } // code → sign-up mail (welcome + code in one)

/** Short welcome: what OPINION is, three things to do first, one link. Dark, inline-styled, no images. */
export function welcomeEmail(i: WelcomeInput): { subject: string; text: string; html: string } {
  const who = i.name?.split(" ")[0] || i.handle || "there";
  const codeBlockText = i.code ? [`Your sign-up code: ${i.code}`, `Enter it in the app to create your account. It expires in 10 minutes; if you didn't request it, ignore this email.`, ``] : [];
  const codeBlockHtml = i.code
    ? `<tr><td style="padding:22px 32px 0"><div style="border:1px solid #2a2a36;border-radius:14px;padding:16px 20px;background:#0f0f16"><div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a8a93">Your sign-up code</div><div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#fff;margin-top:6px">${esc(i.code)}</div><div style="font-size:12px;color:#8a8a93;margin-top:6px">Enter it in the app to create your account. Expires in 10 minutes.</div></div></td></tr>`
    : "";
  const steps = [
    "Open the map and find your hex: the ~15,000 m² cell you're standing in.",
    "Drop your first note. You can only post where you stand, so every post carries proof of place.",
    "Pick your handle and avatar, then switch on Earn if you want rewards for what you share.",
  ];
  const subject = i.code ? `Welcome to OPINION · your code is ${i.code}` : `Welcome to OPINION, ${i.handle ?? ""}`.trim();
  const text = [
    `Hi ${who},`,
    ``,
    `Welcome to OPINION: the live social map where people become the world's sensor network.`,
    ``,
    ...codeBlockText,
    `Three things to do first:`,
    ...steps.map((s, k) => `${k + 1}. ${s}`),
    ``,
    `Open the map: ${i.loginUrl}`,
    ``,
    `No passwords here: you sign in with Google or a one-time email code. This is a one-off email, not a newsletter.`,
    `Reply to this email if you need anything.`,
    ``,
    `— OPINION`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#050508;padding:32px 16px;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#ededf0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#0b0b10;border:1px solid #23232c;border-radius:20px">
<tr><td style="padding:28px 32px 8px;font-size:22px;font-weight:700;letter-spacing:-0.03em">OPINI<span style="color:#14f195">ON</span></td></tr>
<tr><td style="padding:8px 32px 0;font-size:16px;line-height:1.5">Hi ${esc(who)},<br><br>Welcome to <b>OPINION</b>: the live social map where people become the world's sensor network.</td></tr>
${codeBlockHtml}
<tr><td style="padding:22px 32px 0;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a8a93">Three things to do first</td></tr>
<tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.55;color:#d6d6de"><ol style="margin:0;padding-left:20px">${steps.map((s) => `<li style="margin:6px 0">${esc(s)}</li>`).join("")}</ol></td></tr>
<tr><td style="padding:26px 32px 0"><a href="${esc(i.loginUrl)}" style="display:inline-block;padding:13px 22px;border-radius:12px;background:#14f195;color:#000;font-weight:700;text-decoration:none;font-size:15px">${i.code ? "Enter the code in the app →" : "Open the map →"}</a></td></tr>
<tr><td style="padding:24px 32px 30px;font-size:12px;line-height:1.5;color:#8a8a93">No passwords here: you sign in with Google or a one-time email code. This is a one-off email, not a newsletter.<br>Reply to this email if you need anything.</td></tr>
</table>
<div style="padding:16px;font-size:11px;color:#55555f">OPINION · ${esc(i.loginUrl.replace(/^https?:\/\//, ""))}</div>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

export interface WelcomeAccount { id: string; email: string | null; handle: string; name: string | null; created_at: number; welcomed_at: number | null }

/**
 * Welcome mail, exactly once per account. Call on every successful login (inside ctx.waitUntil); it sends only for a
 * freshly created account, or as a single retry when an earlier send failed and the account is less than a day old.
 * Never throws.
 */
export async function sendWelcome(env: Env, acct: WelcomeAccount, created: boolean): Promise<void> {
  try {
    if (!acct.email || !emailConfigured(env)) return;
    if (acct.welcomed_at) return;
    if (!created && Date.now() - acct.created_at > WELCOME_RETRY_MS) return;
    const loginUrl = env.APP_URL || "https://app.useopinion.io";
    const mail = welcomeEmail({ handle: acct.handle, name: acct.name, loginUrl });
    const sent = await sendMail(env, { to: acct.email, from: env.MAIL_FROM_HELLO ?? env.EMAIL_FROM, ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}), ...mail });
    if (!sent) return;
    await env.DB.prepare("UPDATE accounts SET welcomed_at = ? WHERE id = ? AND welcomed_at IS NULL").bind(Date.now(), acct.id).run();
  } catch (e) {
    console.error(JSON.stringify({ msg: "welcome_send_failed", id: acct.id, error: String(e) }));
  }
}
