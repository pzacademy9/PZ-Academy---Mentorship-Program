import Link from "next/link";
import { ArrowRight, Inbox, Star, Image as ImageIcon } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/require-mentor";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listFeedbackSessionsForMentor } from "@/lib/data/feedback-sessions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { coverProxyUrl } from "@/lib/feedback/cover-url";

export const metadata = { title: "My Feedback — PZ Academy" };

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
      <Inbox className="w-10 h-10 text-pz-outline-variant mb-3" />
      <p className="font-body text-pz-on-surface-variant text-sm">{message}</p>
    </div>
  );
}

/**
 * Mentor's own read-only feedback list. Scoped by resolving the caller's
 * `mentors` row (profile_id = auth user) and querying
 * listFeedbackSessionsForMentor(mentor.id) directly, in-page — mirrors the
 * API route in src/app/api/mentor/feedback/sessions/route.ts but skips the
 * round trip, same pattern as the admin feedback pages (Tasks 17/18).
 */
export default async function MentorFeedbackPage() {
  const { user } = await requireMentorPage();

  const admin = createAdminSupabase();
  const { data: mentor } = await admin.from("mentors").select("id").eq("profile_id", user.id).maybeSingle();

  const sessions = mentor ? await listFeedbackSessionsForMentor(mentor.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">My Session Feedback</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Read-only view of feedback collected for sessions you led.
        </p>
      </div>

      {!mentor ? (
        <EmptyState message="No mentor profile is linked to your account yet. Contact an admin to get set up." />
      ) : sessions.length === 0 ? (
        <EmptyState message="No feedback sessions have been linked to you yet." />
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/mentor/feedback/${s.id}`}
              className="group flex flex-col md:flex-row md:items-center justify-between gap-3 bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 hover:border-pz-primary/40 hover:shadow-card transition-all p-5"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="w-16 h-10 shrink-0 rounded-lg overflow-hidden border border-pz-outline-variant/40 bg-pz-surface-container grid place-items-center">
                  {s.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverProxyUrl(s.coverUrl)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-pz-outline-variant" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap mb-1.5">
                    <span
                      className={cn(
                        "inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap font-headline",
                        s.status === "active"
                          ? "bg-pz-primary-container/30 text-pz-on-primary-container"
                          : "bg-pz-surface-variant text-pz-on-surface-variant",
                      )}
                    >
                      {s.status === "active" ? "Active" : "Closed"}
                    </span>
                    {s.sessionDate && (
                      <span className="font-body text-xs text-pz-on-surface-variant">{formatDate(s.sessionDate)}</span>
                    )}
                  </div>
                  <h2 className="font-headline font-semibold text-pz-on-surface truncate group-hover:text-pz-primary transition-colors">
                    {s.name}
                  </h2>
                  <p className="font-body text-xs text-pz-on-surface-variant mt-0.5 truncate">
                    {s.responseCount} {s.responseCount === 1 ? "response" : "responses"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {s.avgRating != null ? (
                  <span className="inline-flex items-center gap-1 bg-pz-surface-container px-3 py-1 rounded-full">
                    <Star className="w-3.5 h-3.5 fill-pz-secondary text-pz-secondary" />
                    <span className="font-headline font-semibold text-xs">{s.avgRating.toFixed(1)}</span>
                  </span>
                ) : (
                  <span className="font-body text-xs text-pz-on-surface-variant/60">No ratings</span>
                )}
                <span className="inline-flex items-center gap-1 font-headline text-sm font-semibold text-pz-on-surface-variant group-hover:text-pz-primary transition-colors">
                  View
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
