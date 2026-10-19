import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Switch between the two places an enrollment can come from. Same pill treatment as
 * EnrollmentFilterTabs; plain links so each tab is its own page.
 */
export function EnrollmentSourceTabs({ active }: { active: "app" | "page" }) {
  const tabs = [
    { key: "app", label: "App sign-ups", href: "/dashboard/admin/enrollments" },
    { key: "page", label: "Page registrations", href: "/dashboard/admin/enrollments/registrations" },
  ] as const;
  return (
    <nav aria-label="Enrollment source" className="flex gap-2 flex-wrap">
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "px-5 py-2 rounded-full font-headline text-sm transition-all",
              selected
                ? "bg-pz-primary-container text-pz-on-primary-container font-semibold"
                : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
