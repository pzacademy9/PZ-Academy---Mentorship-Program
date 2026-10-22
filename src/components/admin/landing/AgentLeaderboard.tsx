import Link from "next/link";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/landing/registration/format";
import { cn } from "@/lib/utils";
import type { LeaderRow } from "@/lib/landing/agent-stats-rules";

export type Range = "7d" | "30d" | "all";

const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

const pct = (paid: number, registered: number) => (registered > 0 ? Math.min(100, Math.round((paid / registered) * 100)) : 0);

function sumRevenue(rows: LeaderRow[]) {
  const totals = new Map<string, number>();
  for (const r of rows) for (const x of r.revenue) totals.set(x.currency, (totals.get(x.currency) ?? 0) + x.amount);
  return Array.from(totals).map(([currency, amount]) => ({ currency, amount }));
}

function Revenue({ revenue, align = "right" }: { revenue: LeaderRow["revenue"]; align?: "left" | "right" }) {
  if (revenue.length === 0) return <span className="font-body text-sm text-pz-on-surface-variant">No sales yet</span>;
  return (
    <div className={cn("space-y-0.5", align === "right" && "text-right")}>
      {revenue.map((x) => (
        <div key={x.currency} className="font-body text-sm font-semibold text-pz-on-surface">
          {formatMoney(x.amount, x.currency)}
        </div>
      ))}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4">
      <p className="font-body text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function AgentLeaderboard({ rows, range }: { rows: LeaderRow[]; range: Range }) {
  const registered = rows.reduce((n, r) => n + r.registered, 0);
  const paid = rows.reduce((n, r) => n + r.paid, 0);
  const revenue = sumRevenue(rows);
  const noSales = rows.length === 0 || (registered === 0 && paid === 0);
  // In a window, registered counts by registration date and paid by first-Paid date, so a rate can pass 100%: show it for all time only.
  const showRate = range === "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-bold text-pz-secondary">Agent leaderboard</h1>
          <p className="mt-1 font-body text-sm text-pz-on-surface-variant">See which sales agents bring in paying students.</p>
        </div>
        <nav aria-label="Time range" className="flex w-full gap-1 rounded-xl bg-pz-surface-container-high p-1 md:w-auto">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/dashboard/admin/agent-leaderboard?range=${r.key}`}
              aria-current={range === r.key ? "page" : undefined}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-center font-body text-sm font-semibold md:flex-none",
                range === r.key ? "bg-pz-primary text-pz-on-primary" : "text-pz-on-surface-variant hover:text-pz-on-surface",
              )}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No sales agents yet" description="Add sales agents and they will appear here once they share their links." />
      ) : noSales ? (
        <EmptyState
          icon={Trophy}
          title="No sales in this period yet"
          description="Try a longer period, or check back after your agents share their links."
          action={range === "all" ? undefined : { label: "Show all time", href: "/dashboard/admin/agent-leaderboard?range=all" }}
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Tile label="Total registered">
              <p className="font-headline text-3xl font-bold text-pz-on-surface">{registered.toLocaleString("en-US")}</p>
            </Tile>
            <Tile label="Total paid">
              <p className="font-headline text-3xl font-bold text-pz-on-surface">{paid.toLocaleString("en-US")}</p>
              {showRate && <p className="mt-1 font-body text-xs text-pz-on-surface-variant">{pct(paid, registered)}% of registered</p>}
            </Tile>
            <Tile label="Total revenue">
              {revenue.length === 0 ? (
                <p className="font-body text-sm text-pz-on-surface-variant">No payments yet</p>
              ) : (
                <Revenue revenue={revenue} align="left" />
              )}
            </Tile>
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest md:block">
            <table className="w-full text-left">
              <thead className="bg-pz-surface-container-low font-body text-xs uppercase tracking-wide text-pz-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rank</th>
                  <th className="px-4 py-3 font-semibold">Agent</th>
                  <th className="px-4 py-3 text-right font-semibold">Registered</th>
                  <th className="px-4 py-3 text-right font-semibold">Paid</th>
                  {showRate && <th className="px-4 py-3 text-right font-semibold">Paid rate</th>}
                  <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant font-body text-sm">
                {rows.map((r, i) => (
                  <tr key={r.agentId}>
                    <td className="px-4 py-3 text-pz-on-surface-variant">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-pz-on-surface">{r.name.trim() || "Unnamed agent"}</td>
                    <td className="px-4 py-3 text-right">{r.registered}</td>
                    <td className="px-4 py-3 text-right">{r.paid}</td>
                    {showRate && <td className="px-4 py-3 text-right">{pct(r.paid, r.registered)}%</td>}
                    <td className="px-4 py-3"><Revenue revenue={r.revenue} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {rows.map((r, i) => (
              <li key={r.agentId} className="rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4">
                <p className="font-headline text-base font-bold text-pz-on-surface">
                  <span className="mr-2 text-pz-on-surface-variant">#{i + 1}</span>
                  {r.name.trim() || "Unnamed agent"}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-pz-surface-container-low p-3 font-body">
                  <div>
                    <p className="text-xs uppercase text-pz-on-surface-variant">Registered</p>
                    <p className="text-lg font-bold">{r.registered}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-pz-on-surface-variant">Paid</p>
                    <p className="text-lg font-bold">
                      {r.paid}
                      {showRate && <span className="ml-1 text-xs font-semibold text-pz-on-surface-variant">{pct(r.paid, r.registered)}% paid</span>}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3 font-body">
                  <span className="text-sm text-pz-on-surface-variant">Revenue</span>
                  <Revenue revenue={r.revenue} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="font-body text-xs text-pz-on-surface-variant">
        A group registration counts as one sale. Revenue uses the amount received when it is filled in, otherwise the expected amount.
      </p>
    </div>
  );
}
