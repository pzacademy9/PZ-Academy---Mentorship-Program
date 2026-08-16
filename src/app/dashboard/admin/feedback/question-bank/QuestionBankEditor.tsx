"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Info, Star, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionBankEntry, FeedbackQuestionType } from "@/lib/data/feedback-question-bank";

type QuestionType = FeedbackQuestionType;

interface Row {
  localId: string;
  text: string;
  type: QuestionType;
  isMentorshipDefault: boolean;
}

function newLocalId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

/** Small star/video segmented toggle, matching the one in NewSessionModal. */
function TypeToggle({ value, onChange }: { value: QuestionType; onChange: (type: QuestionType) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        title="Star rating"
        aria-label="Star rating"
        onClick={() => onChange("stars")}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          value === "stars"
            ? "bg-pz-primary-container/40 text-pz-on-primary-container"
            : "text-pz-on-surface-variant hover:bg-pz-surface-container-high",
        )}
      >
        <Star className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="Video response"
        aria-label="Video response"
        onClick={() => onChange("video")}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          value === "video"
            ? "bg-pz-primary-container/40 text-pz-on-primary-container"
            : "text-pz-on-surface-variant hover:bg-pz-surface-container-high",
        )}
      >
        <Video className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function QuestionBankEditor({ initialQuestions }: { initialQuestions: QuestionBankEntry[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<Row[]>(() =>
    initialQuestions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => ({
        localId: newLocalId(),
        text: q.text,
        type: q.type,
        isMentorshipDefault: q.isMentorshipDefault,
      })),
  );

  function addRow() {
    setRows((prev) => [...prev, { localId: newLocalId(), text: "", type: "stars", isMentorshipDefault: false }]);
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

  function save() {
    const clean = rows.filter((r) => r.text.trim().length > 0);
    if (clean.length === 0) {
      toast.error("Add at least one question before saving.");
      return;
    }

    startTransition(async () => {
      // Full-replace semantics: the API clears the entire feedback_question_bank
      // table and re-inserts this list (see saveQuestionBank in
      // src/lib/data/feedback-question-bank.ts). This is NOT a merge/patch —
      // every question currently in the bank must be represented in `rows`,
      // or it will be dropped on save.
      const res = await fetch("/api/admin/feedback/question-bank", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          clean.map((r, i) => ({
            text: r.text.trim(),
            type: r.type,
            order: i,
            isMentorshipDefault: r.isMentorshipDefault,
          })),
        ),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not save the question bank.");
        return;
      }

      toast.success("Question bank saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/feedback"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to sessions
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap mt-3">
          <div>
            <h1 className="font-headline font-bold text-2xl text-pz-secondary">Question Bank</h1>
            <p className="font-body text-pz-on-surface-variant text-sm mt-1">
              The default set of questions offered when creating a new feedback session.
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : "Save Question Bank"}
          </button>
        </div>
      </div>

      <div className="flex gap-2 items-start bg-pz-surface-container p-3 rounded-lg border border-pz-outline-variant/40">
        <Info className="w-4 h-4 text-pz-tertiary shrink-0 mt-0.5" />
        <p className="font-body text-xs text-pz-tertiary leading-relaxed">
          Saving replaces the entire question bank — this is a full swap, not a merge. Any question you remove
          below is gone from the bank once you save. Existing sessions and their already-collected responses are
          unaffected.
        </p>
      </div>

      <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-4 sm:p-6">
        {rows.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant text-center py-6">
            No questions yet — add one below.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={r.localId}
                className="flex items-start gap-3 bg-pz-surface-container p-3 rounded-xl border border-pz-outline-variant/40"
              >
                <div className="flex flex-col shrink-0 mt-0.5">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => moveRow(i, -1)}
                    className="p-0.5 rounded text-pz-on-surface-variant hover:text-pz-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === rows.length - 1}
                    onClick={() => moveRow(i, 1)}
                    className="p-0.5 rounded text-pz-on-surface-variant hover:text-pz-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  type="text"
                  value={r.text}
                  onChange={(e) => updateRow(r.localId, { text: e.target.value })}
                  placeholder="Type a question…"
                  className="flex-1 bg-transparent border-b border-pz-outline-variant/60 focus:border-pz-primary outline-none font-body text-sm text-pz-on-surface py-1.5"
                />

                <TypeToggle value={r.type} onChange={(type) => updateRow(r.localId, { type })} />

                <label
                  className="flex items-center gap-1.5 shrink-0 mt-1.5 cursor-pointer"
                  title="Included by default on 1:1 mentorship session feedback"
                >
                  <input
                    type="checkbox"
                    checked={r.isMentorshipDefault}
                    onChange={(e) => updateRow(r.localId, { isMentorshipDefault: e.target.checked })}
                    className="w-4 h-4 rounded border-pz-outline-variant text-pz-primary focus:ring-pz-primary/30 cursor-pointer"
                  />
                  <span className="font-body text-xs text-pz-on-surface-variant whitespace-nowrap hidden sm:inline">
                    Mentorship default
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => removeRow(r.localId)}
                  aria-label="Remove question"
                  className="p-1.5 mt-0.5 rounded text-pz-on-surface-variant hover:text-pz-danger transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addRow}
          className="mt-4 inline-flex items-center gap-1.5 font-headline text-xs font-semibold text-pz-primary hover:text-pz-on-primary-container transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add question
        </button>
      </div>
    </div>
  );
}
