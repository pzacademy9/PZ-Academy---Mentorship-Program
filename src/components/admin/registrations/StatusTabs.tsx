import Link from "next/link";
import { cn } from "@/lib/utils";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { REGISTRATION_STATUS_LABELS } from "./RegistrationStatusBadge";
import { registrationHref, type RegistrationQuery } from "./query";

const TABS: (RegistrationStatus | "all")[] = ["all", "pending", "reserved", "underpaid", "paid", "free"];

/**
 * The status tabs: links, so each one keeps every other filter and goes back to page 1.
 * Plain server-compatible component. `scroll` makes the row one line that slides sideways
 * on phone only (campaign page); from md up, and by default, it wraps onto more lines.
 */
export function StatusTabs({
  basePath,
  filters,
  counts,
  scroll,
}: {
  basePath: string;
  filters: RegistrationQuery;
  counts: Record<RegistrationStatus | "all", number>;
  scroll?: boolean;
}) {
  const active = filters.status && filters.status !== "all" ? filters.status : "all";
  return (
    <div
      className={cn(
        "flex gap-2",
        scroll
          ? "flex-wrap max-md:flex-nowrap max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
          : "flex-wrap",
      )}
    >
      {TABS.map((tab) => {
        const selected = tab === active;
        return (
          <Link
            key={tab}
            href={registrationHref(basePath, filters, { status: tab, p: 1 })}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "px-5 py-2 rounded-full font-headline text-sm transition-all",
              scroll && "max-md:shrink-0",
              selected
                ? "bg-pz-primary-container text-pz-on-primary-container font-semibold"
                : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium",
            )}
          >
            {tab === "all" ? "All" : REGISTRATION_STATUS_LABELS[tab]}
            <span
              className={cn(
                "ml-2 tabular-nums",
                !selected && "text-pz-on-surface-variant/60 dark:text-pz-on-surface-variant/80",
                scroll && selected && "rounded-full bg-pz-on-primary-container/15 px-2 py-0.5 text-xs",
              )}
            >
              {counts[tab]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
