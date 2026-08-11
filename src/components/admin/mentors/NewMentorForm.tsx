"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function NewMentorForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function submit() {
    if (!name.trim()) {
      toast.error("Give the mentor a name first.");
      return;
    }

    startTransition(async () => {
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
      router.push(`/dashboard/admin/mentors/${id}`);
    });
  }

  return (
    <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-6 space-y-6">
      <div>
        <label className="block font-headline text-sm font-semibold text-pz-on-surface mb-2">Mentor Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Dr. Jane Doe"
          className="w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="w-full py-3 bg-pz-primary text-pz-on-primary font-headline font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create Draft"}
      </button>
    </div>
  );
}
