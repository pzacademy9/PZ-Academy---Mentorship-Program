import "server-only";
import { headers } from "next/headers";
import { allowLookup } from "@/lib/pzid/lookup-limit";

/** Public-lookup rate limit for the current caller (keyed by IP). Shared by the progress actions and pages. */
export async function callerAllowed(): Promise<boolean> {
  const h = await headers();
  const ip =
    (h.get("x-real-ip") ?? "").trim() || (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return allowLookup(ip);
}
