import type { NotReceivingReason, PreviewPerson, RecipientPreview } from "@/lib/data/audience-preview";

export const REASON_TEXT: Record<NotReceivingReason, string> = {
  no_id: "No ID yet",
  no_email: "No email",
  unsubscribed: "Unsubscribed",
  recorded: "Recorded student",
  wrong_module: "Other module",
  unrecognised: "Option not recognised",
};

function Person({ p, reason }: { p: PreviewPerson; reason?: NotReceivingReason }) {
  return (
    <li className="space-y-0.5 border-b border-pz-outline-variant/40 py-2 last:border-b-0">
      <p className="break-words text-base font-medium text-pz-on-surface">{p.name || "(no name)"}</p>
      {p.email && <p className="break-all text-base text-pz-on-surface-variant">{p.email}</p>}
      {p.optionLabel && <p className="break-words text-base text-pz-on-surface-variant">{p.optionLabel}</p>}
      {reason && <p className="text-base font-headline font-bold text-pz-on-surface">{REASON_TEXT[reason]}</p>}
    </li>
  );
}

/** Two collapsed lists: who would get the email and who would not (with a plain reason each). */
export function RecipientPreviewLists({
  preview, receivingTitle, notReceivingTitle,
}: {
  preview: RecipientPreview;
  receivingTitle: string;
  notReceivingTitle: string;
}) {
  const box = "rounded-lg border border-pz-outline-variant/60";
  const summary = "flex min-h-12 cursor-pointer items-center px-4 font-headline text-base font-bold text-pz-on-surface";
  return (
    <div className="space-y-2">
      <details className={box}>
        <summary className={summary}>{receivingTitle} ({preview.receiving.length})</summary>
        <ul className="px-4 pb-2">
          {preview.receiving.map((p, i) => <Person key={`${p.email}-${i}`} p={p} />)}
        </ul>
      </details>
      <details className={box}>
        <summary className={summary}>{notReceivingTitle} ({preview.notReceiving.length})</summary>
        <ul className="px-4 pb-2">
          {preview.notReceiving.map((p, i) => <Person key={`${p.email}-${i}`} p={p} reason={p.reason} />)}
        </ul>
      </details>
    </div>
  );
}
