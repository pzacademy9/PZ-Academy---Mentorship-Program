"use server";

import { checkNameQuery, findIdsByName, MAX_ROWS, type MyIdRow } from "@/lib/data/pz-people";
import { callerAllowed } from "@/lib/pzid/caller-allowed";
import { getProgressByPzId } from "@/lib/data/progress";
import { getProgressStandings } from "@/lib/data/portal";
import type { Progress } from "@/lib/progress/build";
import type { Standing } from "@/lib/progress/my-progress";

export type FindMyIdByNameResult =
  | { status: "ok"; rows: MyIdRow[]; more: boolean }
  | { status: "too_short" }
  | { status: "too_long" }
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

export type CheckMyProgressResult =
  | { status: "ok"; progress: Progress; standings: Record<string, Standing> }
  | { status: "invalid" }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

const MIN_ID = 3;
const MAX_ID = 40;

/**
 * One student's own progress by PZ ID. Shares the Find my ID rate limit. Shows only what the public
 * batch pages already show for that ID (name, PZ ID, attendance, scores, rank); never email or phone.
 */
export async function checkMyProgress(pzId: string): Promise<CheckMyProgressResult> {
  try {
    if (!(await callerAllowed())) return { status: "rate_limited" };
    const id = typeof pzId === "string" ? pzId.trim() : "";
    if (id.length < MIN_ID || id.length > MAX_ID) return { status: "invalid" };
    const progress = await getProgressByPzId(id);
    if (!progress) return { status: "not_found" };
    // A rank is a bonus: if the boards cannot be read, the student still sees their own progress.
    const standings = await getProgressStandings(progress).catch(() => ({}));
    return { status: "ok", progress, standings };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}
