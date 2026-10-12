import type { PageStatus } from "@/lib/landing/content";
import { cn } from "@/lib/utils";

const LABEL: Record<PageStatus, string> = { draft: "Draft", published: "Live", closed: "Closed" };
const STYLE: Record<PageStatus, string> = {
  published: "bg-pz-primary-container text-pz-on-primary-container",
  draft: "bg-pz-surface-container-high text-pz-on-surface-variant",
  closed: "bg-pz-secondary-container text-pz-on-secondary-container",
};

export function StatusBadge({ status, className }: { status: PageStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 font-headline text-xs font-semibold", STYLE[status], className)}>
      {LABEL[status]}
    </span>
  );
}

export function UnpublishedChip({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-pz-secondary-container px-2.5 py-0.5 font-headline text-xs font-semibold text-pz-on-secondary-container", className)}>
      Unpublished changes
    </span>
  );
}
