"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { markLessonComplete } from "@/app/portal/actions";
import { cn } from "@/lib/utils";

interface MarkCompleteButtonProps {
  courseSlug: string;
  lessonId: string;
  completed: boolean;
  hasNext: boolean;
}

export function MarkCompleteButton({
  courseSlug,
  lessonId,
  completed,
  hasNext,
}: MarkCompleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(completed);

  if (done) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg bg-pz-success/10 dark:bg-pz-success/15 text-pz-success text-sm font-semibold px-5 py-2.5">
        <CheckCircle2 className="w-4 h-4" /> Completed
      </span>
    );
  }

  function handleClick() {
    startTransition(async () => {
      const res = await markLessonComplete(courseSlug, lessonId);
      if (!res.ok) {
        toast.error(res.error ?? "Could not mark complete.");
        return;
      }
      setDone(true);
      toast.success(
        hasNext ? "Lesson complete — next lesson unlocked! 🎉" : "Lesson complete! 🎉",
      );
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-pz-forest text-white text-sm font-bold px-5 py-2.5 shadow-md transition-all hover:opacity-90",
        isPending && "opacity-70 cursor-wait",
      )}
    >
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      Mark Complete
    </button>
  );
}
