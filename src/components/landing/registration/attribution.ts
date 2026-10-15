import type { KV } from "./storage";

export const AGENT_REF_KEY = "pz_agent_ref";
export const UTM_KEY = "pz_utm";
export const FBC_KEY = "pz_fbc";
const DAY = 86_400_000;
const AGENT_REF_MS = 30 * DAY;
const FBC_MS = 90 * DAY;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const REF_RE = /^[a-z0-9][a-z0-9-]{1,39}$/i;
const FBCLID_RE = /^[\w-]{10,500}$/;

function readStamped(kv: KV | null, key: string, now: number): string {
  if (!kv) return "";
  const raw = kv.getItem(key);
  if (!raw) return "";
  try {
    const v = JSON.parse(raw) as { value?: unknown; code?: unknown; exp?: unknown };
    const value = typeof v.code === "string" ? v.code : typeof v.value === "string" ? v.value : "";
    if (typeof v.exp !== "number" || v.exp <= now || !value) { kv.removeItem(key); return ""; }
    return value;
  } catch {
    kv.removeItem(key);
    return "";
  }
}

/** Run once per page view. A new valid ?ref= replaces the stored one (last agent link wins). */
export function captureAttribution(search: string, now: number, local: KV | null, session: KV | null): void {
  const q = new URLSearchParams(search);
  const ref = (q.get("ref") ?? "").trim();
  if (local && REF_RE.test(ref)) local.setItem(AGENT_REF_KEY, JSON.stringify({ code: ref.toLowerCase(), exp: now + AGENT_REF_MS }));
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = (q.get(k) ?? "").trim().slice(0, 150);
    if (v) utm[k] = v;
  }
  if (session && Object.keys(utm).length > 0) session.setItem(UTM_KEY, JSON.stringify(utm));
  const fbclid = (q.get("fbclid") ?? "").trim();
  if (local && FBCLID_RE.test(fbclid)) local.setItem(FBC_KEY, JSON.stringify({ value: `fb.1.${now}.${fbclid}`, exp: now + FBC_MS }));
}

export function readAgentRef(now: number, local: KV | null): string {
  return readStamped(local, AGENT_REF_KEY, now);
}

export function readUtm(session: KV | null): Record<string, string> {
  if (!session) return {};
  try {
    const v = JSON.parse(session.getItem(UTM_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(v).filter(([k, x]) => (UTM_KEYS as readonly string[]).includes(k) && typeof x === "string")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function readCookie(cookie: string, name: string): string {
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      try { return decodeURIComponent(rest.join("=")); } catch { return rest.join("="); }
    }
  }
  return "";
}

/** The Pixel's own _fbc cookie wins; otherwise the value built from a captured fbclid. */
export function readFbc(now: number, local: KV | null, cookie: string): string {
  return readCookie(cookie, "_fbc") || readStamped(local, FBC_KEY, now);
}
export function readFbp(cookie: string): string {
  return readCookie(cookie, "_fbp");
}

export function readAttribution(now: number, local: KV | null, session: KV | null, cookie: string) {
  return { refCode: readAgentRef(now, local), utm: readUtm(session), fbp: readFbp(cookie), fbc: readFbc(now, local, cookie) };
}
