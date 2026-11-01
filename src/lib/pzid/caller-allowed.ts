import "server-only";
import { headers } from "next/headers";
import { allowLookup, allowPortalView } from "@/lib/pzid/lookup-limit";

async function callerIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") ?? "").trim() || (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

/** Find my ID rate limit for the current caller (keyed by IP): 30 per 10 minutes. */
export async function callerAllowed(): Promise<boolean> {
  return allowLookup(await callerIp());
}

/** Batch page rate limit for the current caller: its own, higher count (300 per 10 minutes). */
export async function portalCallerAllowed(): Promise<boolean> {
  return allowPortalView(await callerIp());
}
