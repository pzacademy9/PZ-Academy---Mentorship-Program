"use client";

import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSalesBudget } from "./SalesBudgetProvider";

export function PanicButton({ className }: { className?: string }) {
  const { selected, refresh } = useSalesBudget();
  const confirm = useConfirm();
  const { run, pending } = useAsyncAction(async () => {
    if (!selected) return;
    const ok = await confirm({
      title: `Pause ${selected.number.label}?`,
      description:
        "Use this if WhatsApp shows a warning, asks you to verify, or limits your account. Sending from this number stops for everyone who uses it (48 hours unless your admin changed it), and your admin is told. Please also stop messaging new people from this phone outside the app.",
      confirmLabel: "Pause this number",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/sales/numbers/${selected.number.id}/freeze`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { changed?: boolean; frozenUntil?: string | null; error?: string }
        | null;
      if (!res.ok) {
        toast.error(body?.error ?? "Could not pause this number.");
        return;
      }
      toast.success(
        body?.changed === false || !body?.frozenUntil
          ? "This number is already paused."
          : `Paused until ${formatDateTime(body.frozenUntil)}. Your admin has been told.`,
      );
      await refresh();
    } catch {
      toast.error("Could not pause this number.");
    }
  });
  if (!selected || selected.budget.frozen) return null;
  return (
    <Button
      type="button"
      variant="bare"
      size="bare"
      loading={pending}
      onClick={() => void run()}
      className={cn(
        "gap-2 px-3.5 py-2 max-md:min-h-11 rounded-lg bg-pz-error-container text-pz-on-error-container font-headline text-xs font-bold hover:shadow-sm transition-all",
        className,
      )}
    >
      <TriangleAlert className="w-4 h-4" />
      My WhatsApp warns or restricts me
    </Button>
  );
}
