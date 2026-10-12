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
  named,
  onName,
  onChange,
}: {
  values: string[];
  channel: "email" | "whatsapp";
  /** Names of people picked here, owned by the parent so they survive remounts. */
  named: Record<string, PickerContact>;
  onName: (contact: PickerContact) => void;
  onChange: (ids: string[]) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickerContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = term.trim();
    if (q === "") {
      requestId.current += 1;
      setResults([]);
      setSearching(false);
      setSearchError(false);
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
    return () => {
      clearTimeout(timer);
      // Invalidate any in-flight response so it cannot render for a stale term.
      requestId.current += 1;
    };
  }, [term]);

  const atCap = values.length >= MAX_PICKED_CONTACTS;
  const chips = values.filter((id) => named[id]);
  const unnamedCount = values.length - chips.length;

  function add(contact: PickerContact) {
    onName(contact);
    onChange(mergeContactIds(values, [contact.id]));
  }

  return (
    <div className="flex-1 min-w-[240px] space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {unnamedCount > 0 && (
            <span className="font-body text-xs text-pz-on-surface-variant">
              {unnamedCount} contact{unnamedCount === 1 ? "" : "s"} selected
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
        type="search"
        aria-label="Search contacts"
        placeholder="Search by name, email or phone…"
        className="w-full rounded-lg border border-pz-outline-variant px-3 py-1 font-body text-sm max-md:min-h-11 max-md:text-base"
      />

      {atCap && (
        <p role="status" className="font-body text-xs text-pz-danger">
          You have reached the limit of {MAX_PICKED_CONTACTS} specific contacts. Remove some to add more.
        </p>
      )}
      {searching && <p role="status" className="font-body text-xs text-pz-on-surface-variant">Searching…</p>}
      {searchError && <p role="status" className="font-body text-xs text-pz-danger">Could not search contacts.</p>}
      {!searching && !searchError && term.trim() !== "" && results.length === 0 && (
        <p role="status" className="font-body text-xs text-pz-on-surface-variant">No contacts found.</p>
      )}

      {results.length > 0 && (
        <ul className="space-y-1">
          {results.map((c) => {
            const flag = contactSendFlag(c, channel);
            const picked = values.includes(c.id);
            const label = c.fullName || c.email || c.phoneE164 || "contact";
            const detail = channel === "whatsapp" ? (c.phoneE164 ?? c.email) : (c.email ?? c.phoneE164);
            return (
              <li key={c.id} className="flex items-center gap-2 flex-wrap rounded-lg bg-pz-surface px-2 py-1 max-md:min-h-11">
                <span className="font-body text-sm">{label}</span>
                <span className="font-body text-xs text-pz-on-surface-variant flex-1 min-w-[120px] break-all">{detail}</span>
                {flag && <span id={`flag-${c.id}`} className="px-2 py-0.5 rounded-full bg-pz-surface-variant font-body text-xs text-pz-danger">{flag}</span>}
                <button
                  type="button"
                  disabled={picked || atCap || flag !== null}
                  aria-label={picked ? `${label} picked` : `Add ${label}`}
                  aria-describedby={flag ? `flag-${c.id}` : undefined}
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
