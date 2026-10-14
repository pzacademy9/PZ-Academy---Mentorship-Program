import { readAgentRef, readUtm } from "./attribution";
import { newEventId } from "./pixel";
import { safeLocal, safeSession, type KV } from "./storage";

export type FunnelType = "view" | "start" | "step" | "submit";
const SESSION_KEY = "pz_session_id";
// The event and register routes accept 8..100 chars of [A-Za-z0-9_-].
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,100}$/;
let fallbackSessionId: string | null = null;

export function getSessionId(session: KV | null = safeSession()): string {
  const stored = session?.getItem(SESSION_KEY);
  if (stored && SESSION_ID_RE.test(stored)) return stored;
  let id = fallbackSessionId ?? newEventId();
  if (!SESSION_ID_RE.test(id)) id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  fallbackSessionId = id;
  session?.setItem(SESSION_KEY, id);
  return id;
}

/** The JSON body POST /api/landing/[slug]/event expects: { sessionId, type, utm, ref? }. */
export function buildFunnelBody(type: FunnelType, now: number, local: KV | null, session: KV | null): string {
  const ref = readAgentRef(now, local);
  return JSON.stringify({ sessionId: getSessionId(session), type, utm: readUtm(session), ...(ref ? { ref } : {}) });
}

/** Fire-and-forget; never throws, never blocks navigation. */
export function sendFunnelEvent(slug: string, type: FunnelType): void {
  if (typeof window === "undefined") return;
  try {
    const body = buildFunnelBody(type, Date.now(), safeLocal(), safeSession());
    const url = `/api/landing/${encodeURIComponent(slug)}/event`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return;
    } catch {
      // fall through to fetch
    }
    const p = fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }) as Promise<unknown> | undefined;
    if (p && typeof p.catch === "function") p.catch(() => undefined);
  } catch {
    // never throw from analytics
  }
}
