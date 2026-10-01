"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractEmail, extractPhone, extractName, extractProfession } from "@/lib/leads/extract";
import { enqueueLead, flushQueue } from "@/lib/leads/offline-queue";
import { normalizePhone } from "@/lib/crm/phone";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type LeadCampaign = { id: string; name: string };
type DuplicateInfo = { id: string; status: string; leadCampaignName: string | null };

export function LeadCaptureForm({ token, agentName }: { token: string; agentName: string }) {
  const [raw, setRaw] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profession, setProfession] = useState("");
  const [leadCampaignId, setLeadCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<LeadCampaign[]>([]);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    fetch(`/api/campaigns?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((data) => setCampaigns(data.campaigns ?? []))
      .catch(() => setCampaigns([]));
  }, [token]);

  useEffect(() => {
    flushQueue();
    const interval = setInterval(flushQueue, 15000);
    window.addEventListener("online", flushQueue);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", flushQueue);
    };
  }, []);

  function handleExtract() {
    const foundEmail = extractEmail(raw);
    const foundPhone = extractPhone(raw);
    const foundName = extractName(raw);
    const foundProfession = extractProfession(raw);
    if (foundEmail) setEmail(foundEmail);
    if (foundPhone) setPhone(foundPhone);
    if (foundName) setName(foundName);
    if (foundProfession) setProfession(foundProfession);
  }

  function resetForm() {
    setRaw("");
    setName("");
    setEmail("");
    setPhone("");
    setProfession("");
    setDuplicate(null);
  }

  function saveOptimistically(resolution: "insert" | "update", existingLeadId?: string) {
    enqueueLead(token, {
      name: name.trim() || null,
      email: email.trim() || null,
      phone,
      profession: profession.trim() || null,
      leadCampaignId: leadCampaignId || null,
      resolution,
      existingLeadId,
    });
    setSavedCount((c) => c + 1);
    toast.success("Lead saved");
    resetForm();
    flushQueue();
  }

  const { run: handleSave, pending: checking } = useAsyncAction(async () => {
    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    const normalized = normalizePhone(phone);
    if (!normalized.ok) {
      toast.error("Enter a valid phone number (e.g. 03001234567).");
      return;
    }

    if (!navigator.onLine) {
      saveOptimistically("insert");
      return;
    }

    try {
      const res = await fetch("/api/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          phone,
          profession: profession.trim() || undefined,
          leadCampaignId: leadCampaignId || undefined,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.duplicate) {
        setDuplicate(data.existingLead);
        return;
      }
      if (res.ok && data?.ok) {
        setSavedCount((c) => c + 1);
        toast.success("Lead saved");
        resetForm();
        return;
      }
      // A real error from the server (bad token, rate limit, etc.) — still
      // queue it locally rather than losing the agent's work.
      saveOptimistically("insert");
    } catch {
      // Network hiccup mid-check — fall back to the offline path.
      saveOptimistically("insert");
    }
  });

  if (duplicate) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-10">
        <h2 className="font-fredoka text-lg">Existing lead found</h2>
        <p className="font-body text-sm text-pz-ink/70">
          A lead with this phone already exists — status &ldquo;{duplicate.status}&rdquo;
          {duplicate.leadCampaignName ? `, campaign "${duplicate.leadCampaignName}"` : ""}.
        </p>
        <Button onClick={() => saveOptimistically("update", duplicate.id)}>Update this lead</Button>
        <Button variant="outline" onClick={() => saveOptimistically("insert")}>
          Add as new
        </Button>
        <Button variant="ghost" onClick={() => setDuplicate(null)}>
          Cancel
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="font-fredoka text-lg">Hi, {agentName}</h1>
      {savedCount > 0 && (
        <p className="font-body text-xs text-pz-ink/60">{savedCount} lead(s) saved this session.</p>
      )}

      <div>
        <Label htmlFor="raw">Paste the WhatsApp chat</Label>
        <textarea
          id="raw"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={handleExtract}
          rows={6}
          className="mt-1 w-full rounded-xl border border-pz-outline-variant px-4 py-3 font-body text-sm max-md:text-base"
          placeholder="Paste the customer's messages here..."
        />
        <Button type="button" variant="outline" className="mt-2 w-full" onClick={handleExtract}>
          Extract fields
        </Button>
      </div>

      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-12" />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-12" />
      </div>

      <div>
        <Label htmlFor="phone">Phone (required)</Label>
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-12" />
      </div>

      <div>
        <Label htmlFor="profession">Profession</Label>
        <Input
          id="profession"
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          className="mt-1 h-12"
        />
      </div>

      <div>
        <Label htmlFor="campaign">Campaign</Label>
        <select
          id="campaign"
          value={leadCampaignId}
          onChange={(e) => setLeadCampaignId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-pz-outline-variant px-4 py-3 font-body text-sm max-md:text-base"
        >
          <option value="">— none —</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Button className="h-14 text-base" loading={checking} onClick={() => handleSave()}>
        {checking ? "Checking..." : "Save lead"}
      </Button>
    </main>
  );
}
