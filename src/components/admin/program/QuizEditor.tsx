"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, PlusCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { QuizQuestionRow } from "@/lib/data/admin-lms";

type QuestionPatch = Partial<{ question: string; options: string[]; correctIndex: number }>;

export function QuizEditor({
  lessonId,
  questions,
  onQuestionsChange,
}: {
  lessonId: string;
  questions: QuizQuestionRow[];
  onQuestionsChange: (questions: QuizQuestionRow[]) => void;
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { run: addQuestion, pending: adding } = useAsyncAction(async () => {
    const res = await fetch(`/api/admin/lessons/${lessonId}/quiz-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "New question", options: ["Option A", "Option B"], correctIndex: 0 }),
    });
    if (!res.ok) {
      toast.error("Could not add a question.");
      return;
    }
    router.refresh();
  });

  async function saveQuestion(id: string, patch: QuestionPatch) {
    const res = await fetch(`/api/admin/quiz-questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) toast.error("Could not save this question.");
  }

  const { run: deleteQuestion, pending: deleting, pendingKey: deletingId } = useAsyncAction(async (id: string) => {
    const res = await fetch(`/api/admin/quiz-questions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete this question.");
      return;
    }
    onQuestionsChange(questions.filter((q) => q.id !== id));
  }, { getKey: (id) => id });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    const next = arrayMove(questions, oldIndex, newIndex);
    onQuestionsChange(next);
    fetch(`/api/admin/lessons/${lessonId}/quiz-questions/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((q) => q.id) }),
    }).then((res) => {
      if (!res.ok) {
        toast.error("Could not save question order.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-pz-outline-variant pb-2">
        <h4 className="font-headline font-bold text-pz-on-surface">Check for Understanding</h4>
        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={adding}
          onClick={() => addQuestion()}
          className="text-pz-primary font-bold text-sm gap-1 hover:underline max-md:min-h-11"
        >
          <PlusCircle className="w-4 h-4" />
          Add Question
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                index={i}
                question={q}
                onSave={(patch) => saveQuestion(q.id, patch)}
                onDelete={() => deleteQuestion(q.id)}
                deleting={deletingId === q.id}
                deleteDisabled={deleting}
                onLocalChange={(patch) =>
                  onQuestionsChange(questions.map((x) => (x.id === q.id ? { ...x, ...patch } : x)))
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {questions.length === 0 && (
        <p className="text-sm text-pz-on-surface-variant italic text-center py-4">No quiz questions yet.</p>
      )}
    </div>
  );
}

function QuestionCard({
  index,
  question,
  onSave,
  onDelete,
  deleting,
  deleteDisabled,
  onLocalChange,
}: {
  index: number;
  question: QuizQuestionRow;
  onSave: (patch: QuestionPatch) => void;
  onDelete: () => void;
  deleting: boolean;
  deleteDisabled: boolean;
  onLocalChange: (patch: Partial<QuizQuestionRow>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  function updateOption(idx: number, value: string) {
    const next = question.options.map((o, i) => (i === idx ? value : o));
    onLocalChange({ options: next });
  }

  function commitOptions(next: string[], correctIndex?: number) {
    onSave(correctIndex !== undefined ? { options: next, correctIndex } : { options: next });
  }

  function addOption() {
    if (question.options.length >= 6) return;
    const next = [...question.options, `Option ${question.options.length + 1}`];
    onLocalChange({ options: next });
    commitOptions(next);
  }

  function removeOption(idx: number) {
    if (question.options.length <= 2) return;
    const next = question.options.filter((_, i) => i !== idx);
    const nextCorrect = question.correctIndex >= next.length ? 0 : question.correctIndex;
    onLocalChange({ options: next, correctIndex: nextCorrect });
    commitOptions(next, nextCorrect);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-pz-surface p-4 rounded-lg border border-pz-outline-variant flex items-start gap-3"
    >
      <span
        {...attributes}
        {...listeners}
        className="mt-2 text-pz-on-surface-variant/40 cursor-grab active:cursor-grabbing shrink-0 max-md:mt-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
      >
        <GripVertical className="w-4 h-4" />
      </span>
      <div className="bg-pz-surface-container text-pz-on-surface-variant px-2 py-1 rounded text-[10px] font-black mt-1 shrink-0">
        Q{index + 1}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <input
          type="text"
          value={question.question}
          onChange={(e) => onLocalChange({ question: e.target.value })}
          onBlur={(e) => onSave({ question: e.target.value })}
          className="w-full font-medium text-sm max-md:text-base max-md:min-h-11 border-b border-transparent hover:border-pz-outline-variant focus:border-pz-primary outline-none bg-transparent pb-1"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {question.options.map((opt, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 text-xs p-2 rounded border",
                i === question.correctIndex
                  ? "bg-pz-primary-container/20 border-pz-primary"
                  : "bg-pz-surface-container border-pz-outline-variant",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  onLocalChange({ correctIndex: i });
                  onSave({ correctIndex: i });
                }}
                title="Mark correct"
                aria-label="Mark correct"
                className={cn(
                  "max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center",
                  i === question.correctIndex ? "text-pz-primary" : "text-pz-on-surface-variant/40",
                )}
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                onBlur={() => commitOptions(question.options)}
                className="flex-1 min-w-0 bg-transparent outline-none font-medium max-md:text-base max-md:min-h-11"
              />
              {question.options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  aria-label="Remove option"
                  className="text-pz-on-surface-variant/40 hover:text-pz-danger shrink-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        {question.options.length < 6 && (
          <button type="button" onClick={addOption} className="text-xs font-bold text-pz-primary hover:underline max-md:min-h-11">
            + Add option
          </button>
        )}
      </div>
      <Button
        type="button"
        variant="bare"
        size="bare"
        loading={deleting}
        disabled={deleteDisabled}
        onClick={onDelete}
        aria-label="Delete question"
        className="text-pz-on-surface-variant/40 hover:text-pz-danger shrink-0 max-md:min-h-11 max-md:min-w-11"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
