import { Inbox, Star } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listFeedbackSessions } from "@/lib/data/feedback-sessions";
import { listFeedbackPrograms } from "@/lib/data/feedback-programs";
import { formatDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NewSessionModal, SessionRowActions } from "./NewSessionModal";

export const metadata = { title: "Feedback Sessions — PZ Academy" };

function EmptyState() {
  return (
    <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
      <Inbox className="w-10 h-10 text-pz-outline-variant mb-3" />
      <p className="font-body text-pz-on-surface-variant text-sm">
        No feedback sessions yet — create one to start collecting responses.
      </p>
    </div>
  );
}

export default async function AdminFeedbackPage() {
  await requireAdminPage();

  const [sessions, programs] = await Promise.all([listFeedbackSessions(), listFeedbackPrograms()]);
  const programNameById = new Map(programs.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">Feedback Sessions</h1>
          <p className="font-body text-pz-on-surface-variant text-sm mt-1">
            Create sessions and track how attendees are rating them.
          </p>
        </div>
        <NewSessionModal />
      </div>

      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[64rem]">
              <thead>
                <tr className="border-b border-pz-outline-variant/40 text-pz-on-surface text-left">
                  <th className="py-4 px-6 font-headline font-semibold">Session</th>
                  <th className="py-4 px-6 font-headline font-semibold">Speaker</th>
                  <th className="py-4 px-6 font-headline font-semibold">Date</th>
                  <th className="py-4 px-6 font-headline font-semibold text-right">Responses</th>
                  <th className="py-4 px-6 font-headline font-semibold text-right">Avg Rating</th>
                  <th className="py-4 px-6 font-headline font-semibold text-center">Status</th>
                  <th className="py-4 px-6 font-headline font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant/30 text-pz-on-surface">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-pz-surface-container/40 transition-colors">
                    <td className="py-4 px-6 max-w-xs">
                      <div className="font-headline font-semibold text-pz-on-surface truncate">{s.name}</div>
                      {s.programId && (
                        <div className="font-body text-xs text-pz-on-surface-variant mt-0.5 truncate">
                          {programNameById.get(s.programId) ?? "Program"}
                          {s.programOrder != null ? ` · Part ${s.programOrder}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs">
                          {initials(s.speakerName)}
                        </span>
                        <span className="font-body truncate">{s.speakerName}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-body text-pz-on-surface-variant whitespace-nowrap">
                      {s.sessionDate ? formatDate(s.sessionDate) : "—"}
                    </td>
                    <td className="py-4 px-6 font-body text-right tabular-nums">{s.responseCount}</td>
                    <td className="py-4 px-6 text-right">
                      {s.avgRating != null ? (
                        <span className="inline-flex items-center gap-1 bg-pz-surface-container px-3 py-1 rounded-full">
                          <Star className="w-3.5 h-3.5 fill-pz-secondary text-pz-secondary" />
                          <span className="font-headline font-semibold text-xs">{s.avgRating.toFixed(1)}</span>
                        </span>
                      ) : (
                        <span className="font-body text-xs text-pz-on-surface-variant/60">No ratings</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
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
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end">
                        <SessionRowActions id={s.id} name={s.name} slug={s.slug} status={s.status} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
