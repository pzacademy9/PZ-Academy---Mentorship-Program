"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export function SheetPendingBanner({
  enrollmentId,
  note,
}: {
  enrollmentId: string;
  note: string;
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  const { run: decide, pending: deciding, pendingKey: decidingKey } = useAsyncAction(
    async (decision: "confirm" | "dismiss") => {
      try {
        const res = await fetch(`/api/admin/enrollments/${enrollmentId}/sheet-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(payload?.error ?? "Could not apply this decision.");
          return;
        }
        toast.success(decision === "confirm" ? "Sheet request applied." : "Sheet request dismissed.");
        startTransition(() => router.refresh());
      } catch {
        toast.error("Could not apply this decision.");
      }
    },
    { getKey: (decision) => decision },
  );
  const busy = deciding || isRefreshing;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pz-gold/40 bg-pz-gold/10 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4.5 h-4.5 text-pz-gold shrink-0 mt-0.5" />
        <p className="font-body text-sm text-pz-on-surface">{note}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={decidingKey === "dismiss"}
          disabled={busy}
          onClick={() => decide("dismiss")}
          className="px-3 py-1.5 max-md:min-h-11 rounded-lg font-headline text-xs font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
        >
          Dismiss
        </Button>
        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={decidingKey === "confirm"}
          disabled={busy}
          onClick={() => decide("confirm")}
          className="px-3 py-1.5 max-md:min-h-11 rounded-lg font-headline text-xs font-semibold bg-pz-gold text-white hover:bg-pz-gold/90 transition-colors"
        >
          {busy ? "Working…" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}
