"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { ContactDetail } from "@/lib/data/admin-crm-contacts";
import type { ManualConversionRow } from "@/lib/data/admin-crm-manual-conversions";

export function ContactDetailClient({
  detail,
  initialManualConversions,
}: {
  detail: ContactDetail;
  initialManualConversions: ManualConversionRow[];
}) {
  const router = useRouter();
  const [phoneDraft, setPhoneDraft] = useState(String(detail.phoneRaw ?? detail.phoneE164 ?? ""));
  const [phoneE164, setPhoneE164] = useState(detail.phoneE164);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [manualConversions, setManualConversions] = useState(initialManualConversions);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [programMode, setProgramMode] = useState<"course" | "label">("course");
  const [courseId, setCourseId] = useState("");
  const [label, setLabel] = useState("");
  const [convertedAt, setConvertedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  useEffect(() => {
    fetch("/api/admin/crm/courses")
      .then((r) => r.json())
      .then((j: { courses?: { id: string; title: string }[] }) => setCourses(j.courses ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setManualConversions(initialManualConversions);
  }, [initialManualConversions]);

  async function markConverted() {
    const program = programMode === "course" ? { kind: "course" as const, courseId } : { kind: "label" as const, pattern: label.trim() };
    if (programMode === "course" && !courseId) return;
    if (programMode === "label" && label.trim() === "") return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/crm/manual-conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [detail.id], program, convertedAt: convertedAt || undefined, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Could not record this conversion.");
        return;
      }
      toast.success("Marked converted.");
      setShowForm(false);
      setCourseId("");
      setLabel("");
      setNote("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeConversion(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/admin/crm/manual-conversions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Could not remove this record.");
        return;
      }
      setManualConversions((prev) => prev.filter((m) => m.id !== id));
      toast.success("Removed.");
    } finally {
      setRemovingId(null);
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

      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-headline font-bold text-lg">Manual conversions</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-1.5 rounded-full bg-pz-primary text-pz-on-primary font-headline text-xs font-semibold"
          >
            {showForm ? "Cancel" : "Mark converted…"}
          </button>
        </div>

        {showForm && (
          <div className="mt-3 bg-pz-surface-container-high rounded-2xl p-4 space-y-3">
            <div className="flex gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
                <input type="radio" name="programMode" checked={programMode === "course"} onChange={() => setProgramMode("course")} />
                Existing course
              </label>
              <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
                <input type="radio" name="programMode" checked={programMode === "label"} onChange={() => setProgramMode("label")} />
                Other program (type a name)
              </label>
            </div>
            {programMode === "course" ? (
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm">
                <option value="">Select a course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            ) : (
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Program name" className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
            )}
            <input type="date" value={convertedAt} onChange={(e) => setConvertedAt(e.target.value)} className="rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
            <button
              onClick={markConverted}
              disabled={saving || (programMode === "course" ? !courseId : label.trim() === "")}
              className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}

        {manualConversions.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant py-4">No manual conversions recorded.</p>
        ) : (
          <div className="space-y-2 mt-3">
            {manualConversions.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 bg-pz-surface-container-high rounded-xl p-3 font-body text-sm">
                <span>
                  {m.program.kind === "course" ? m.programCourseTitle ?? "—" : m.program.kind === "label" ? m.program.pattern : ""}
                  {" · "}
                  {new Date(m.convertedAt).toLocaleDateString()}
                  {m.note && <span className="text-pz-on-surface-variant"> · {m.note}</span>}
                </span>
                <button onClick={() => removeConversion(m.id)} disabled={removingId === m.id} className="text-pz-danger text-xs font-semibold shrink-0 disabled:opacity-50">
                  {removingId === m.id ? "Removing…" : "undo"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
