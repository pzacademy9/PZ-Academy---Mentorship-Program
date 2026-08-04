import { cn } from "@/lib/utils";

interface CourseProgressBarProps {
  pct: number;
  className?: string;
  showLabel?: boolean;
}

export function CourseProgressBar({ pct, className, showLabel = false }: CourseProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex-1 h-2 rounded-full bg-pz-border/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-pz-lime transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-semibold text-pz-muted tabular-nums shrink-0">{clamped}%</span>
      )}
    </div>
  );
}
