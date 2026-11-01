import { createHash } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { allowRequest } from "@/lib/pzid/rate-limit";

const LIMIT = 30;
const WINDOW_SECS = 600;

function v4ToGroups(v4: string): string[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4);
  if (!m) return null;
  const n = m.slice(1).map(Number);
  if (n.some((x) => x > 255)) return null;
  return [((n[0] << 8) | n[1]).toString(16), ((n[2] << 8) | n[3]).toString(16)];
}

/** The 8 groups of an IPv6 address (any form), or null when it is not one. */
function expandV6(raw: string): string[] | null {
  const parts = raw.split("::");
  if (parts.length > 2) return null;
  const side = (text: string): string[] | null => {
    if (text === "") return [];
    const out: string[] = [];
    const items = text.split(":");
    for (let i = 0; i < items.length; i++) {
      const g = items[i];
      if (i === items.length - 1 && g.includes(".")) {
        const two = v4ToGroups(g);
        if (!two) return null;
        out.push(...two);
      } else if (/^[0-9a-f]{1,4}$/.test(g)) out.push(g);
      else return null;
    }
    return out;
  };
  const head = side(parts[0]);
  const tail = parts.length === 2 ? side(parts[1]) : [];
  if (!head || !tail) return null;
  if (parts.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array<string>(missing).fill("0"), ...tail];
}

/**
 * The address a visitor is counted under. IPv4 and "unknown" stay as they are; an IPv6 address is
 * counted by its /64 prefix (first four groups), so one home cannot dodge the limit by rotating
 * addresses; an IPv4-mapped IPv6 address (::ffff:a.b.c.d) counts as that IPv4. Never throws.
 */
export function rateKeyForIp(ip: string): string {
  const text = typeof ip === "string" ? ip.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "") : "";
  if (!text.includes(":")) return text;
  const g = expandV6(text);
  if (!g) return text;
  const n = g.map((x) => parseInt(x, 16));
  if (n.slice(0, 5).every((x) => x === 0) && n[5] === 0xffff) {
    return `${n[6] >> 8}.${n[6] & 255}.${n[7] >> 8}.${n[7] & 255}`;
  }
  return `v6:${n.slice(0, 4).map((x) => x.toString(16)).join(":")}`;
}

/**
 * Rate limit for the public progress lookup: about 30 lookups per 10 minutes per IP.
 * The count lives in Postgres so every server instance shares it. Only a hash of the IP is
 * stored, never the address. If the database call fails, the in-memory limiter is used instead.
 */
export async function allowLookup(ip: string): Promise<boolean> {
  const key = createHash("sha256").update(`pz-lookup:${rateKeyForIp(ip)}`).digest("hex");
  try {
    const { data, error } = await createAdminSupabase().rpc("public_lookup_allow", {
      p_key: key,
      p_limit: LIMIT,
      p_window_secs: WINDOW_SECS,
    });
    if (error || typeof data !== "boolean") return allowRequest(`lookup:${key}`);
    return data;
  } catch {
    return allowRequest(`lookup:${key}`);
  }
}
