"use server";

import { headers } from "next/headers";
import { cleanNameQuery, findIdsByName, MAX_ROWS, type MyIdRow } from "@/lib/data/pz-people";
import { getProgressByPzId } from "@/lib/data/progress";
import type { Progress } from "@/lib/progress/build";
import { allowLookup } from "@/lib/pzid/lookup-limit";

export type FindMyIdByNameResult =
  | { status: "ok"; rows: MyIdRow[] }
  | { status: "too_short" }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

export type MyProgressResult =
  | { status: "ok"; progress: Progress }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

// The only error text ever sent to the browser. Thrown messages stay on the server.
const GENERIC_ERROR = "Something went wrong. Please try again in a minute.";

async function callerAllowed(): Promise<boolean> {
  const h = await headers();
  const ip =
    (h.get("x-real-ip") ?? "").trim() || (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return allowLookup(ip);
}

export async function findMyIdByName(query: string): Promise<FindMyIdByNameResult> {
  try {
    if (!(await callerAllowed())) return { status: "rate_limited" };
    const q = cleanNameQuery(query);
    if (!q) return { status: "too_short" };
    const rows = (await findIdsByName(q)).slice(0, MAX_ROWS);
    if (rows.length === 0) return { status: "not_found" };
    return { status: "ok", rows };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}

export async function getMyProgress(rawId: string): Promise<MyProgressResult> {
  try {
    if (!(await callerAllowed())) return { status: "rate_limited" };
    const progress = await getProgressByPzId(typeof rawId === "string" ? rawId : "");
    if (!progress) return { status: "not_found" };
    return { status: "ok", progress };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}
