"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, CheckCircle2, NotebookPen, ChevronDown, ChevronUp } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { UpcomingSession } from "@/lib/data/mentorship-sessions";

export function UpcomingSessionsList({ sessions }: { sessions: UpcomingSession[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

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

  function saveNotes(sessionId: string) {
    const notes = draftNotes[sessionId] ?? "";
    startTransition(async () => {
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
        const isExpanded = expandedId === s.id;
        return (
          <div key={s.id} className="rounded-lg border border-pz-outline-variant/30 overflow-hidden">
            <div className="flex items-center justify-between gap-4 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-label text-xs px-2 py-0.5 bg-pz-surface-container rounded text-pz-on-surface-variant">
                    Session {s.sessionNumber} of {s.sessionsTotal}
                  </span>
                </div>
                <p className="font-headline font-bold text-pz-forest truncate">{s.studentName}</p>
                <p className="font-body text-xs text-pz-muted">{formatDateTime(s.scheduledAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : s.id);
                    setDraftNotes((prev) => (s.id in prev ? prev : { ...prev, [s.id]: s.mentorNotes ?? "" }));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-pz-outline-variant text-pz-forest font-headline text-xs font-bold hover:bg-pz-surface-container-low transition-colors"
                >
                  <NotebookPen className="w-3.5 h-3.5" />
                  Notes
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {isPast && (
                  <button
                    type="button"
                    onClick={() => markCompleted(s.id)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-pz-outline-variant text-pz-forest font-headline text-xs font-bold hover:bg-pz-surface-container-low transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Completed
                  </button>
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
                  className="w-full mt-2 rounded-lg border border-pz-outline-variant/40 p-2.5 text-sm font-body text-pz-forest disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => saveNotes(s.id)}
                  disabled={isPending}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-pz-forest text-white font-headline text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Save Notes
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
