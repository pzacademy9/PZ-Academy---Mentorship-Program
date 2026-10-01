"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useConfirm } from "@/components/ui/confirm-dialog";

const DEFAULT_DAYS = 30;

const FIELD =
  "w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const LABEL = "block font-headline text-sm font-semibold text-pz-on-surface mb-1.5";

/** Bulk-deletes read notifications older than N days, across every user — an admin cleanup action, not a per-user one. */
export function PurgeNotificationsCard() {
  const confirm = useConfirm();
  const [days, setDays] = useState(DEFAULT_DAYS);

  const { run: submit, pending: purging } = useAsyncAction(async () => {
    if (
      !(await confirm({
        title: "Delete old notifications?",
        description: `Permanently delete every read notification older than ${days} day${days === 1 ? "" : "s"}, for all users? This cannot be undone.`,
        confirmLabel: "Delete",
        destructive: true,
      }))
    ) {
      return;
    }

    try {
      const res = await fetch("/api/admin/notifications/purge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays: days }),
      });
      const json = (await res.json().catch(() => null)) as
        | { deleted?: number; error?: string }
        | null;

      if (!res.ok) {
        toast.error(json?.error ?? "Could not purge notifications.");
        return;
      }
      toast.success(`Deleted ${json?.deleted ?? 0} old notification${json?.deleted === 1 ? "" : "s"}.`);
    } catch {
      toast.error("Could not purge notifications.");
    }
  });

  return (
    <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-4 md:p-6 space-y-4 max-w-2xl">
      <div>
        <h2 className="font-headline font-bold text-pz-on-surface text-base">Clean up old notifications</h2>
        <p className="font-body text-sm text-pz-on-surface-variant mt-1">
          Permanently deletes read notifications older than the chosen age, for every user. Unread
          notifications are never touched.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="purge-days" className={LABEL}>
            Older than (days)
          </label>
          <input
            id="purge-days"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || DEFAULT_DAYS)))}
            className={`${FIELD} w-28`}
          />
        </div>

        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={purging}
          onClick={() => submit()}
          className="gap-2 px-4 py-2.5 max-md:min-h-11 rounded-lg bg-pz-error-container text-pz-on-error-container font-headline font-bold text-sm hover:opacity-90 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
          {purging ? "Deleting…" : "Delete old notifications"}
        </Button>
      </div>
    </div>
  );
}
