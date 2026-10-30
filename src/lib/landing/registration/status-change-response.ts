// Shared by the admin and sales status-change routes: one place maps a data-layer result to an HTTP answer.
import { NextResponse } from "next/server";
import { STATUS_CHANGE_MESSAGES } from "./status-rules";
import type { ChangeStatusResult } from "@/lib/data/landing-registration-admin";

type Failure = Extract<ChangeStatusResult, { ok: false }>["reason"];

const STALE_MESSAGE = "Someone else changed this just now. Reload to see the latest.";

export function statusChangeResponse(result: ChangeStatusResult): NextResponse {
  if (result.ok) return NextResponse.json({ id: result.id, status: result.status, ...(result.warning ? { warning: result.warning } : {}) });
  const reason: Failure = result.reason;
  switch (reason) {
    // not-found and member-row share one body so nothing reveals whether another agent's row exists.
    case "not-found":
    case "member-row":
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    case "free-row":
    case "amount-required":
    case "amount-invalid":
      return NextResponse.json({ error: STATUS_CHANGE_MESSAGES[reason] }, { status: 400 });
    case "already-in-status":
      return NextResponse.json({ error: STATUS_CHANGE_MESSAGES[reason] }, { status: 422 });
    case "stale":
      return NextResponse.json({ error: STALE_MESSAGE }, { status: 409 });
    default:
      return NextResponse.json({ error: "Could not update registration" }, { status: 500 });
  }
}
