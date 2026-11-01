import { createHash } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { allowRequest } from "@/lib/pzid/rate-limit";

const LIMIT = 30;
const WINDOW_SECS = 600;

/**
 * Rate limit for the public progress lookup: about 30 lookups per 10 minutes per IP.
 * The count lives in Postgres so every server instance shares it. Only a hash of the IP is
 * stored, never the address. If the database call fails, the in-memory limiter is used instead.
 */
export async function allowLookup(ip: string): Promise<boolean> {
  const key = createHash("sha256").update(`pz-lookup:${ip}`).digest("hex");
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
