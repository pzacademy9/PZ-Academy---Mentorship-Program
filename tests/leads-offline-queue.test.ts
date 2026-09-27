import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueueLead, readQueue, removeFromQueue, flushQueue } from "@/lib/leads/offline-queue";

const draft = {
  name: "Ayesha Malik",
  email: null,
  phone: "+923234267102",
  profession: null,
  leadCampaignId: null,
  resolution: "insert" as const,
};

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("enqueueLead / readQueue / removeFromQueue", () => {
  it("enqueues an entry with a unique localId", () => {
    const entry = enqueueLead("token-1", draft);
    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0].localId).toBe(entry.localId);
    expect(readQueue()[0].draft.phone).toBe("+923234267102");
  });

  it("removes an entry by localId", () => {
    const entry = enqueueLead("token-1", draft);
    removeFromQueue(entry.localId);
    expect(readQueue()).toHaveLength(0);
  });

  it("keeps unrelated entries when removing one", () => {
    const first = enqueueLead("token-1", draft);
    enqueueLead("token-1", { ...draft, phone: "+923198071841" });
    removeFromQueue(first.localId);
    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0].draft.phone).toBe("+923198071841");
  });
});

describe("flushQueue", () => {
  it("removes an entry from the queue on a successful send", async () => {
    enqueueLead("token-1", draft);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

    await flushQueue();

    expect(readQueue()).toHaveLength(0);
  });

  it("keeps a failed entry queued and bumps its attempt count", async () => {
    enqueueLead("token-1", draft);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "rate limited" }) }));

    await flushQueue();

    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0].attempts).toBe(1);
  });

  it("keeps a queued entry when the network call itself throws", async () => {
    enqueueLead("token-1", draft);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await flushQueue();

    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0].attempts).toBe(1);
  });

  it("drops a permanently rejected entry (400) instead of retrying it", async () => {
    enqueueLead("token-1", draft);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Invalid input" }) }),
    );

    await flushQueue();

    expect(readQueue()).toHaveLength(0);
  });
});
