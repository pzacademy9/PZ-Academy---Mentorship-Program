"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, CheckCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { UpcomingSession } from "@/lib/data/mentorship-sessions";

export function UpcomingSessionsList({ sessions }: { sessions: UpcomingSession[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function markCompleted(sessionId: string) {
    startTransition(async () => {
      const res = await fetch(`/api/mentor/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) {
        toast.error("Could not mark this session completed.");
        return;
      }
      toast.success("Session marked completed.");
      router.refresh();
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Calendar className="w-10 h-10 text-pz-border mb-3" />
        <p className="text-pz-muted text-sm">No sessions scheduled.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s) => {
        const isPast = new Date(s.scheduledAt) < new Date();
        return (
          <div key={s.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-pz-outline-variant/30">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-label text-xs px-2 py-0.5 bg-pz-surface-container rounded text-pz-on-surface-variant">
                  Session {s.sessionNumber} of {s.sessionsTotal}
                </span>
              </div>
              <p className="font-headline font-bold text-pz-forest truncate">{s.studentName}</p>
              <p className="font-body text-xs text-pz-muted">{formatDateTime(s.scheduledAt)}</p>
            </div>
            {isPast && (
              <button
                type="button"
                onClick={() => markCompleted(s.id)}
                disabled={isPending}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-pz-outline-variant text-pz-forest font-headline text-xs font-bold hover:bg-pz-surface-container-low transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark Completed
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
