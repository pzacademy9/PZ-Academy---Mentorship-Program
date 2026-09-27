"use client";

export type LeadDraft = {
  name: string | null;
  email: string | null;
  phone: string;
  profession: string | null;
  leadCampaignId: string | null;
  resolution: "insert" | "update";
  existingLeadId?: string;
};

export type QueueEntry = {
  localId: string;
  token: string;
  draft: LeadDraft;
  attempts: number;
};

const STORAGE_KEY = "pz-leads-offline-queue";

export function readQueue(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(entries: QueueEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable — the optimistic UI already showed
    // success, so losing the retry-queue entry is the acceptable fallback
    // here, not a blocked save.
  }
}

export function enqueueLead(token: string, draft: LeadDraft): QueueEntry {
  const entry: QueueEntry = { localId: crypto.randomUUID(), token, draft, attempts: 0 };
  writeQueue([...readQueue(), entry]);
  return entry;
}

export function removeFromQueue(localId: string): void {
  writeQueue(readQueue().filter((e) => e.localId !== localId));
}

function bumpAttempts(localId: string): void {
  writeQueue(readQueue().map((e) => (e.localId === localId ? { ...e, attempts: e.attempts + 1 } : e)));
}

/**
 * Sends every queued entry, oldest first. A failed send must never throw
 * out of this function — it runs unattended on an interval and on the
 * browser's 'online' event, and a thrown error there would end the retry
 * loop for every future flush, not just this one.
 */
export async function flushQueue(): Promise<void> {
  for (const entry of readQueue()) {
    try {
      const res = await fetch("/api/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: entry.token, ...entry.draft }),
      });
      if (res.ok) {
        removeFromQueue(entry.localId);
      } else {
        bumpAttempts(entry.localId);
      }
    } catch {
      bumpAttempts(entry.localId);
    }
  }
}
