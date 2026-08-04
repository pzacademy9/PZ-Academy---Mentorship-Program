"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Lock, PlayCircle, FileText, File, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CurriculumModule, LessonContentType, ProgressStatus } from "@/lib/data/lms";

function ContentIcon({ type, className }: { type: LessonContentType; className?: string }) {
  if (type === "video") return <PlayCircle className={className} />;
  if (type === "pdf") return <File className={className} />;
  return <FileText className={className} />;
}

function StatusIcon({
  status,
  type,
  active,
}: {
  status: ProgressStatus;
  type: LessonContentType;
  active: boolean;
}) {
  if (status === "completed") return <CheckCircle2 className="w-[18px] h-[18px] text-pz-primary shrink-0" />;
  if (status === "locked") return <Lock className="w-[18px] h-[18px] text-pz-on-surface-variant/60 shrink-0" />;
  return (
    <ContentIcon
      type={type}
      className={cn(
        "w-[18px] h-[18px] shrink-0",
        active ? "text-pz-on-primary-container" : "text-pz-primary",
      )}
    />
  );
}

interface CourseSidebarProps {
  slug: string;
  modules: CurriculumModule[];
}

export function CourseSidebar({ slug, modules }: CourseSidebarProps) {
  const pathname = usePathname();
  const totalLessons = modules.reduce((n, m) => n + m.lessons.length, 0);
  const completedLessons = modules.reduce(
    (n, m) => n + m.lessons.filter((l) => l.status === "completed").length,
    0,
  );

  return (
    <nav className="flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <p className="text-[11px] font-label font-bold uppercase tracking-widest text-pz-secondary/80 mb-1">
          Course Progress
        </p>
        <p className="text-xs font-body text-pz-on-surface-variant">
          {completedLessons} / {totalLessons} lessons completed
        </p>
      </div>
      <div className="flex flex-col gap-4 px-3 pb-6">
        {modules.map((mod) => (
          <div key={mod.moduleId}>
            <p className="px-2 mb-1 text-[11px] font-label font-bold uppercase tracking-wide text-pz-on-surface-variant">
              {mod.title}
            </p>
            <ul className="space-y-0.5">
              {mod.lessons.map((lesson) => {
                const href = `/portal/${slug}/lessons/${lesson.lessonId}`;
                const active = pathname === href;
                const locked = lesson.status === "locked";
                const inner = (
                  <span
                    className={cn(
                      "flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-label transition-all",
                      active
                        ? "bg-pz-secondary-container text-pz-on-secondary-container font-semibold shadow-sm"
                        : locked
                          ? "text-pz-on-surface-variant/70 cursor-not-allowed opacity-60"
                          : "text-pz-on-surface hover:bg-pz-surface-container-high",
                    )}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <StatusIcon status={lesson.status} type={lesson.contentType} active={active} />
                      <span className="truncate">{lesson.title}</span>
                    </span>
                    {locked && (
                      <span className="text-[9px] bg-pz-surface-container-highest text-pz-on-surface-variant px-1.5 py-0.5 rounded uppercase font-bold shrink-0">
                        Locked
                      </span>
                    )}
                  </span>
                );
                return (
                  <li key={lesson.lessonId}>
                    {locked ? (
                      <div title="Complete the previous lesson to unlock">{inner}</div>
                    ) : (
                      <Link href={href}>{inner}</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {modules.length === 0 && (
          <p className="px-2 py-6 text-sm font-body text-pz-on-surface-variant flex items-center gap-2">
            <Circle className="w-4 h-4" /> No lessons yet.
          </p>
        )}
      </div>
    </nav>
  );
}
