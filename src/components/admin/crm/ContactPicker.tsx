"use client";

import { useEffect, useRef, useState } from "react";
import { contactSendFlag, mergeContactIds, MAX_PICKED_CONTACTS, type PickerContact } from "@/lib/crm/contact-picker";

const SEARCH_DELAY_MS = 300;
const RESULT_LIMIT = 10;

/**
 * Search-and-pick control for a segment's contact_id filter. Ids may arrive
 * without names (handed off from the Contacts tab); those are summarised as a
 * count, while anyone picked here is shown as a removable chip.
 */
export function ContactPicker({
  values,
  channel,
  onChange,
}: {
  values: string[];
  channel: "email" | "whatsapp";
  onChange: (ids: string[]) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickerContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [named, setNamed] = useState<Record<string, PickerContact>>({});
  const requestId = useRef(0);

  useEffect(() => {
    const q = term.trim();
    if (q === "") {
      requestId.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      const mine = ++requestId.current;
      setSearching(true);
      setSearchError(false);
      try {
        const res = await fetch(`/api/admin/crm/contacts?search=${encodeURIComponent(q)}&limit=${RESULT_LIMIT}`);
        const json = res.ok ? await res.json() : null;
        if (mine !== requestId.current) return;
        if (!json) { setSearchError(true); setResults([]); return; }
        setResults((json.rows ?? []) as PickerContact[]);
      } catch {
        if (mine === requestId.current) { setSearchError(true); setResults([]); }
      } finally {
        if (mine === requestId.current) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const atCap = values.length >= MAX_PICKED_CONTACTS;
  const chips = values.filter((id) => named[id]);
  const unnamedCount = values.length - chips.length;

  function add(contact: PickerContact) {
    setNamed((prev) => ({ ...prev, [contact.id]: contact }));
    onChange(mergeContactIds(values, [contact.id]));
  }

  return (
    <div className="flex-1 min-w-[240px] space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {unnamedCount > 0 && (
            <span className="font-body text-xs text-pz-on-surface-variant">
              {unnamedCount} contact{unnamedCount === 1 ? "" : "s"} picked from the Contacts tab
            </span>
          )}
          {chips.map((id) => (
            <span key={id} className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-pz-surface-variant font-body text-xs max-md:min-h-11">
              <span>{named[id].fullName || named[id].email}</span>
              {named[id].email && <span className="text-pz-on-surface-variant">{named[id].email}</span>}
              <button
                type="button"
                aria-label={`Remove ${named[id].fullName || named[id].email}`}
                onClick={() => onChange(values.filter((v) => v !== id))}
                className="px-1.5 rounded-full text-pz-danger max-md:min-h-11 max-md:min-w-11"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="font-body text-xs text-pz-danger underline max-md:min-h-11"
          >
            Clear all
          </button>
        </div>
      )}

      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by name, email or phone…"
        className="w-full rounded-lg border border-pz-outline-variant px-3 py-1 font-body text-sm max-md:min-h-11 max-md:text-base"
      />

      {atCap && (
        <p className="font-body text-xs text-pz-danger">
          You have reached the limit of {MAX_PICKED_CONTACTS} specific contacts. Remove some to add more.
        </p>
      )}
      {searching && <p className="font-body text-xs text-pz-on-surface-variant">Searching…</p>}
      {searchError && <p className="font-body text-xs text-pz-danger">Could not search contacts.</p>}
      {!searching && !searchError && term.trim() !== "" && results.length === 0 && (
        <p className="font-body text-xs text-pz-on-surface-variant">No contacts found.</p>
      )}

      {results.length > 0 && (
        <ul className="space-y-1">
          {results.map((c) => {
            const flag = contactSendFlag(c, channel);
            const picked = values.includes(c.id);
            return (
              <li key={c.id} className="flex items-center gap-2 flex-wrap rounded-lg bg-pz-surface px-2 py-1 max-md:min-h-11">
                <span className="font-body text-sm">{c.fullName}</span>
                <span className="font-body text-xs text-pz-on-surface-variant flex-1 min-w-[120px] break-all">{c.email ?? c.phoneE164}</span>
                {flag && <span className="px-2 py-0.5 rounded-full bg-pz-surface-variant font-body text-xs text-pz-danger">{flag}</span>}
                <button
                  type="button"
                  disabled={picked || atCap || flag !== null}
                  aria-label={picked ? `${c.fullName} picked` : `Add ${c.fullName}`}
                  onClick={() => add(c)}
                  className="px-3 py-1 rounded-full bg-pz-surface-variant font-body text-xs disabled:opacity-50 max-md:min-h-11"
                >
                  {picked ? "Picked" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
