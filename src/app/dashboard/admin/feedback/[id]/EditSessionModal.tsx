"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import { TypeToggle } from "../NewSessionModal";
import type { FeedbackSessionQuestion, FeedbackQuestionType } from "@/lib/data/feedback-sessions";
import type { ResponseDetail } from "@/lib/data/feedback-responses";

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 5;

interface Row {
  localId: string;
  id?: string;
  text: string;
  type: FeedbackQuestionType;
  hasRealAnswer: boolean;
}

function newLocalId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

/** Every question id with at least one non-null star/video answer, across every response. */
function computeAnsweredQuestionIds(responses: ResponseDetail[]): Set<string> {
  const ids = new Set<string>();
  for (const r of responses) {
    for (const [questionId, a] of Object.entries(r.answers)) {
      if (a.starValue != null || a.videoUrl != null) ids.add(questionId);
    }
  }
  return ids;
}

interface EditSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  name: string;
  speakerName: string;
  sessionDate: string | null;
  questions: FeedbackSessionQuestion[];
  responses: ResponseDetail[];
}

/**
 * Edits name/speaker/date/questions — the fields left immutable when
 * mentor-linking and cover-image editing shipped inline on this same
 * page in Phase 2. Reuses this admin area's existing patterns instead of
 * inventing new ones: TypeToggle from NewSessionModal, the
 * ChevronUp/ChevronDown reorder row from QuestionBankEditor.tsx. A
 * question with a real answer can't be removed or retyped — see
 * diffFeedbackQuestions in feedback-sessions.ts for the enforced guard;
 * this component only disables the corresponding buttons for UX.
 */
export function EditSessionModal({
  open,
  onOpenChange,
  sessionId,
  name: initialName,
  speakerName: initialSpeakerName,
  sessionDate: initialSessionDate,
  questions,
  responses,
}: EditSessionModalProps) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [speakerName, setSpeakerName] = useState(initialSpeakerName);
  const [date, setDate] = useState(initialSessionDate ?? "");
  const [rows, setRows] = useState<Row[]>([]);

  // Reset every field from props each time the modal opens, so a previous
  // edit session (opened, changed, cancelled) never leaks into the next.
  useEffect(() => {
    if (!open) return;
    const answered = computeAnsweredQuestionIds(responses);
    setName(initialName);
    setSpeakerName(initialSpeakerName);
    setDate(initialSessionDate ?? "");
    setRows(
      questions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((q) => ({
          localId: newLocalId(),
          id: q.id,
          text: q.text,
          type: q.type,
          hasRealAnswer: answered.has(q.id),
        })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totalQuestions = rows.length;
  const atMax = totalQuestions >= MAX_QUESTIONS;
  const hasBlankText = rows.some((r) => !r.text.trim());

  function addRow() {
    if (atMax) {
      toast.error(`You can have up to ${MAX_QUESTIONS} questions.`);
      return;
    }
    setRows((prev) => [...prev, { localId: newLocalId(), text: "", type: "stars", hasRealAnswer: false }]);
  }

  function removeRow(localId: string) {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  }

  function updateRow(localId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function moveRow(index: number, direction: -1 | 1) {
    setRows((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const { run: save, pending: isPending } = useAsyncAction(async () => {
    if (!name.trim() || !speakerName.trim()) {
      toast.error("Session name and speaker are required.");
      return;
    }
    if (hasBlankText) {
      toast.error("Every question needs text.");
      return;
    }
    if (rows.length < MIN_QUESTIONS) {
      toast.error(`Pick at least ${MIN_QUESTIONS} questions.`);
      return;
    }

    const res = await fetch(`/api/admin/feedback/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        speakerName: speakerName.trim(),
        sessionDate: date || null,
        questions: rows.map((r) => ({ id: r.id, text: r.text.trim(), type: r.type })),
      }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "Could not update this session.");
      return;
    }
    toast.success("Session updated.");
    onOpenChange(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-headline text-pz-on-surface">Edit Session</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-session-name" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Session Name
            </label>
            <input
              id="edit-session-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-speaker-name" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Speaker Name
            </label>
            <input
              id="edit-speaker-name"
              type="text"
              value={speakerName}
              onChange={(e) => setSpeakerName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-session-date" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
            Date
          </label>
          <input
            id="edit-session-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Questions
            </h3>
            <span className="font-body text-xs text-pz-on-surface-variant">
              {totalQuestions} / {MAX_QUESTIONS}
            </span>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={r.localId}
                className="flex flex-wrap items-start gap-3 bg-pz-surface-container p-3 rounded-xl border border-pz-outline-variant/40"
              >
                <div className="flex flex-col shrink-0 mt-0.5">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => moveRow(i, -1)}
                    className="p-0.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded text-pz-on-surface-variant hover:text-pz-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === rows.length - 1}
                    onClick={() => moveRow(i, 1)}
                    className="p-0.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded text-pz-on-surface-variant hover:text-pz-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  type="text"
                  value={r.text}
                  onChange={(e) => updateRow(r.localId, { text: e.target.value })}
                  placeholder="Type a question…"
                  className="flex-1 max-md:min-w-[10rem] bg-transparent border-b border-pz-outline-variant/60 focus:border-pz-primary outline-none font-body text-sm text-pz-on-surface py-1.5 max-md:text-base max-md:min-h-11"
                />

                <TypeToggle value={r.type} onChange={(type) => updateRow(r.localId, { type })} disabled={r.hasRealAnswer} />

                <button
                  type="button"
                  onClick={() => removeRow(r.localId)}
                  disabled={r.hasRealAnswer}
                  aria-label="Remove question"
                  title={r.hasRealAnswer ? "This question already has responses" : "Remove question"}
                  className={cn(
                    "p-1.5 mt-0.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded transition-colors shrink-0",
                    r.hasRealAnswer
                      ? "text-pz-on-surface-variant/40 cursor-not-allowed"
                      : "text-pz-on-surface-variant hover:text-pz-danger",
                  )}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            disabled={atMax}
            className="mt-2 inline-flex items-center gap-1.5 max-md:min-h-11 font-headline text-xs font-semibold text-pz-primary hover:text-pz-on-primary-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            Add question
          </button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <Button
            variant="bare"
            size="bare"
            type="button"
            loading={isPending}
            onClick={() => save()}
            disabled={hasBlankText}
            className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
