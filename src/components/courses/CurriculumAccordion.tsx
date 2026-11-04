"use client";

import { useState } from "react";
import { ChevronDown, Lock, CheckCircle2, PlayCircle, FileText, FileType } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CurriculumModule } from "@/lib/data/lms";

const CONTENT_ICON = {
  video: PlayCircle,
  text: FileText,
  pdf: FileType,
};

export function CurriculumAccordion({ modules }: { modules: CurriculumModule[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {modules.map((mod, i) => (
        <div
          key={mod.moduleId}
          className={cn(
            "overflow-hidden rounded-2xl transition-colors",
            open === i ? "bg-pz-web-surface-high" : "bg-pz-web-surface-low",
          )}
        >
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className="flex min-h-11 w-full items-center justify-between gap-4 p-4 text-left md:p-5"
            aria-expanded={open === i}
          >
            <div className="flex items-center gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pz-solid-deep font-montserrat text-sm font-bold text-pz-bright">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="text-left">
                <h3 className="font-montserrat text-base font-bold text-pz-deep md:text-lg">{mod.title}</h3>
                <p className="font-poppins text-xs text-pz-muted">
                  {mod.lessons.length} lesson{mod.lessons.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-6 w-6 shrink-0 text-pz-deep transition-transform duration-300",
                open === i && "rotate-180",
              )}
            />
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              open === i ? "max-h-[1000px]" : "max-h-0",
            )}
          >
            <ul className="space-y-2 px-4 pb-4 md:px-5 md:pb-5">
              {mod.lessons.map((lesson) => {
                const Icon = CONTENT_ICON[lesson.contentType];
                const locked = lesson.status === "locked";
                return (
                  <li
                    key={lesson.lessonId}
                    className="flex items-center justify-between rounded-xl bg-pz-surface-container-lowest px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {locked ? (
                        <Lock className="h-4 w-4 shrink-0 text-pz-muted" aria-hidden="true" />
                      ) : lesson.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-pz-mid" aria-hidden="true" />
                      ) : (
                        <Icon className="h-4 w-4 shrink-0 text-pz-mid" aria-hidden="true" />
                      )}
                      <span
                        className={cn(
                          "font-poppins text-sm",
                          locked ? "text-pz-muted" : "font-medium text-pz-ink",
                        )}
                      >
                        {lesson.title}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ))}
      {modules.length === 0 && (
        <p className="py-8 text-center font-poppins text-sm text-pz-muted">
          Curriculum coming soon.
        </p>
      )}
    </div>
  );
}
