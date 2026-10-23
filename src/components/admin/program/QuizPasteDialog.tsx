"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { parseQuizPaste, QUIZ_PASTE_EXAMPLE, type ParsedQuestion } from "@/lib/lms/quiz-paste";

const CHUNK = 200;

function serialize(q: ParsedQuestion): string {
  const options = q.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join("\n");
  return `${q.question}\n${options}\nAnswer: ${String.fromCharCode(65 + q.correctIndex)}`;
}

/**
 * Paste many questions at once. `onAdded(n)` is called once with the total
 * number of questions created (also after a partial failure, with the count
 * that did get saved). The parent refetches the lesson to get the new rows.
 */
export function QuizPasteDialog({
  lessonId,
  open,
  onOpenChange,
  onAdded,
}: {
  lessonId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (created: number) => void;
}) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const { questions, errors } = useMemo(() => parseQuizPaste(text), [text]);
  const blocked = errors.length > 0 || questions.length === 0;

  const { run: add, pending } = useAsyncAction(async () => {
    let created = 0;
    let serverMessage: string | null = null;
    let failed = false;
    try {
      for (let i = 0; i < questions.length; i += CHUNK) {
        const chunk = questions.slice(i, i + CHUNK);
        const res = await fetch(`/api/admin/lessons/${lessonId}/quiz-questions/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: chunk }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          serverMessage = body?.error ?? null;
          throw new Error("bulk failed");
        }
        created += chunk.length;
      }
    } catch {
      failed = true;
    }
    if (created > 0) onAdded(created);
    if (!failed) {
      setNote(null);
      onOpenChange(false);
      setText("");
      return;
    }
    // Keep the dialog open. Drop what already saved so a retry cannot duplicate it.
    const left = questions.slice(created);
    if (created > 0) setText(left.map(serialize).join("\n\n"));
    const reason = serverMessage ?? "Something went wrong.";
    setNote(
      created > 0
        ? `${created} saved, ${left.length} left to add. ${reason} Press Add again to retry.`
        : `Nothing was added. ${reason}`,
    );
    toast.error(created > 0 ? `Added ${created} questions, but ${left.length} were not saved.` : reason);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-headline">Paste many questions</DialogTitle>
          <DialogDescription>
            Paste questions from Word, a PDF or ChatGPT. Each question needs its answer choices (A, B, C...) and a line
            like &quot;Answer: B&quot;. Leave a blank line between questions.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setNote(null);
          }}
          placeholder={QUIZ_PASTE_EXAMPLE}
          rows={10}
          aria-label="Paste questions here"
          className="w-full bg-pz-surface border border-pz-outline-variant rounded-lg px-4 py-3 focus:ring-2 focus:ring-pz-primary focus:outline-none font-mono text-sm max-md:text-base"
        />

        {note && (
          <p role="status" className="rounded-lg border border-pz-warning/40 bg-pz-warning/10 p-3 text-sm font-bold">
            {note}
          </p>
        )}

        {errors.length > 0 && (
          <div role="alert" className="rounded-lg border border-pz-solid-danger/40 bg-pz-solid-danger/5 p-3 space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-bold text-pz-danger">
              <AlertTriangle className="w-4 h-4" />
              {errors.length === 1 ? "1 problem to fix before adding" : `${errors.length} problems to fix before adding`}
            </p>
            <ul className="text-sm text-pz-danger space-y-0.5">
              {errors.map((e, i) => (
                <li key={i}>
                  Question {e.questionNumber} (line {e.line}): {e.message.replace(/^Question \d+:\s*/, "")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {questions.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-headline font-bold text-sm text-pz-on-surface">
              Preview ({questions.length} {questions.length === 1 ? "question" : "questions"} ready)
            </h4>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {questions.map((q, qi) => (
                <li key={qi} className="bg-pz-surface rounded-lg border border-pz-outline-variant p-3 space-y-1.5">
                  <p className="text-sm font-medium">
                    <span className="text-pz-on-surface-variant font-black text-[10px] mr-2">Q{qi + 1}</span>
                    {q.question}
                  </p>
                  <ul className="space-y-1">
                    {q.options.map((o, oi) => (
                      <li
                        key={oi}
                        className={cn(
                          "flex items-center gap-2 text-xs p-1.5 rounded border",
                          oi === q.correctIndex
                            ? "bg-pz-primary-container/20 border-pz-primary font-bold"
                            : "bg-pz-surface-container border-pz-outline-variant",
                        )}
                      >
                        {oi === q.correctIndex && <CheckCircle2 className="w-3.5 h-3.5 text-pz-primary shrink-0" />}
                        {String.fromCharCode(65 + oi)}) {o}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="bare"
            size="bare"
            onClick={() => onOpenChange(false)}
            className="px-5 py-2 max-md:min-h-11 border border-pz-outline-variant rounded-lg font-bold text-sm"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="bare"
            size="bare"
            loading={pending}
            disabled={blocked}
            onClick={() => add()}
            className="px-5 py-2 max-md:min-h-11 bg-pz-primary text-pz-on-primary rounded-lg font-bold text-sm disabled:opacity-50"
          >
            {`Add ${questions.length} ${questions.length === 1 ? "question" : "questions"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
