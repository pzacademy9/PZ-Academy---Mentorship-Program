import { MessageCircle, NotebookPen, UserPlus, Star, PartyPopper, X, History } from "lucide-react";
import { activityLabel, type TimelineEntryJson } from "@/lib/crm/sales-ui";
import { formatDateTime, relativeTime } from "@/lib/format";

const ICON: Record<string, typeof History> = {
  sent: MessageCircle, replied: MessageCircle, interested: Star, bought: PartyPopper,
  not_interested: X, note: NotebookPen, claimed: UserPlus, reassigned: UserPlus, released: UserPlus,
};

const DOT: Record<string, string> = {
  interested: "bg-pz-primary text-pz-on-primary",
  bought: "bg-pz-primary text-pz-on-primary",
  sent: "bg-pz-secondary-fixed text-pz-on-secondary-fixed",
  replied: "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed",
  not_interested: "bg-pz-error-container text-pz-on-error-container",
};
const DOT_DEFAULT = "bg-pz-surface-container-high text-pz-on-surface-variant";

export function Timeline({ entries }: { entries: TimelineEntryJson[] }) {
  return (
    <section className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
      <h3 className="text-base font-headline font-bold text-pz-on-surface">Timeline</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-pz-on-surface-variant">Nothing has happened with this contact yet.</p>
      ) : (
        <ol className="relative flex flex-col gap-5 border-l-2 border-pz-surface-container-high pl-6 ml-2.5">
          {entries.map((e) => {
            const Icon = ICON[e.kind] ?? History;
            return (
              <li key={e.id} className="relative flex flex-col gap-1">
                <span className={`absolute -left-[37px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center shadow-sm ${DOT[e.kind] ?? DOT_DEFAULT}`}>
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <time dateTime={e.created_at} title={formatDateTime(e.created_at)} className="text-xs font-headline font-bold text-pz-on-surface">
                    {relativeTime(e.created_at)}
                  </time>
                  {e.agent_name && <span className="text-xs text-pz-on-surface-variant">{`· ${e.agent_name}`}</span>}
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-headline font-bold bg-pz-primary-container text-pz-on-primary-container">
                    {activityLabel(e.kind)}
                  </span>
                </div>
                {e.body && (
                  <p className="bg-pz-surface-container-low p-2.5 rounded-lg text-xs text-pz-on-surface-variant mt-1 whitespace-pre-wrap">
                    {`“${e.body}”`}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
