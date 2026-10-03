"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, CheckCircle2, NotebookPen, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime } from "@/lib/format";
import type { UpcomingSession } from "@/lib/data/mentorship-sessions";

export function UpcomingSessionsList({ sessions }: { sessions: UpcomingSession[] }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const { run: markCompleted, pending: completing, pendingKey: completingId } = useAsyncAction(
    async (sessionId: string) => {
      try {
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
        startTransition(() => router.refresh());
      } catch {
        toast.error("Could not mark this session completed.");
      }
    },
    { getKey: (sessionId) => sessionId },
  );

  const { run: saveNotes, pending: savingNotes, pendingKey: savingNotesId } = useAsyncAction(
    async (sessionId: string) => {
      const notes = draftNotes[sessionId] ?? "";
      try {
        const res = await fetch(`/api/mentor/sessions/${sessionId}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        if (!res.ok) {
          toast.error("Could not save your notes.");
          return;
        }
        toast.success("Notes saved.");
        startTransition(() => router.refresh());
      } catch {
        toast.error("Could not save your notes.");
      }
    },
    { getKey: (sessionId) => sessionId },
  );

  const isPending = completing || savingNotes || isRefreshing;

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No sessions scheduled"
        description="Upcoming student sessions will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s) => {
        const isPast = new Date(s.scheduledAt) < new Date();
        const isExpanded = expandedId === s.id;
        return (
          <div key={s.id} className="rounded-lg border border-pz-outline-variant/30 overflow-hidden">
            <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between md:gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-label text-xs px-2 py-0.5 bg-pz-surface-container rounded text-pz-on-surface-variant">
                    Session {s.sessionNumber} of {s.sessionsTotal}
                  </span>
                </div>
                <p className="font-headline font-bold text-pz-forest truncate">{s.studentName}</p>
                <p className="font-body text-xs text-pz-muted">{formatDateTime(s.scheduledAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                <Button
                  type="button"
                  variant="bare"
                  size="bare"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : s.id);
                    setDraftNotes((prev) => (s.id in prev ? prev : { ...prev, [s.id]: s.mentorNotes ?? "" }));
                  }}
                  className="gap-1.5 px-3 py-2 max-md:min-h-11 rounded-lg border-2 border-pz-outline-variant text-pz-forest font-headline text-xs font-bold hover:bg-pz-surface-container-low transition-colors"
                >
                  <NotebookPen className="w-3.5 h-3.5" />
                  Notes
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
                {isPast && (
                  <Button
                    type="button"
                    variant="bare"
                    size="bare"
                    loading={completingId === s.id}
                    disabled={isPending}
                    onClick={() => void markCompleted(s.id)}
                    className="gap-1.5 px-3 py-2 max-md:min-h-11 rounded-lg border-2 border-pz-outline-variant text-pz-forest font-headline text-xs font-bold hover:bg-pz-surface-container-low transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Completed
                  </Button>
                )}
              </div>
            </div>
            {isExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-pz-outline-variant/20 bg-pz-surface-container-low/50">
                <textarea
                  value={draftNotes[s.id] ?? ""}
                  onChange={(e) => setDraftNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder="Private notes about this student/session — only you can see this."
                  rows={3}
                  disabled={isPending}
                  className="w-full mt-2 rounded-lg border border-pz-outline-variant/40 p-2.5 text-sm max-md:text-base font-body text-pz-forest disabled:opacity-50"
                />
                <Button
                  type="button"
                  variant="bare"
                  size="bare"
                  loading={savingNotesId === s.id}
                  disabled={isPending}
                  onClick={() => void saveNotes(s.id)}
                  className="mt-2 px-3 py-1.5 max-md:min-h-11 rounded-lg bg-pz-solid-forest text-white font-headline text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  Save Notes
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
