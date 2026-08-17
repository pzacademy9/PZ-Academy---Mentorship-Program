import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronDown, Inbox, Star, Users, Video } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/require-mentor";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFeedbackSessionDetail, type PerQuestionStat, type ResponseDetail } from "@/lib/data/feedback-responses";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Session Feedback — PZ Academy" };

function personAvg(stars: number[]): number | null {
  if (!stars.length) return null;
  return Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10;
}

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < Math.round(value) ? "fill-pz-secondary text-pz-secondary" : "text-pz-outline-variant"}
        />
      ))}
    </span>
  );
}

function PerQuestionBar({ q }: { q: PerQuestionStat }) {
  if (q.type === "video") {
    return (
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <p className="font-body text-sm text-pz-on-surface-variant">{q.question}</p>
          <span className="inline-flex items-center gap-1 font-body text-xs text-pz-on-surface-variant">
            <Video className="w-3.5 h-3.5" />
            {q.count} submitted
          </span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex justify-between items-end mb-1.5">
        <p className="font-body text-sm text-pz-on-surface-variant">{q.question}</p>
        <span className="font-headline font-semibold text-sm text-pz-on-surface">
          {q.avg != null ? q.avg.toFixed(1) : "—"}
        </span>
      </div>
      <div className="w-full h-2.5 rounded-full bg-pz-surface-container-highest overflow-hidden">
        <div
          className="h-full rounded-full bg-pz-primary transition-[width] duration-700"
          style={{ width: `${q.avg != null ? (q.avg / 5) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

/** Plain <details>/<summary> expand — read-only, so no client component is needed. */
function ResponseRow({
  r,
  starQuestions,
  videoQuestions,
}: {
  r: ResponseDetail;
  starQuestions: PerQuestionStat[];
  videoQuestions: PerQuestionStat[];
}) {
  const stars = Object.values(r.answers)
    .map((a) => a.starValue)
    .filter((v): v is number => v != null);
  const avg = personAvg(stars);

  return (
    <details className="group border-b border-pz-outline-variant/30 last:border-b-0">
      <summary className="flex items-center gap-4 py-4 px-6 cursor-pointer hover:bg-pz-surface-container/40 transition-colors list-none [&::-webkit-details-marker]:hidden">
        <span className="w-9 h-9 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs">
          {initials(r.name)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-headline font-semibold text-sm text-pz-on-surface">{r.name}</span>
            {avg != null && (
              <span className="inline-flex items-center gap-1 font-body text-xs text-pz-on-surface-variant">
                <Star className="w-3 h-3 fill-pz-secondary text-pz-secondary" />
                {avg.toFixed(1)}
              </span>
            )}
          </div>
          {r.comments ? (
            <p className="font-body text-xs text-pz-on-surface-variant mt-0.5 truncate group-open:whitespace-normal">
              &ldquo;{r.comments}&rdquo;
            </p>
          ) : (
            <p className="font-body text-xs text-pz-on-surface-variant/60 mt-0.5 italic">No comments</p>
          )}
        </div>
        <span className="font-body text-xs text-pz-on-surface-variant whitespace-nowrap hidden sm:inline">
          {formatDateTime(r.submittedAt)}
        </span>
        <ChevronDown className="w-4 h-4 text-pz-on-surface-variant shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="px-6 pb-5 pl-[4.25rem] space-y-4">
        {r.email && <p className="font-body text-xs text-pz-on-surface-variant">{r.email}</p>}

        {starQuestions.length > 0 && (
          <div className="space-y-2">
            {starQuestions.map((q) => {
              const a = r.answers[q.id];
              if (a?.starValue == null) return null;
              return (
                <div key={q.id} className="flex items-center justify-between gap-3">
                  <span className="font-body text-xs text-pz-on-surface-variant flex-1">{q.question}</span>
                  <StarRow value={a.starValue} />
                </div>
              );
            })}
          </div>
        )}

        {videoQuestions.length > 0 && (
          <div className="space-y-3">
            {videoQuestions.map((q) => {
              const a = r.answers[q.id];
              if (!a?.videoUrl) return null;
              return (
                <div
                  key={q.id}
                  className="rounded-lg overflow-hidden border border-pz-outline-variant/40 bg-black relative"
                  style={{ paddingBottom: "56.25%" }}
                >
                  <iframe
                    src={a.videoUrl}
                    title={`Video feedback — ${q.question}`}
                    sandbox="allow-scripts allow-same-origin"
                    allow=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Mentor's own read-only feedback detail. Resolves the caller's `mentors`
 * row and enforces the mentor_id match in-page — mirrors
 * src/app/api/mentor/feedback/sessions/[id]/route.ts but skips the round
 * trip, same pattern as the admin feedback pages (Tasks 17/18). No export,
 * no delete, no share-link, no cover upload, no status toggle — those stay
 * admin-only affordances.
 */
export default async function MentorFeedbackSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireMentorPage();
  const { id } = await params;

  const admin = createAdminSupabase();
  const { data: mentor } = await admin.from("mentors").select("id").eq("profile_id", user.id).maybeSingle();
  if (!mentor) redirect("/dashboard/mentor/feedback");

  const detail = await getFeedbackSessionDetail(id);
  if (!detail || detail.session.mentorId !== mentor.id) notFound();

  const { session, perQuestion, responses } = detail;
  const starQuestions = perQuestion.filter((q) => q.type === "stars");
  const videoQuestions = perQuestion.filter((q) => q.type === "video");
  const videoResponseCount = videoQuestions.reduce((sum, q) => sum + q.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/mentor/feedback"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to my sessions
        </Link>

        <div className="flex items-center gap-3 flex-wrap mt-3">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary truncate">{session.name}</h1>
          <span
            className={cn(
              "inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap font-headline",
              session.status === "active"
                ? "bg-pz-primary-container/30 text-pz-on-primary-container"
                : "bg-pz-surface-variant text-pz-on-surface-variant",
            )}
          >
            {session.status === "active" ? "Active" : "Closed"}
          </span>
        </div>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          {session.speakerName}
          {session.sessionDate ? ` · ${formatDate(session.sessionDate)}` : ""}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-xs uppercase tracking-wide text-pz-on-surface-variant">Total Responses</span>
            <span className="w-8 h-8 rounded-full bg-pz-surface-container grid place-items-center">
              <Users className="w-4 h-4 text-pz-primary" />
            </span>
          </div>
          <p className="font-headline font-bold text-3xl text-pz-on-surface">{session.responseCount}</p>
        </div>
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-xs uppercase tracking-wide text-pz-on-surface-variant">Avg Rating</span>
            <span className="w-8 h-8 rounded-full bg-pz-surface-container grid place-items-center">
              <Star className="w-4 h-4 text-pz-primary" />
            </span>
          </div>
          <p className="font-headline font-bold text-3xl text-pz-on-surface">
            {session.avgRating != null ? session.avgRating.toFixed(1) : "—"}
            <span className="font-body text-sm text-pz-on-surface-variant font-normal"> / 5.0</span>
          </p>
        </div>
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-xs uppercase tracking-wide text-pz-on-surface-variant">Video Responses</span>
            <span className="w-8 h-8 rounded-full bg-pz-surface-container grid place-items-center">
              <Video className="w-4 h-4 text-pz-primary" />
            </span>
          </div>
          <p className="font-headline font-bold text-3xl text-pz-on-surface">{videoResponseCount}</p>
        </div>
      </div>

      {/* Per-question averages */}
      {perQuestion.length > 0 && (
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-6">
          <h2 className="font-headline font-bold text-pz-on-surface text-base mb-5">Avg Rating per Question</h2>
          <div className="space-y-5">
            {perQuestion.map((q, i) => (
              <PerQuestionBar key={i} q={q} />
            ))}
          </div>
        </div>
      )}

      {/* Responses */}
      <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
        <div className="p-6 border-b border-pz-outline-variant/40">
          <h2 className="font-headline font-bold text-pz-on-surface text-base">Responses</h2>
        </div>

        {responses.length === 0 ? (
          <div className="p-10 flex flex-col items-center text-center">
            <Inbox className="w-9 h-9 text-pz-outline-variant mb-3" />
            <p className="font-body text-sm text-pz-on-surface-variant">No responses yet for this session.</p>
          </div>
        ) : (
          <div>
            {responses.map((r) => (
              <ResponseRow key={r.id} r={r} starQuestions={starQuestions} videoQuestions={videoQuestions} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
