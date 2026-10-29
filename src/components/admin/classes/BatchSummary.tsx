import Link from "next/link";
import { Award, ExternalLink, Star, Users } from "lucide-react";
import { summarizeAttendance, summarizeFeedback } from "@/lib/classes/summary";
import type { GridRow } from "@/lib/data/attendance";
import { cardCls, quietBtn } from "@/components/admin/classes/styles";

export function BatchSummary({
  feedback, reviewPath, rows, minPct,
}: {
  feedback: ReturnType<typeof summarizeFeedback>;
  /** Public combined report for a course or workshop; null for a webinar. */
  reviewPath: string | null;
  rows: GridRow[];
  minPct: number;
}) {
  const att = summarizeAttendance(rows, minPct);
  const hasFeedback = feedback.overallAvg !== null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className={`${cardCls} space-y-3`} aria-labelledby="batch-feedback-title">
        <h2 id="batch-feedback-title" className="flex items-center gap-2 font-headline text-lg font-bold text-pz-on-surface">
          <Star className="size-5" aria-hidden />
          Feedback
        </h2>
        {hasFeedback ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 text-base text-pz-on-surface-variant">
              <span className="font-headline text-3xl font-bold text-pz-on-surface">{feedback.overallAvg!.toFixed(1)}</span>
              <span>out of 5</span>
              <span>{feedback.totalResponses} {feedback.totalResponses === 1 ? "response" : "responses"}</span>
            </p>
            <ul className="space-y-2">
              {feedback.perClass.map((c) => (
                <li key={c.number} className="flex items-center gap-3 text-base text-pz-on-surface">
                  <span className="w-16 shrink-0">Day {c.number}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-pz-surface-container-high" aria-hidden>
                    <span className="block h-full rounded-full bg-pz-primary" style={{ width: `${c.avg === null ? 0 : (c.avg / 5) * 100}%` }} />
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {c.avg === null ? "No feedback" : `${c.avg.toFixed(1)} (${c.responses})`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-base text-pz-on-surface-variant">No feedback yet</p>
        )}
        {reviewPath && (
          <Link href={reviewPath} target="_blank" className={`${quietBtn} max-md:w-full`}>
            <ExternalLink className="size-5" aria-hidden />
            See the combined feedback report
          </Link>
        )}
      </section>

      <section className={`${cardCls} space-y-3`} aria-labelledby="batch-attendance-title">
        <h2 id="batch-attendance-title" className="flex items-center gap-2 font-headline text-lg font-bold text-pz-on-surface">
          <Users className="size-5" aria-hidden />
          Attendance
        </h2>
        {att.averagePct === null ? (
          <p className="text-base text-pz-on-surface-variant">No classes held yet</p>
        ) : (
          <>
            <p className="font-headline text-3xl font-bold text-pz-on-surface">Average attendance {att.averagePct}%</p>
            <p className="flex items-center gap-2 text-base text-pz-on-surface-variant">
              <Award className="size-5 shrink-0" aria-hidden />
              {att.meetingMin} of {att.total} students meet the {minPct}% minimum for a certificate
            </p>
          </>
        )}
      </section>
    </div>
  );
}
