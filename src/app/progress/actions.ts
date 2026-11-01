"use server";

import { checkNameQuery, findIdsByName, MAX_ROWS, type MyIdRow } from "@/lib/data/pz-people";
import { getProgressByPzId } from "@/lib/data/progress";
import type { Progress } from "@/lib/progress/build";
import { callerAllowed } from "@/lib/pzid/caller-allowed";

export type FindMyIdByNameResult =
  | { status: "ok"; rows: MyIdRow[]; more: boolean }
  | { status: "too_short" }
  | { status: "too_long" }
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

export async function findMyIdByName(query: string): Promise<FindMyIdByNameResult> {
  try {
    if (!(await callerAllowed())) return { status: "rate_limited" };
    const check = checkNameQuery(query);
    if (!check.ok) return { status: check.reason };
    // The search returns up to 6; show 5 and only note that more people match.
    const found = (await findIdsByName(check.q)).slice(0, MAX_ROWS + 1);
    if (found.length === 0) return { status: "not_found" };
    return { status: "ok", rows: found.slice(0, MAX_ROWS), more: found.length > MAX_ROWS };
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
