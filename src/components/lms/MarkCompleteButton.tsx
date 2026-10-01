"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Check } from "lucide-react";
import { toast } from "sonner";
import { markLessonComplete } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";

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
  const [isRefreshing, startTransition] = useTransition();
  const [done, setDone] = useState(completed);

  const { run: handleClick, pending: saving } = useAsyncAction(async () => {
    try {
      const res = await markLessonComplete(courseSlug, lessonId);
      if (!res.ok) {
        toast.error(res.error ?? "Could not mark complete.");
        return;
      }
      setDone(true);
      toast.success(
        hasNext ? "Lesson complete — next lesson unlocked! 🎉" : "Lesson complete! 🎉",
      );
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not mark complete.");
    }
  });

  if (done) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg bg-pz-success/10 dark:bg-pz-success/15 text-pz-success text-sm font-semibold px-5 py-2.5">
        <CheckCircle2 className="w-4 h-4" /> Completed
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="bare"
      size="bare"
      loading={saving || isRefreshing}
      onClick={() => handleClick()}
      className="gap-2 rounded-lg bg-pz-forest text-white text-sm font-bold px-5 py-2.5 max-md:min-h-11 shadow-md transition-all hover:opacity-90"
    >
      <Check className="w-4 h-4" />
      Mark Complete
    </Button>
  );
}
