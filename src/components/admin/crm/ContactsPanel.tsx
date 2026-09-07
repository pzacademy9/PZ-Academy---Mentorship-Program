"use client";

import { useState } from "react";

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

export function ContactsPanel({ initialRows, initialTotal }: { initialRows: ContactRow[]; initialTotal: number }) {
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  async function runSearch() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/crm/contacts?search=${encodeURIComponent(search)}&limit=50&offset=0`);
      if (!res.ok) return;
      const json = await res.json();
      // Local state update, not router.refresh() — refresh() cannot reach a
      // mounted client component's own useState.
      setRows(json.rows);
      setTotal(json.total);
    } finally {
      setBusy(false);
    }
  }

  async function toggleDetail(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    const res = await fetch(`/api/admin/crm/contacts/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="Search name, email, or phone"
          className="flex-1 min-w-[240px] rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
        />
        <button
          onClick={runSearch}
          disabled={busy}
          className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      <p className="font-body text-xs text-pz-on-surface-variant">
        Showing {rows.length} of {total} contacts
      </p>

      {rows.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">
          No contacts yet. Use the Import tab to bring in a cohort sheet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body text-sm">
            <thead className="text-pz-on-surface-variant text-xs uppercase">
              <tr><th className="py-2">Name</th><th>Email</th><th>Phone</th><th>Country</th><th>Source</th><th>Purchases</th></tr>
            </thead>
            {rows.map((c) => (
              <tbody key={c.id}>
                  <tr className="border-t border-pz-outline-variant">
                    <td className="py-2">
                      <button onClick={() => toggleDetail(c.id)} className="text-left underline">
                        {c.fullName || "—"}
                      </button>
                      {c.unsubscribed && <span className="ml-2 text-xs text-pz-danger">unsubscribed</span>}
                    </td>
                    <td>{c.email ?? "—"}</td>
                    <td className={c.phoneE164 ? "" : "text-pz-danger"}>{c.phoneE164 ?? "needs review"}</td>
                    <td>{c.country ?? "—"}</td>
                    <td>{c.discoverySource}</td>
                    <td className="tabular-nums">{c.purchaseCount}</td>
                  </tr>
                  {openId === c.id && (
                    <tr className="border-t border-pz-outline-variant bg-pz-surface">
                      <td colSpan={6} className="p-4">
                        {detail === null ? (
                          <p className="font-body text-xs text-pz-on-surface-variant">Loading…</p>
                        ) : (
                          <div className="space-y-1 font-body text-xs">
                            <p>Profession: {String(detail.profession ?? "—")} · Raw phone: {String(detail.phoneRaw ?? "—")} · Platform account: {detail.hasPlatformAccount ? "yes" : "no"}</p>
                            {(detail.purchases as Array<Record<string, unknown>>).map((p) => (
                              <p key={String(p.id)}>
                                {String(p.productLabel) || "—"} · {p.amount === null ? "—" : `${String(p.currency ?? "")} ${String(p.amount)}`}
                                {p.isEarlyBird ? " · early bird" : ""} · {String(p.rowType)}
                                {p.promoCode ? ` · promo ${String(p.promoCode)}` : ""} · {String(p.sourceRowRef)}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
