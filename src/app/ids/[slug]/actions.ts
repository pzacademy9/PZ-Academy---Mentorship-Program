"use server";

import { headers } from "next/headers";
import { searchBatchIds, type BatchIdRow } from "@/lib/data/pz-people";
import { allowRequest } from "@/lib/pzid/rate-limit";

export type FindMyIdResult =
  | { status: "ok"; rows: BatchIdRow[] }
  | { status: "too_short" }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

export async function findMyId(slug: string, query: string): Promise<FindMyIdResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!allowRequest(ip)) return { status: "rate_limited" };

  try {
    const res = await searchBatchIds(slug, query);
    if (!res) return { status: "not_found" };
    if (query.trim().length < 3) return { status: "too_short" };
    if (!res.found) return { status: "not_found" };
    return { status: "ok", rows: res.rows };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Could not search IDs. Please try again.",
    };
  }
}
