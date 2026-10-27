import type { LeaderRow } from "@/lib/data/quiz-results";

/** Combined ranking of a batch (live students only). Names, IDs and scores only: never emails. */
export function BatchLeaderboard({ rows, sessionCount }: { rows: LeaderRow[]; sessionCount: number }) {
  return (
    <section className="space-y-2" aria-label="Batch ranking">
      <div>
        <h2 className="font-headline text-base font-bold text-pz-on-surface">Batch ranking</h2>
        <p className="text-xs text-pz-on-surface-variant">Live students only. Recorded students are not ranked.</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-pz-outline-variant p-4 text-sm text-pz-on-surface-variant">
          No quiz results saved for this batch yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pz-outline-variant/60">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-pz-surface-container-low text-xs font-headline font-bold text-pz-on-surface-variant">
              <tr>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Quizzes</th>
                <th className="px-3 py-2 text-right">Average</th>
                <th className="px-3 py-2 text-right">
                  Projected total
                  <span className="block font-normal">if they keep this pace, {sessionCount} sessions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pz-outline-variant/40 text-pz-on-surface">
              {rows.map((r) => (
                <tr key={r.personId}>
                  <td className="px-3 py-2 font-bold">{r.rank}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-pz-on-surface-variant">{r.pzId}</td>
                  <td className="px-3 py-2 text-right font-bold">{r.total.toLocaleString("en-US")}</td>
                  <td className="px-3 py-2 text-right">{r.quizzes}</td>
                  <td className="px-3 py-2 text-right">{r.avgPct === null ? "-" : `${r.avgPct}%`}</td>
                  <td className="px-3 py-2 text-right text-pz-on-surface-variant">{r.projectedTotal === null ? "-" : r.projectedTotal.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
