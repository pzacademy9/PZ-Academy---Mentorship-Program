"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, decision: "merge" | "reject") {
    setBusyId(id);
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
    } finally {
      setBusyId(null);
    }
  }

  if (candidates.length === 0) {
    return <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No duplicates waiting for review.</p>;
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

          <div className="flex gap-2">
            <button
              onClick={() => resolve(c.id, "merge")}
              disabled={busyId === c.id}
              className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
            >
              {busyId === c.id ? "Merging…" : "Merge"}
            </button>
            <button
              onClick={() => resolve(c.id, "reject")}
              disabled={busyId === c.id}
              className="px-5 py-2 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-sm font-medium disabled:opacity-50"
            >
              Different people
            </button>
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
