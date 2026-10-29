// src/lib/data/class-overview.ts
// Server-only. One read of everything the Classes screen shows: per class, who is present,
// quiz and feedback numbers. Each kind of data is read once for the whole batch.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isoToPktInput } from "@/lib/attendance/rules";
import { attendanceBase } from "@/lib/attendance/links";
import { fetchAll, listSessions, livePersonIds } from "@/lib/data/attendance";
import { generateFeedbackShareToken } from "@/lib/data/feedback-share";
import { summarizeFeedback } from "@/lib/classes/summary";

export type ClassStatus = "done" | "today" | "upcoming";
export type ClassSummary = {
  id: string;
  number: number;
  title: string;
  speaker: string;
  startsAt: string;
  endsAt: string | null;
  status: ClassStatus;
  presentCount: number;
  enrolledLive: number;
  attendanceLink: string;
  feedbackLink: string | null;
  feedbackSessionId: string | null;
  feedbackCount: number;
  feedbackAvg: number | null;
  quiz: { saved: boolean; players: number };
};
export type ClassOverview = {
  title: string;
  classes: ClassSummary[];
  selectedId: string;
  batchFeedback: ReturnType<typeof summarizeFeedback>;
  /** `/review/<token>` of the batch's combined feedback report; null for a webinar or when there is no program. */
  programReviewPath: string | null;
};

const pktDay = (iso: string) => isoToPktInput(iso).slice(0, 10);

export async function getClassOverview(pageId: string, now: Date = new Date()): Promise<ClassOverview> {
  const admin = createAdminSupabase();
  const { data: page, error: pageErr } = await admin.from("landing_pages").select("title, feedback_program_id").eq("id", pageId).maybeSingle();
  if (pageErr) throw new Error(`batch read failed: ${pageErr.message}`);
  const pageRow = page as { title: string; feedback_program_id: string | null } | null;
  const title = pageRow?.title ?? "";

  const sessions = (await listSessions(pageId)).sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime() || a.number - b.number,
  );
  if (sessions.length === 0) return { title, classes: [], selectedId: "", batchFeedback: summarizeFeedback([]), programReviewPath: null };

  const ids = sessions.map((s) => s.id);
  const live = new Set(await livePersonIds(pageId));

  const marks = await fetchAll<{ session_id: string; person_id: string }>("marks read", () =>
    admin.from("batch_session_marks").select("session_id, person_id").in("session_id", ids).order("id", { ascending: true }),
  );
  const present = new Map<string, number>();
  for (const m of marks) if (live.has(m.person_id)) present.set(m.session_id, (present.get(m.session_id) ?? 0) + 1);

  const quizRows = await fetchAll<{ session_id: string }>("quiz results read", () =>
    admin.from("batch_quiz_results").select("session_id").in("session_id", ids).order("id", { ascending: true }),
  );
  const players = new Map<string, number>();
  for (const q of quizRows) players.set(q.session_id, (players.get(q.session_id) ?? 0) + 1);

  const feedbackIds = sessions.flatMap((s) => (s.feedback_session_id ? [s.feedback_session_id] : []));
  const slugs = new Map<string, string>();
  const stats = new Map<string, { count: number; avg: number | null }>();
  if (feedbackIds.length > 0) {
    const { data: fs, error: fsErr } = await admin.from("feedback_sessions").select("id, slug").in("id", feedbackIds);
    if (fsErr) throw new Error(`feedback read failed: ${fsErr.message}`);
    for (const f of (fs ?? []) as { id: string; slug: string }[]) slugs.set(f.id, f.slug);
    const { data: st, error: stErr } = await admin.rpc("feedback_session_stats", { p_session_ids: feedbackIds });
    if (stErr) throw new Error(`feedback stats read failed: ${stErr.message}`);
    for (const r of (st ?? []) as { feedback_session_id: string; response_count: number | string; avg_star: number | string | null }[]) {
      stats.set(r.feedback_session_id, { count: Number(r.response_count), avg: r.avg_star != null ? Number(r.avg_star) : null });
    }
  }

  const today = pktDay(now.toISOString());
  const base = attendanceBase();
  const classes: ClassSummary[] = sessions.map((s) => {
    const day = pktDay(s.starts_at);
    const status: ClassStatus = day < today ? "done" : day === today ? "today" : "upcoming";
    const slug = s.feedback_session_id ? slugs.get(s.feedback_session_id) : undefined;
    const fb = s.feedback_session_id ? stats.get(s.feedback_session_id) : undefined;
    return {
      id: s.id,
      number: s.number,
      title: s.title,
      speaker: s.speaker,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      status,
      presentCount: present.get(s.id) ?? 0,
      enrolledLive: live.size,
      attendanceLink: `${base}/attend/${s.public_code}`,
      feedbackLink: slug ? `${base}/feedback/${slug}` : null,
      feedbackSessionId: slug ? s.feedback_session_id : null,
      feedbackCount: fb?.count ?? 0,
      feedbackAvg: fb?.avg ?? null,
      quiz: { saved: !!s.quiz_saved_at, players: players.get(s.id) ?? 0 },
    };
  });

  const selected =
    classes.find((c) => c.status === "today") ?? classes.find((c) => c.status === "upcoming") ?? classes[classes.length - 1];

  let programReviewPath: string | null = null;
  if (pageRow?.feedback_program_id) {
    try {
      // Idempotent: returns the existing token, or creates one the first time.
      programReviewPath = (await generateFeedbackShareToken("program", pageRow.feedback_program_id, null)).shareUrl;
    } catch {
      programReviewPath = null; // the summary still shows; only the link is left out
    }
  }
  const batchFeedback = summarizeFeedback(classes.map((c) => ({ number: c.number, responses: c.feedbackCount, avg: c.feedbackAvg })));
  return { title, classes, selectedId: selected.id, batchFeedback, programReviewPath };
}
