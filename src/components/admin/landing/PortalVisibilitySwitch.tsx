"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { isPortalSwitchOn } from "@/lib/progress/visibility";

/**
 * Shows or hides a batch on the public progress portal (/progress). Saves on change.
 * The box shows the EFFECTIVE state: automatic (never set) means on for published/closed, off for a draft.
 * Toggling always saves an explicit true or false.
 */
export function PortalVisibilitySwitch({
  pageId, status, showInPortal,
}: { pageId: string; status: string; showInPortal: boolean | null }) {
  const router = useRouter();
  const [show, setShow] = useState(isPortalSwitchOn(status, showInPortal));
  useEffect(() => { setShow(isPortalSwitchOn(status, showInPortal)); }, [status, showInPortal]);
  const draftPrivate = status === "draft" && !show;

  const { run: save, pending } = useAsyncAction(async (next: boolean) => {
    try {
      const res = await fetch(`/api/admin/landing-pages/${pageId}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show: next }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Couldn't save. Try again.");
        return;
      }
      setShow(next);
      toast.success(next ? "Shown on the public progress portal." : "Hidden from the public progress portal.");
      router.refresh();
    } catch {
      toast.error("Couldn't save. Try again.");
    }
  });

  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 font-body text-xs text-pz-on-surface-variant">
      <input
        type="checkbox"
        checked={show}
        disabled={pending}
        onChange={(e) => void save(e.target.checked)}
        className="h-5 w-5 shrink-0"
      />
      <span className="flex flex-col">
        <span className="font-medium text-pz-on-surface">Show on public progress portal</span>
        <span>
          {draftPrivate
            ? "This batch is still a draft, so it is private until you switch this on."
            : "Students and visitors can see this batch's attendance and results at /progress. Turn off to hide it."}
        </span>
        <span aria-live="polite">{show ? (status === "draft" ? "Switched on. It shows on the portal once it has students." : "Currently shown on the portal.") : "Currently hidden from the portal."}</span>
      </span>
    </label>
  );
}
