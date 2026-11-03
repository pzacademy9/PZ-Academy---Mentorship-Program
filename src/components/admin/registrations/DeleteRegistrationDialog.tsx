"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";
import { BTN_CANCEL, DIALOG_SURFACE } from "./EditDetailsDialog";

const CONFIRM_WORD = "DELETE";

/** Delete one registration for good. The admin has to type DELETE; nothing is sent before that. */
export function DeleteRegistrationDialog({ row, onClose }: { row: RegistrationListRow; onClose: () => void }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const members = row.groupSize > 1 ? row.groupSize - 1 : 0;
  const ready = typed.trim() === CONFIRM_WORD;

  async function remove() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${row.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (res.ok) {
        toast.success(`${row.name} deleted.`);
        onClose();
        router.refresh();
        return;
      }
      setError(typeof data.error === "string" && data.error !== "" ? data.error : "Could not delete. Try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className={DIALOG_SURFACE}>
        <DialogHeader className="gap-2">
          <DialogTitle className="font-headline font-extrabold text-xl">Delete {row.name}?</DialogTitle>
          <DialogDescription className="text-pz-on-surface-variant">
            {row.email}{row.refId ? ` · ${row.refId}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 p-3.5 rounded-lg bg-pz-solid-danger/10 border border-pz-solid-danger/30">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-pz-danger" aria-hidden="true" />
          <div className="flex flex-col gap-1 text-xs text-pz-on-surface">
            <p className="font-headline font-bold">This cannot be undone.</p>
            <ul className="list-disc pl-4 space-y-0.5 text-pz-on-surface-variant">
              <li>The registration and its history are removed.</li>
              {members > 0 && <li>{members === 1 ? "1 group member" : `${members} group members`} are removed with it.</li>}
              <li>The course access this registration gave is removed, unless the same student has another paid registration for that course. Then they keep it.</li>
              <li>Their sign-in account, PZ ID and voucher file stay. Emails already sent cannot be taken back.</li>
              <li>The row in your Google Sheet stays, and Sheet sync will list it as &quot;Row not recognised&quot; until you delete it there.</li>
              <li>If this batch copies from a sheet, delete their row in that sheet first. Otherwise they come back within 15 minutes.</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`delete-${row.id}`} className="text-[11px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant">
            Type {CONFIRM_WORD} to confirm
          </label>
          <input
            id={`delete-${row.id}`}
            value={typed}
            disabled={busy}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
            className="w-full min-h-11 px-3 py-2.5 rounded-lg bg-pz-surface-container-low text-pz-on-surface text-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-pz-primary disabled:opacity-60"
          />
        </div>

        {error && <p role="alert" className="text-xs font-headline font-semibold text-pz-error">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0 sm:space-x-3 max-md:flex-col">
          <button type="button" onClick={onClose} disabled={busy} className={BTN_CANCEL}>Cancel</button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy || !ready}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 max-md:min-h-11 rounded-lg bg-pz-solid-danger text-white hover:bg-pz-solid-danger/90 font-headline font-bold text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            {busy ? "Deleting…" : "Delete for good"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
