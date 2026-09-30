"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { ContactDetail } from "@/lib/data/admin-crm-contacts";

export function ContactDetailClient({ detail }: { detail: ContactDetail }) {
  const [phoneDraft, setPhoneDraft] = useState(String(detail.phoneRaw ?? detail.phoneE164 ?? ""));
  const [phoneE164, setPhoneE164] = useState(detail.phoneE164);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  async function savePhone() {
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const res = await fetch(`/api/admin/crm/contacts/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneRaw: phoneDraft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhoneError(json.error ?? "Could not save this number.");
        return;
      }
      setPhoneE164(json.phoneE164);
      toast.success("Phone number updated.");
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/crm?tab=contacts"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Contacts
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">{detail.fullName || "—"}</h1>
          {detail.unsubscribed && <span className="text-xs text-pz-danger">unsubscribed</span>}
        </div>
      </div>

      <div className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3 font-body text-sm">
        <p>Email: {detail.email ?? "—"}</p>
        <p>Country: {detail.country ?? "—"}</p>
        <p>Profession: {detail.profession ?? "—"} · Platform account: {detail.hasPlatformAccount ? "yes" : "no"}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">Phone:</span>
          <input
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            className="rounded-lg border border-pz-outline-variant px-2 py-1 font-body text-sm"
          />
          <button
            onClick={savePhone}
            disabled={phoneBusy || phoneDraft.trim() === ""}
            className="px-3 py-1 rounded-full bg-pz-primary text-pz-on-primary font-headline text-xs font-semibold disabled:opacity-50"
          >
            {phoneBusy ? "Saving…" : "Save"}
          </button>
          {phoneE164 && <span className="text-pz-on-surface-variant text-xs">({phoneE164})</span>}
          {phoneError && <span className="text-pz-danger">{phoneError}</span>}
        </div>
      </div>

      <div>
        <h2 className="font-headline font-bold text-lg mb-3">Purchase history ({detail.purchases.length})</h2>
        {detail.purchases.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant py-4">No purchases on file.</p>
        ) : (
          <div className="space-y-2">
            {detail.purchases.map((p) => (
              <p key={p.id} className="font-body text-xs bg-pz-surface-container-high rounded-xl p-3">
                {p.productLabel || "—"} · {p.amount === null ? "—" : `${p.currency ?? ""} ${p.amount}`}
                {p.isEarlyBird ? " · early bird" : ""} · {p.rowType}
                {p.promoCode ? ` · promo ${p.promoCode}` : ""} · {p.sourceRowRef}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
