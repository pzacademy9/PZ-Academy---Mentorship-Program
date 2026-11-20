import Link from "next/link";
import type { AdminToolCard } from "@/components/dashboard/nav";

export function AdminToolCards({ tools }: { tools: AdminToolCard[] }) {
  if (tools.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-headline font-bold text-lg text-pz-secondary">Admin tools</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tools.map(({ label, description, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-12 items-center gap-3 rounded-2xl border border-pz-outline-variant/40 bg-pz-surface-container p-4 transition-colors hover:bg-pz-surface-container-high"
          >
            <Icon className="h-5 w-5 shrink-0 text-pz-mid" />
            <span className="min-w-0">
              <span className="block font-headline font-semibold text-sm text-pz-on-surface">{label}</span>
              <span className="block font-body text-xs text-pz-on-surface-variant">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
