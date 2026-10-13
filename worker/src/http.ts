// Shared HTTP helpers (CORS, JSON responses, body parsing).
export const ALLOWED_ORIGINS = new Set(["http://localhost:4700", "http://127.0.0.1:4700"]);
export const MAX_BODY = 8 * 1024;

// ---------- helpers ----------

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin");
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Credentials"] = "true"; // session cookie from the dev origin
  }
  return h;
}

export function json(req: Request, data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(req), ...extra },
  });
}

export const err = (req: Request, error: string, status: number, extra: Record<string, unknown> = {}, headers: HeadersInit = {}) =>
  json(req, { error, ...extra }, status, headers);

export async function readJson(req: Request, max = MAX_BODY): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("Content-Length") ?? 0);
  if (len > max) return null;
  try {
    const text = await req.text();
    if (text.length > max) return null;
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
export const clean = (s: string) => s.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
export const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
export const WALLET_RE = /^[A-Za-z0-9_.-]{3,64}$/;

