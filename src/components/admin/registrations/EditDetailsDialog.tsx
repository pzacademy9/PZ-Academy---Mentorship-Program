"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, Mail, MessageCircle, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";

type Field = "name" | "email" | "whatsapp";

const INPUT =
  "w-full min-h-11 pl-10 pr-3 py-2.5 rounded-lg bg-pz-surface-container-low text-pz-on-surface text-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-pz-primary disabled:opacity-60";

export const DIALOG_SURFACE = "bg-pz-surface-container-lowest text-pz-on-surface border-pz-outline-variant/40 sm:rounded-2xl";
export const BTN_CANCEL =
  "px-5 py-2.5 max-md:min-h-11 rounded-lg text-sm font-headline font-semibold text-pz-on-surface-variant bg-pz-surface-container hover:bg-pz-surface-container-high transition-colors disabled:opacity-60";
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 px-5 py-2.5 max-md:min-h-11 rounded-lg bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container font-headline font-bold text-sm shadow-sm transition-colors disabled:opacity-60";

/** Fix a person's name, email or WhatsApp number. Only the fields that changed are sent. */
export function EditDetailsDialog({ row, onClose }: { row: RegistrationListRow; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<Field, string>>({ name: row.name, email: row.email, whatsapp: row.whatsapp });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed: Partial<Record<Field, string>> = {};
  for (const f of ["name", "email", "whatsapp"] as const) {
    const next = values[f].trim();
    if (next !== row[f].trim()) changed[f] = next;
  }
  const hasChanges = Object.keys(changed).length > 0;

  async function save() {
    if (busy || !hasChanges) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${row.id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changed),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (res.ok) {
        onClose();
        router.refresh();
        return;
      }
      setError(typeof data.error === "string" && data.error !== "" ? data.error : "The details could not be saved. Try again.");
    } catch {
      setError("The details could not be saved. Try again.");
    }
    setBusy(false);
  }

  const fields: { key: Field; label: string; icon: typeof User; type: string; inputMode?: "email" | "tel" }[] = [
    { key: "name", label: "Full name", icon: User, type: "text" },
    { key: "email", label: "Email address", icon: Mail, type: "email", inputMode: "email" },
    { key: "whatsapp", label: "WhatsApp number", icon: MessageCircle, type: "tel", inputMode: "tel" },
  ];

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className={DIALOG_SURFACE}>
        <DialogHeader className="gap-2">
          {row.refId && (
            <span className="self-start px-2 py-0.5 rounded bg-pz-surface-container text-pz-tertiary text-[11px] font-headline font-bold">Ref: {row.refId}</span>
          )}
          <DialogTitle className="font-headline font-extrabold text-xl">Edit candidate details</DialogTitle>
          <DialogDescription className="text-pz-on-surface-variant">Updating contact details for {row.name}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {fields.map(({ key, label, icon: Icon, type, inputMode }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label htmlFor={`edit-${row.id}-${key}`} className="text-[11px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant">
                {label}
              </label>
              <div className="relative">
                <Icon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-pz-on-surface-variant" aria-hidden="true" />
                <input
                  id={`edit-${row.id}-${key}`}
                  type={type}
                  inputMode={inputMode}
                  value={values[key]}
                  disabled={busy}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  className={INPUT}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 p-3.5 rounded-lg bg-pz-surface-container-low">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-pz-secondary" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-headline font-bold text-pz-on-surface">The person&apos;s account is not changed</p>
            <p className="text-xs text-pz-on-surface-variant">These edits only fix the details shown in this list. Their sign-in and course access stay as they are.</p>
          </div>
        </div>

        {error && <p role="alert" className="text-xs font-headline font-semibold text-pz-error">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0 sm:space-x-3 max-md:flex-col">
          <button type="button" onClick={onClose} disabled={busy} className={BTN_CANCEL}>Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy || !hasChanges} className={BTN_PRIMARY}>
            <Check className="w-4 h-4" aria-hidden="true" />
            Save details
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
