"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export function NewMentorForm() {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [name, setName] = useState("");

  const { run: submit, pending: creating } = useAsyncAction(async () => {
    if (!name.trim()) {
      toast.error("Give the mentor a name first.");
      return;
    }

    try {
      const res = await fetch("/api/admin/mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not create this mentor.");
        return;
      }

      const { id } = (await res.json()) as { id: string };
      toast.success("Draft created — fill in the rest below.");
      startTransition(() => router.push(`/dashboard/admin/mentors/${id}`));
    } catch {
      toast.error("Could not create this mentor.");
    }
  });

  return (
    <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-4 md:p-6 space-y-6">
      <div>
        <label className="block font-headline text-sm font-semibold text-pz-on-surface mb-2">Mentor Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Dr. Jane Doe"
          className="w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary"
        />
      </div>

      <div className="max-md:sticky max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={creating || isNavigating}
          onClick={() => submit()}
          className="w-full py-3 max-md:min-h-11 bg-pz-primary text-pz-on-primary font-headline font-bold rounded-lg hover:opacity-90 transition-opacity"
        >
          {creating || isNavigating ? "Creating…" : "Create Draft"}
        </Button>
      </div>
    </div>
  );
}
