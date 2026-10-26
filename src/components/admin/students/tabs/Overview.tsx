import { formatDate } from "@/lib/format";
import type { StudentRecordData } from "@/lib/data/admin-students";

export function Overview({ data }: { data: StudentRecordData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4">
        <h2 className="font-headline text-lg font-bold text-pz-on-surface">Recent activity</h2>
        {data.recentActivity.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.recentActivity.map((a, i) => (
              <li key={`${a.at}-${i}`} className="font-body text-sm text-pz-on-surface">
                <span className="block break-words">{a.text}</span>
                <span className="block text-xs text-pz-on-surface-variant">{formatDate(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4">
        <h2 className="font-headline text-lg font-bold text-pz-on-surface">Needs attention</h2>
        {data.attention.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant">Nothing needs attention.</p>
        ) : (
          <ul className="space-y-2">
            {data.attention.map((a) => (
              <li key={a.key} className="font-body text-sm text-pz-on-surface">
                <span className="block font-bold">{a.title}</span>
                <span className="block break-words text-pz-on-surface-variant">{a.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
