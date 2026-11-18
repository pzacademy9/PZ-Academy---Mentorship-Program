import Link from "next/link";
import { ChipTabs } from "@/components/ui/chip-tabs";

export type CohortsTab = "cohorts" | "import" | "merge";

const TABS: { key: CohortsTab; label: string; href: string }[] = [
  { key: "cohorts", label: "Cohorts", href: "/dashboard/admin/sales-hub/cohorts" },
  { key: "import", label: "Import a sheet", href: "/dashboard/admin/sales-hub/import" },
  { key: "merge", label: "Merge review", href: "/dashboard/admin/sales-hub/merge" },
];

/** Tab strip shared by the Cohorts, Import and Merge review pages. */
export function CohortsTabs({ active }: { active: CohortsTab }) {
  return (
    <ChipTabs label="Cohorts sections">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`px-5 py-2 rounded-full font-headline text-sm transition-all ${t.key === active ? "bg-pz-primary-container text-pz-on-primary-container font-semibold" : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium"}`}
        >
          {t.label}
        </Link>
      ))}
    </ChipTabs>
  );
}
