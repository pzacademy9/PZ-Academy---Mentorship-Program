"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/useAsyncAction";

/** Shows or hides a batch on the public progress portal (/progress). Saves on change. */
export function PortalVisibilitySwitch({ pageId, showInPortal }: { pageId: string; showInPortal: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState(showInPortal);
  useEffect(() => { setShow(showInPortal); }, [showInPortal]);

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
        <span>Students and visitors can see this batch&apos;s attendance and results at /progress. Turn off to hide it.</span>
      </span>
    </label>
  );
}
