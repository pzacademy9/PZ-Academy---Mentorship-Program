import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "all", label: "All students", href: "/dashboard/admin/students" },
  { key: "ids", label: "Student IDs", href: "/dashboard/admin/students/ids" },
] as const;

export type StudentsTabKey = (typeof TABS)[number]["key"];

export function StudentsTabs({ active }: { active: StudentsTabKey }) {
  return (
    <nav aria-label="Students sections" className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 font-body text-sm font-semibold",
              on
                ? "border-pz-primary bg-pz-primary-container text-pz-on-primary-container"
                : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface hover:bg-pz-surface-container-low",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
