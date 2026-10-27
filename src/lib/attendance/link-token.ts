import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Signed personal check-in links: token = <personId>.<base64url HMAC-SHA256>.
// The signature binds the person to one session, so a link cannot be reused
// for another session or edited to name another person.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOKEN_LENGTH = 200;
const KEY_LABEL = "pz-attendance-link-key-v1";

function sign(sessionId: string, personId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`attendance-link-v1:${sessionId}:${personId}`)
    .digest("base64url");
}

export function signCheckinToken(
  sessionId: string,
  personId: string,
  secret: string,
): string {
  return `${personId}.${sign(sessionId, personId, secret)}`;
}

export function verifyCheckinToken(
  token: string,
  sessionId: string,
  secret: string,
): { personId: string } | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const personId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!UUID_RE.test(personId)) return null;

  const expected = Buffer.from(sign(sessionId, personId, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;
  return { personId };
}

// Derived from the service-role key with a fixed label, so no new env var is
// needed and the raw key is never used directly as the signing secret.
export function checkinSecret(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createHmac("sha256", key).update(KEY_LABEL).digest("hex");
}
