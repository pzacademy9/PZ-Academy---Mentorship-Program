import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFeedbackSessionDetail } from "@/lib/data/feedback-responses";
import { average } from "@/lib/validations/feedback";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import type { ShareView, ShareSession, ShareResponse } from "@/lib/mentorship/gas";

type SessionDetail = NonNullable<Awaited<ReturnType<typeof getFeedbackSessionDetail>>>;

function randomToken(): string {
  return "sh_" + crypto.randomUUID().replace(/-/g, "");
}

export async function generateFeedbackShareToken(
  type: "session" | "program",
  id: string,
  actorProfileId: string | null,
): Promise<{ shareUrl: string; token: string }> {
  const admin = createAdminSupabase();
  const table = type === "session" ? "feedback_sessions" : "feedback_programs";
  const { data: row } = await admin.from(table).select("id, share_token").eq("id", id).maybeSingle();
  if (!row) throw new Error(`${type} not found: ${id}`);

  const token = row.share_token || randomToken();
  if (!row.share_token) {
    await admin.from(table).update({ share_token: token }).eq("id", id);
    await logFeedbackAudit({ action: "generateShareToken", detail: `${type}:${id} -> ${token}`, actorProfileId });
  }
  return { shareUrl: `/review/${token}`, token };
}

/**
 * Builds the share view's per-response shape from getFeedbackSessionDetail's
 * output. Used to run its own loadAnswersByResponse() query here (see the
 * Important-5 fix ledger note) because ResponseDetail.stars/videos were
 * compacted push-based arrays unusable for this purpose — a response that
 * skipped a non-last stars/video question would shift every later answer of
 * that type into the wrong slot. Now that ResponseDetail.answers is keyed by
 * question_id (never positional), this can build the same sparse-by-type-
 * position stars[]/videos[] arrays ShareResponse expects directly from
 * `session`, with no extra query.
 */
function toShareSession(session: SessionDetail): ShareSession {
  const { perQuestion, responses } = session;
  const questions = session.session.questions; // ordered by question_order — same order perQuestion was built from
  const starQuestions = questions.filter((q) => q.type === "stars");
  const videoQuestions = questions.filter((q) => q.type === "video");
  const starAvgs = perQuestion.filter((q) => q.type !== "video" && q.avg != null).map((q) => q.avg as number);

  return {
    id: session.session.id,
    name: session.session.name,
    speaker: session.session.speakerName,
    date: session.session.sessionDate ?? "",
    coverUrl: session.session.coverUrl ?? "",
    responseCount: responses.length,
    avgRating: average(starAvgs),
    perQuestion: perQuestion.map((q) => ({ question: q.question, type: q.type, avg: q.avg, count: q.count })),
    responses: responses.map((r): ShareResponse => {
      // Sparse-index by position among stars-type (resp. video-type) questions
      // specifically, so stars[i]/videos[i] always corresponds to the i-th
      // question of that type — with a genuine hole (undefined), not a shift,
      // for any question this response didn't answer.
      const stars: number[] = [];
      starQuestions.forEach((q, i) => {
        const a = r.answers[q.id];
        if (a && a.starValue !== null) stars[i] = a.starValue;
      });
      const videos: string[] = [];
      videoQuestions.forEach((q, i) => {
        const a = r.answers[q.id];
        if (a && a.videoUrl) videos[i] = a.videoUrl;
      });

      return {
        submittedOn: r.submittedAt,
        name: r.name === "—" ? "" : r.name,
        stars,
        videos,
        comments: r.comments,
      };
    }),
  };
}

export async function getNativeShareView(token: string): Promise<ShareView | null> {
  const admin = createAdminSupabase();

  const { data: session } = await admin.from("feedback_sessions").select("id").eq("share_token", token).maybeSingle();
  if (session) {
    const detail = await getFeedbackSessionDetail(session.id);
    if (!detail) return null;
    return { type: "session", session: toShareSession(detail) };
  }

  const { data: program } = await admin.from("feedback_programs").select("id, name, type, cover_url").eq("share_token", token).maybeSingle();
  if (program) {
    const { data: members } = await admin
      .from("feedback_sessions")
      .select("id")
      .eq("program_id", program.id)
      .order("program_order", { ascending: true });
    const sessions: ShareSession[] = [];
    for (const m of members ?? []) {
      const detail = await getFeedbackSessionDetail(m.id);
      if (detail) sessions.push(toShareSession(detail));
    }
    return {
      type: "program",
      program: { id: program.id, name: program.name, type: program.type, coverUrl: program.cover_url ?? "" },
      sessions,
    };
  }

  return null;
}
