"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export function ClaimSettingToggle({ initial }: { initial: boolean }) {
  const [value, setValue] = useState(initial);

  const { run: change, pending } = useAsyncAction(async (next: boolean) => {
    const previous = value;
    setValue(next);
    try {
      const res = await fetch("/api/admin/sales/settings/claim", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setValue(previous);
        toast.error(payload?.error ?? "Could not save the setting.");
        return;
      }
      toast.success(
        next ? "Agents can now claim contacts." : "Claiming is off. Contacts come only from your assignments.",
      );
    } catch {
      setValue(previous);
      toast.error("Could not save the setting.");
    }
  });

  return (
    <section className="bg-pz-surface-container-lowest p-4 sm:p-6 rounded-xl border border-pz-outline-variant flex items-start justify-between gap-4">
      <div>
        <h2 id="claim-setting-label" className="font-headline text-lg font-bold text-pz-on-surface">
          Let agents claim unassigned contacts
        </h2>
        <p className="font-body text-sm text-pz-on-surface-variant mt-1">
          Off: contacts reach agents only when you assign them. On: agents can claim from the Unclaimed tab.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby="claim-setting-label"
        disabled={pending}
        onClick={() => change(!value)}
        className="group inline-flex shrink-0 items-center justify-center max-md:min-h-11 max-md:min-w-11 disabled:opacity-60 focus:outline-none"
      >
        <span
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-pz-primary/40 ${
            value ? "bg-pz-primary" : "bg-pz-outline"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-pz-surface-container-lowest shadow transition-transform ${
              value ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </span>
      </button>
    </section>
  );
}
