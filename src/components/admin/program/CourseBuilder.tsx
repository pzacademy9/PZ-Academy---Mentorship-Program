"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Save, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuilderState, BuilderModule, BuilderLesson } from "@/lib/data/admin-lms";
import { CurriculumMap } from "./CurriculumMap";
import { LessonEditorPanel } from "./LessonEditorPanel";

function firstLesson(modules: BuilderModule[]): BuilderLesson | null {
  for (const mod of modules) {
    if (mod.lessons.length > 0) return mod.lessons[0];
  }
  return null;
}

/**
 * The Builder shell, ported from "Admin: LMS Course Builder". Unlike the
 * Stitch mockup (which draws its own fixed ml-64/mt-20 sidebar+header), this
 * page renders inside the real dashboard shell (Sidebar + Topbar in
 * src/app/dashboard/layout.tsx), so the two-column scroll-independent layout
 * only needs to fill <main>, not the viewport.
 */
export function CourseBuilder({ initialState }: { initialState: BuilderState }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modules, setModules] = useState<BuilderModule[]>(initialState.modules);
  const [isPublished, setIsPublished] = useState(initialState.course.isPublished);
  const [selectedLesson, setSelectedLesson] = useState<BuilderLesson | null>(firstLesson(initialState.modules));

  function setPublished(next: boolean) {
    startTransition(async () => {
      const res = await fetch(`/api/admin/courses/${initialState.course.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: next }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { isPublished?: boolean; warning?: string | null; error?: string }
        | null;

      if (!res.ok) {
        toast.error(payload?.error ?? "Could not update publish state.");
        return;
      }
      setIsPublished(payload?.isPublished ?? next);
      if (payload?.warning) toast.warning(payload.warning);
      toast.success(next ? "Program published." : "Program moved back to draft.");
      router.refresh();
    });
  }

  function selectLesson(lesson: BuilderLesson) {
    setSelectedLesson(lesson);
  }

  function handleModulesChange(next: BuilderModule[]) {
    setModules(next);
    // A reorder can move the selected lesson without changing its identity —
    // nothing to reconcile — but a delete elsewhere might have removed it.
    if (selectedLesson && !next.some((m) => m.lessons.some((l) => l.id === selectedLesson.id))) {
      setSelectedLesson(firstLesson(next));
    }
  }

  /** Keeps the Curriculum Map's row (title/content-type icon) in sync with edits made in the Lesson Editor panel. */
  function handleLessonPatched(lessonId: string, patch: Partial<BuilderLesson>) {
    setModules((prev) =>
      prev.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)),
      })),
    );
    setSelectedLesson((prev) => (prev && prev.id === lessonId ? { ...prev, ...patch } : prev));
  }

  /** "Save & Continue" in the Lesson Editor footer — moves to the next lesson in curriculum order, across module boundaries. */
  function advanceToNextLesson() {
    const flat = modules.flatMap((m) => m.lessons);
    const currentIndex = selectedLesson ? flat.findIndex((l) => l.id === selectedLesson.id) : -1;
    if (currentIndex === -1 || currentIndex === flat.length - 1) {
      toast.info("That was the last session in this program.");
      return;
    }
    setSelectedLesson(flat[currentIndex + 1]);
  }

  return (
    <div className="flex flex-col lg:h-[calc(100vh-7rem)] -m-4 sm:-m-6 lg:overflow-hidden">
      <div className="border-b border-pz-outline-variant bg-pz-surface flex flex-wrap gap-4 justify-between items-center px-4 sm:px-8 py-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-headline text-pz-on-surface">Course Builder</h2>
            <span className="bg-pz-secondary-container/30 text-pz-on-secondary-container text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              Editor
            </span>
          </div>
          <p className="text-sm font-body text-pz-on-surface-variant">{initialState.course.title}</p>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center bg-pz-surface-container rounded-full p-1 border border-pz-outline-variant">
            <span
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                !isPublished ? "bg-pz-surface-container-lowest text-pz-on-surface-variant shadow-sm" : "text-pz-on-surface-variant/60",
              )}
            >
              Draft
            </span>
            <span
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                isPublished ? "bg-pz-primary text-pz-on-primary shadow-sm" : "text-pz-on-surface-variant/60",
              )}
            >
              Published
            </span>
          </div>
          <div className="h-8 w-px bg-pz-outline-variant/50 hidden sm:block" />
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/admin/courses/${initialState.course.id}`}
              className="text-pz-on-surface-variant hover:text-pz-primary transition-colors flex items-center gap-1 font-medium text-sm"
            >
              <Settings className="w-4 h-4" />
              Basics
            </Link>
            <button
              onClick={() => {
                router.refresh();
                toast.info("Everything here saves automatically.");
              }}
              className="text-pz-on-surface-variant hover:text-pz-primary transition-colors flex items-center gap-1 font-medium text-sm"
            >
              <Save className="w-4 h-4" />
              Save Draft
            </button>
            <button
              onClick={() => setPublished(!isPublished)}
              disabled={isPending}
              className="bg-pz-primary text-pz-on-primary px-6 py-2 rounded-lg font-bold text-sm shadow-md hover:opacity-90 transition-all disabled:opacity-50"
            >
              {isPending ? "Working…" : isPublished ? "Unpublish" : "Publish"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 lg:overflow-hidden">
        <section className="lg:col-span-4 lg:border-r border-pz-outline-variant lg:overflow-hidden">
          <CurriculumMap
            courseId={initialState.course.id}
            flat={initialState.flat}
            modules={modules}
            selectedLessonId={selectedLesson?.id ?? null}
            onSelectLesson={selectLesson}
            onModulesChange={handleModulesChange}
          />
        </section>

        <section className="lg:col-span-8 bg-pz-surface-container-lowest lg:overflow-y-auto">
          <LessonEditorPanel
            lesson={selectedLesson}
            courseSlug={initialState.course.slug}
            onLessonPatched={handleLessonPatched}
            onAdvance={advanceToNextLesson}
          />
        </section>
      </div>
    </div>
  );
}
