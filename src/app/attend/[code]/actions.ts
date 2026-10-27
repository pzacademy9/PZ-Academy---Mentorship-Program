"use server";

import { headers } from "next/headers";
import {
  eligiblePersonForEmail,
  getSessionByCode,
  isLiveEnrolled,
  markPresent,
  personFirstName,
} from "@/lib/data/attendance";
import { checkinWindow, type WindowOverride } from "@/lib/attendance/rules";
import { checkinSecret, verifyCheckinToken } from "@/lib/attendance/link-token";
import { allowRequest } from "@/lib/pzid/rate-limit";

export type CheckinResult =
  | { status: "marked"; firstName: string; already: boolean }
  | { status: "before" | "closed" }
  | { status: "not_live" | "not_found" | "bad_link" | "rate_limited" | "error" };

const MAX_EMAIL = 254;

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

type Session = NonNullable<Awaited<ReturnType<typeof getSessionByCode>>>;

/** Window is checked right before the write, so a stale page cannot mark late or early. */
async function markIfOpen(
  session: Session,
  personId: string,
  firstName: string,
  source: "personal" | "shared",
): Promise<CheckinResult> {
  const state = checkinWindow(session.starts_at, session.window_override as WindowOverride, new Date());
  if (state !== "open") return { status: state };
  const { created } = await markPresent(session.id, personId, source);
  return { status: "marked", firstName, already: !created };
}

export async function checkInPersonal(code: string, token: string): Promise<CheckinResult> {
  if (!allowRequest(await clientIp())) return { status: "rate_limited" };
  try {
    const session = await getSessionByCode(String(code));
    if (!session) return { status: "not_found" };
    const secret = checkinSecret();
    if (!secret) return { status: "bad_link" };
    const verified = verifyCheckinToken(String(token), session.id, secret);
    if (!verified) return { status: "bad_link" };
    const firstName = await personFirstName(verified.personId);
    if (firstName === null) return { status: "bad_link" };
    if (!(await isLiveEnrolled(session.page_id, verified.personId))) return { status: "not_live" };
    return await markIfOpen(session, verified.personId, firstName, "personal");
  } catch {
    return { status: "error" };
  }
}

export async function checkInShared(code: string, email: string): Promise<CheckinResult> {
  if (!allowRequest(await clientIp())) return { status: "rate_limited" };
  try {
    const typed = String(email ?? "").trim();
    if (!typed || typed.length > MAX_EMAIL) return { status: "not_found" };
    const session = await getSessionByCode(String(code));
    if (!session) return { status: "not_found" };
    const person = await eligiblePersonForEmail(session.page_id, typed);
    if ("reason" in person) {
      return { status: person.reason === "not_live" ? "not_live" : "not_found" };
    }
    return await markIfOpen(session, person.personId, person.firstName, "shared");
  } catch {
    return { status: "error" };
  }
}
