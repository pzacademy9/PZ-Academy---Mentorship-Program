import { blockedReasonLabel, type BlockedAttemptJson } from "@/lib/crm/sales-admin-ui";
import { formatDateTime } from "@/lib/format";

const COLS = "lg:grid lg:grid-cols-[1.2fr_1fr_1fr_1fr_2fr] lg:items-center lg:gap-4";

export function BlockedLog({ rows }: { rows: BlockedAttemptJson[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-headline font-bold text-lg text-pz-on-surface">Blocked attempts (latest 100)</h2>
        <p className="text-xs text-pz-on-surface-variant mt-0.5">Repeated taps are logged once a minute.</p>
      </div>
      {rows.length === 0 ? (
        <p className="bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm text-sm text-pz-on-surface-variant">Nothing blocked yet.</p>
      ) : (
        <div className="lg:bg-pz-surface-container-lowest lg:rounded-xl lg:shadow-sm lg:overflow-hidden">
          <div className={`hidden ${COLS} bg-pz-surface-container-low text-pz-on-surface-variant font-headline font-bold uppercase tracking-wider text-[11px] py-3 px-5`}>
            <span>When</span>
            <span>Number</span>
            <span>Agent</span>
            <span>Contact</span>
            <span>What happened</span>
          </div>
          <ul className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-pz-surface-container-low">
            {rows.map((r) => (
              <li key={r.id} className={`bg-pz-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-1 text-sm font-body text-pz-on-surface lg:rounded-none lg:shadow-none lg:py-3 lg:px-5 ${COLS}`}>
                <span className="text-xs text-pz-on-surface-variant">{formatDateTime(r.created_at)}</span>
                <span><span className="lg:hidden text-xs text-pz-on-surface-variant">Number: </span>{r.number_label ?? "—"}</span>
                <span><span className="lg:hidden text-xs text-pz-on-surface-variant">Agent: </span>{r.agent_name ?? "—"}</span>
                <span><span className="lg:hidden text-xs text-pz-on-surface-variant">Contact: </span>{r.contact_name ?? "—"}</span>
                <span className="font-semibold">{blockedReasonLabel(r.reason)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
