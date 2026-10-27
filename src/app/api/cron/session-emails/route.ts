import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createSessionSend } from "@/lib/data/session-emails";
import { listDueReminderSessionIds, listSessionSendsWithPending } from "@/lib/data/session-cron";
import { runEmailSend } from "@/lib/data/participant-sends";

// Called every 5 minutes by a Supabase pg_cron + pg_net job (the free Vercel plan only allows a daily cron).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SENDS_PER_CALL = 5;
const RECIPIENTS_PER_SEND = 40;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed: with no CRON_SECRET configured the route is not callable at all.
  const given = req.headers.get("authorization") ?? "";
  if (!cronSecret || !timingSafeEqual(digest(given), digest(`Bearer ${cronSecret}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let created = 0;
  let sent = 0;
  let failed = 0;

  try {
    for (const sessionId of await listDueReminderSessionIds()) {
      try {
        // Not-ok results (no_zoom, already_sent, no_recipients, ...) are normal: skipped quietly.
        const r = await createSessionSend(sessionId, "reminder");
        if (r.ok) created++;
      } catch {
        failed++;
        console.error(`session-emails: could not create reminder for session ${sessionId}`);
      }
    }
  } catch {
    failed++;
    console.error("session-emails: could not list due sessions");
  }

  try {
    for (const sendId of await listSessionSendsWithPending(MAX_SENDS_PER_CALL)) {
      try {
        const r = await runEmailSend(sendId, RECIPIENTS_PER_SEND);
        sent += r.sent;
        failed += r.failed;
      } catch {
        failed++;
        console.error(`session-emails: could not run send ${sendId}`);
      }
    }
  } catch {
    failed++;
    console.error("session-emails: could not list pending sends");
  }

  return NextResponse.json({ ok: true, created, sent, failed });
}
