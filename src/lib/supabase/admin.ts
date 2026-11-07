import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client. `noStore: true` makes every request skip Next's data cache, for reads that must
 * show a change the moment it is saved (the affiliate documents). Leave it off elsewhere: the landing
 * pages rely on the cache.
 */
export function createAdminSupabase(options: { noStore?: boolean } = {}) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      ...(options.noStore ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) } } : {}),
    },
  );
}
