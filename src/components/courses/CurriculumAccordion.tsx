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
    <div className="space-y-4">
      {modules.map((mod, i) => (
        <div
          key={mod.moduleId}
          className="border border-pz-outline-variant/50 rounded-xl overflow-hidden bg-pz-surface-container-lowest shadow-sm"
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between p-5 hover:bg-pz-surface-container-low transition-colors"
            aria-expanded={open === i}
          >
            <div className="flex items-center gap-4">
              <span className="w-8 h-8 shrink-0 rounded-full bg-pz-primary/10 text-pz-primary flex items-center justify-center font-headline font-bold text-sm">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="text-left">
                <h4 className="font-headline font-bold text-pz-on-surface">{mod.title}</h4>
                <p className="text-xs text-pz-on-surface-variant font-body">
                  {mod.lessons.length} lesson{mod.lessons.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                "w-5 h-5 shrink-0 text-pz-on-surface-variant transition-transform duration-300",
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
            <ul className="px-5 pb-5 space-y-3">
              {mod.lessons.map((lesson) => {
                const Icon = CONTENT_ICON[lesson.contentType];
                const locked = lesson.status === "locked";
                return (
                  <li
                    key={lesson.lessonId}
                    className="flex items-center justify-between py-2 border-b border-pz-outline-variant/20 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      {locked ? (
                        <Lock className="w-4 h-4 shrink-0 text-pz-on-surface-variant" />
                      ) : lesson.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-pz-primary" />
                      ) : (
                        <Icon className="w-4 h-4 shrink-0 text-pz-on-surface-variant" />
                      )}
                      <span
                        className={cn(
                          "text-sm font-body",
                          locked ? "text-pz-on-surface-variant/70" : "text-pz-on-surface font-medium",
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
        <p className="text-sm text-pz-on-surface-variant font-body text-center py-8">
          Curriculum coming soon.
        </p>
      )}
    </div>
  );
}
