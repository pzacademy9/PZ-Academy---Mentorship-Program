"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type ContactRow = {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  country: string | null;
  discoverySource: string;
  purchaseCount: number;
  unsubscribed: boolean;
};

type Candidate = { id: string; reason: string; confidence: number; a: ContactRow; b: ContactRow };

export function MergeReviewPanel({ initialCandidates }: { initialCandidates: Candidate[] }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(initialCandidates);
  const [error, setError] = useState<string | null>(null);

  const { run: resolve, pending: resolving, pendingKey: busyId } = useAsyncAction(async (id: string, decision: "merge" | "reject") => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/crm/merge/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Could not resolve this duplicate.");
      }
      // Drop it from local state immediately. router.refresh() alone would
      // leave the resolved card on screen until a hard navigation.
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve this duplicate.");
    }
  }, { getKey: (id) => id });

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={GitMerge}
        title="No duplicates waiting for review"
        description="Possible duplicate contacts show up here after an import."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="font-body text-sm text-pz-danger">{error}</p>}

      {candidates.map((c) => (
        <div key={c.id} className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
          <p className="font-body text-xs text-pz-on-surface-variant">
            {c.reason} · confidence {Math.round(c.confidence * 100)}%
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <ContactCard contact={c.a} label="Keeps purchases (older)" />
            <ContactCard contact={c.b} label="Will be removed" />
          </div>

          <div className="flex gap-2 max-md:flex-col">
            <Button
              variant="bare"
              size="bare"
              loading={busyId === c.id}
              onClick={() => resolve(c.id, "merge")}
              disabled={resolving}
              className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold max-md:min-h-11"
            >
              {busyId === c.id ? "Merging…" : "Merge"}
            </Button>
            <Button
              variant="bare"
              size="bare"
              onClick={() => resolve(c.id, "reject")}
              disabled={resolving}
              className="px-5 py-2 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-sm font-medium max-md:min-h-11"
            >
              Different people
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactCard({ contact, label }: { contact: ContactRow; label: string }) {
  return (
    <div className="bg-pz-surface rounded-xl p-3 font-body text-sm">
      <p className="text-xs text-pz-on-surface-variant mb-1">{label}</p>
      <p className="font-semibold">{contact.fullName || "—"}</p>
      <p>{contact.email ?? "no email"}</p>
      <p>{contact.phoneE164 ?? "no phone"}</p>
      <p className="text-xs text-pz-on-surface-variant mt-1 tabular-nums">{contact.purchaseCount} purchases</p>
    </div>
  );
}
