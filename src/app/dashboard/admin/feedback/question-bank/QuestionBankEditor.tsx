"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Info, Star, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
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
          "p-1.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded-md transition-colors",
          value === "stars"
            ? "bg-pz-primary-container/40 text-pz-on-primary-container dark:text-pz-primary"
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
          "p-1.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded-md transition-colors",
          value === "video"
            ? "bg-pz-primary-container/40 text-pz-on-primary-container dark:text-pz-primary"
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
  const confirm = useConfirm();

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

  // Live count for the inline warning banner below — mirrors the check in
  // save(), only counting rows with actual text since blank rows are
  // dropped before saving.
  const mentorshipDefaultCount = rows.filter((r) => r.isMentorshipDefault && r.text.trim().length > 0).length;

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

  const { run: save, pending: isPending } = useAsyncAction(async () => {
    const clean = rows.filter((r) => r.text.trim().length > 0);
    if (clean.length === 0) {
      toast.error("Add at least one question before saving.");
      return;
    }

    // Not a hard block — there can be legitimate reasons to go below 3 — but
    // freezeMentorshipFeedbackSession silently skips creating a feedback
    // session for every completed 1:1 mentorship session once the bank has
    // fewer than 3 is_mentorship_default questions, with only a server
    // console.warn. Surface that consequence here, before the admin commits
    // to the save, instead of letting it fail silently downstream.
    const mentorshipDefaultCount = clean.filter((r) => r.isMentorshipDefault).length;
    if (mentorshipDefaultCount < 3) {
      const proceed = await confirm({
        title: "Save anyway?",
        description: `Only ${mentorshipDefaultCount} question${mentorshipDefaultCount === 1 ? "" : "s"} ${mentorshipDefaultCount === 1 ? "is" : "are"} flagged "Mentorship default". Mentorship sessions need at least 3 to auto-create a feedback session when they complete — saving now will silently stop that until you flag more.`,
        confirmLabel: "Save anyway",
      });
      if (!proceed) return;
    }

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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/feedback"
          className="inline-flex items-center gap-2 max-md:min-h-11 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
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
          <Button
            variant="bare"
            size="bare"
            type="button"
            onClick={() => save()}
            loading={isPending}
            className="max-md:hidden inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : "Save Question Bank"}
          </Button>
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

      {mentorshipDefaultCount < 3 && (
        <div className="flex gap-2 items-start bg-pz-solid-danger/10 p-3 rounded-lg border border-pz-solid-danger/30">
          <Info className="w-4 h-4 text-pz-danger shrink-0 mt-0.5" />
          <p className="font-body text-xs text-pz-danger leading-relaxed">
            Only {mentorshipDefaultCount} question{mentorshipDefaultCount === 1 ? "" : "s"} currently flagged
            &ldquo;Mentorship default&rdquo; — 1:1 mentorship sessions need at least 3 to auto-create a feedback
            session when they complete. Below that, completions silently stop generating feedback links.
          </p>
        </div>
      )}

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
                  className="flex-1 max-md:min-w-[10rem] bg-transparent border-b border-pz-outline-variant/60 focus:border-pz-primary outline-none font-body text-sm max-md:text-base max-md:min-h-11 text-pz-on-surface py-1.5"
                />

                <TypeToggle value={r.type} onChange={(type) => updateRow(r.localId, { type })} />

                <label
                  className="flex items-center gap-1.5 shrink-0 mt-1.5 max-md:mt-0 max-md:min-h-11 max-md:min-w-11 max-md:justify-center cursor-pointer"
                  title="Included by default on 1:1 mentorship session feedback"
                >
                  <input
                    type="checkbox"
                    checked={r.isMentorshipDefault}
                    onChange={(e) => updateRow(r.localId, { isMentorshipDefault: e.target.checked })}
                    className="w-4 h-4 max-md:w-5 max-md:h-5 rounded border-pz-outline-variant text-pz-primary focus:ring-pz-primary/30 cursor-pointer"
                  />
                  <span className="font-body text-xs text-pz-on-surface-variant whitespace-nowrap hidden sm:inline">
                    Mentorship default
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => removeRow(r.localId)}
                  aria-label="Remove question"
                  className="p-1.5 mt-0.5 max-md:mt-0 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded text-pz-on-surface-variant hover:text-pz-danger transition-colors shrink-0"
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
          className="mt-4 inline-flex items-center gap-1.5 max-md:min-h-11 font-headline text-xs font-semibold text-pz-primary hover:text-pz-on-primary-container transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add question
        </button>
      </div>

      {/* Phone-only sticky save bar; the desktop button lives in the page header. */}
      <div className="md:hidden max-md:sticky max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
        <Button
          variant="bare"
          size="bare"
          type="button"
          onClick={() => save()}
          loading={isPending}
          className="w-full inline-flex items-center justify-center gap-2 max-md:min-h-11 rounded-full px-5 py-2.5 font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving…" : "Save Question Bank"}
        </Button>
      </div>
    </div>
  );
}
