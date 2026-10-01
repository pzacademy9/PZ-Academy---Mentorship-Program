"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, Presentation, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { CourseType } from "@/lib/validations/admin-lms";

/**
 * "mentorship" exists in the course_type enum but is deliberately unused
 * (see the approved plan) — the business runs exactly three program types.
 */
const SELECTABLE_TYPES: { value: CourseType; label: string; hint: string; icon: typeof GraduationCap }[] = [
  { value: "course", label: "Course", hint: "6+ sessions, grouped into modules", icon: GraduationCap },
  { value: "workshop", label: "Workshop", hint: "3+ sessions, flat list", icon: Presentation },
  { value: "webinar", label: "Webinar", hint: "1 session, flat list", icon: Video },
];

function initialTypeFromQuery(value: string | null): CourseType {
  return SELECTABLE_TYPES.some((option) => option.value === value) ? (value as CourseType) : "course";
}

export function NewCourseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CourseType>(() => initialTypeFromQuery(searchParams.get("type")));

  const { run: submit, pending: creating } = useAsyncAction(async () => {
    if (!title.trim()) {
      toast.error("Give the program a title first.");
      return;
    }

    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), type }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not create this program.");
        return;
      }

      const { id } = (await res.json()) as { id: string };
      toast.success("Draft created — fill in the rest below.");
      startTransition(() => router.push(`/dashboard/admin/courses/${id}`));
    } catch {
      toast.error("Could not create this program.");
    }
  });

  return (
    <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-4 md:p-6 space-y-6">
      <div>
        <label className="block font-headline text-sm font-semibold text-pz-on-surface mb-2">
          Program Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Advanced Sterile Compounding"
          className="w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary"
        />
      </div>

      <div>
        <label className="block font-headline text-sm font-semibold text-pz-on-surface mb-2">
          Program Type
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SELECTABLE_TYPES.map((option) => {
            const selected = option.value === type;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors",
                  selected
                    ? "border-pz-primary bg-pz-primary-container/10"
                    : "border-pz-outline-variant hover:border-pz-primary/40",
                )}
              >
                <option.icon className={cn("w-5 h-5", selected ? "text-pz-primary" : "text-pz-on-surface-variant")} />
                <span className="font-headline font-bold text-sm text-pz-on-surface">{option.label}</span>
                <span className="font-body text-xs text-pz-on-surface-variant">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-md:sticky max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={creating || isNavigating}
          onClick={() => submit()}
          className="w-full py-3 max-md:min-h-11 bg-pz-primary text-pz-on-primary font-headline font-bold rounded-lg hover:opacity-90 transition-opacity"
        >
          {creating || isNavigating ? "Creating…" : "Create Draft"}
        </Button>
      </div>
    </div>
  );
}
