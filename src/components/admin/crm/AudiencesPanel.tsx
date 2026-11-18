"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Info } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import {
  DEFAULT_AUDIENCE_FILTER, encodeAudienceFilter, type AudienceFilter,
} from "@/lib/crm/audience-filter";
import type { AudienceFacets } from "@/lib/data/audience-query";
import type { SavedAudience } from "@/lib/data/audience-saved";
import { AudienceFilters } from "@/components/admin/crm/AudienceFilters";
import { AudienceResultCard, type CountState } from "@/components/admin/crm/AudienceResultCard";
import { BringInDialog } from "@/components/admin/crm/BringInDialog";

const COUNT_URL = "/api/admin/crm/audiences/count";
const SAVED_URL = "/api/admin/crm/audiences/saved";
const GENERIC = "Something went wrong. Please try again.";
const DEBOUNCE_MS = 400;

const fieldClass =
  "min-h-11 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-base md:text-sm";
const textButton = "min-h-11 font-body text-sm text-pz-primary underline disabled:opacity-50";

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof json.error === "string" ? json.error : GENERIC;
}

function IgnoredWarning({ choices, alert = false }: { choices: string[]; alert?: boolean }) {
  if (choices.length === 0) return null;
  return (
    <p role={alert ? "alert" : undefined} className="flex items-start gap-2 rounded-xl bg-pz-surface-container-high p-3 font-body text-sm font-semibold text-pz-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>These choices no longer exist and are ignored: {choices.join(", ")}</span>
    </p>
  );
}

export function AudiencesPanel({
  facets: initialFacets,
  saved: initialSaved,
  needsUpdate,
}: {
  facets: AudienceFacets;
  saved: SavedAudience[];
  needsUpdate: boolean;
}) {
  const confirm = useConfirm();
  const [facets, setFacets] = useState(initialFacets);
  const [filter, setFilter] = useState<AudienceFilter>(DEFAULT_AUDIENCE_FILTER);
  const [count, setCount] = useState<CountState>({ status: "idle", key: "" });
  const [saved, setSaved] = useState(initialSaved);
  const [savedId, setSavedId] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const key = encodeAudienceFilter(filter);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const firstRender = useRef(true);

  const runCount = useCallback(async (f: AudienceFilter) => {
    if (timer.current) clearTimeout(timer.current);
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const k = encodeAudienceFilter(f);
    setCount({ status: "loading", key: k });
    try {
      const res = await fetch(COUNT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
        signal: c.signal,
      });
      if (!res.ok) {
        const error = await readError(res);
        if (!c.signal.aborted) setCount({ status: "error", key: k, error });
        return;
      }
      const data = await res.json();
      if (!c.signal.aborted) setCount({ status: "done", key: k, data });
    } catch {
      if (!c.signal.aborted) setCount({ status: "error", key: k, error: "Could not count. Please try again." });
    }
  }, []);

  // Count again 400 ms after the last change, never per keystroke; a newer change cancels the older call.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    ctrl.current?.abort();
    timer.current = setTimeout(() => void runCount(filterRef.current), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, runCount]);

  useEffect(() => () => ctrl.current?.abort(), []);

  const changeFilter = (f: AudienceFilter) => {
    setFilter(f);
    setSavedId("");
    setRenaming(false);
  };

  const selected = saved.find((s) => s.id === savedId) ?? null;

  function loadSaved(id: string) {
    setRenaming(false);
    if (id === "") {
      setSavedId("");
      return;
    }
    const item = saved.find((s) => s.id === id);
    if (!item || item.invalid || !item.filter) return; // needs checking: cannot be loaded
    setFilter(item.filter);
    setSavedId(item.id);
  }

  const { run: save, pending: saving } = useAsyncAction(async () => {
    setSaveError(null);
    try {
      const res = await fetch(SAVED_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName, filter }),
      });
      if (!res.ok) {
        setSaveError(await readError(res));
        return;
      }
      const { item } = (await res.json()) as { item: SavedAudience };
      setSaved((prev) => [item, ...prev.filter((s) => s.id !== item.id)]);
      setSavedId(item.id);
      setSaveOpen(false);
      setSaveName("");
      toast.success("Audience saved.");
    } catch {
      setSaveError(GENERIC);
    }
  });

  const { run: rename, pending: renamingBusy } = useAsyncAction(async () => {
    if (!selected) return;
    setRenameError(null);
    try {
      const res = await fetch(`${SAVED_URL}/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName }),
      });
      if (!res.ok) {
        setRenameError(await readError(res));
        return;
      }
      const { item } = (await res.json()) as { item: SavedAudience };
      setSaved((prev) => prev.map((s) => (s.id === item.id ? item : s)));
      setRenaming(false);
      toast.success("Name changed.");
    } catch {
      setRenameError(GENERIC);
    }
  });

  const { run: remove, pending: removing } = useAsyncAction(async () => {
    if (!selected) return;
    const ok = await confirm({
      title: "Delete this saved audience?",
      description: `"${selected.name}" will be removed from the list. Nobody in the CRM is changed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`${SAVED_URL}/${selected.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }
      setSaved((prev) => prev.filter((s) => s.id !== selected.id));
      setSavedId("");
      toast.success("Saved audience deleted.");
    } catch {
      toast.error(GENERIC);
    }
  });

  const refreshAfterBringIn = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/crm/audiences/facets");
      if (res.ok) setFacets((await res.json()) as AudienceFacets);
    } catch {
      // The page still works with the older choices.
    }
    void runCount(filterRef.current);
  }, [runCount]);

  const ignored = count.status === "done" && count.key === key ? count.data.ignoredChoices : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold text-pz-secondary">Audiences</h1>
          <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
            Build a list of people for Meta ads. Choose who to include, check the count, then download.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <BringInDialog landingPages={facets.landingPages} onDone={() => void refreshAfterBringIn()} />
          <div className="flex flex-col gap-1">
            <label htmlFor="saved-audiences" className="font-body text-xs font-medium text-pz-on-surface-variant">
              Saved audiences
            </label>
            <select id="saved-audiences" value={savedId} onChange={(e) => loadSaved(e.target.value)} className={fieldClass}>
              <option value="">{saved.length === 0 ? "None saved yet" : "Choose one"}</option>
              {saved.map((s) => (
                <option key={s.id} value={s.id} disabled={s.invalid || !s.filter}>
                  {s.invalid || !s.filter ? `${s.name} (needs checking)` : s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selected && (
        <div className="flex flex-wrap items-center gap-3">
          {renaming ? (
            <>
              <label htmlFor="rename-audience" className="sr-only">New name</label>
              <input
                id="rename-audience"
                value={renameName}
                maxLength={80}
                onChange={(e) => setRenameName(e.target.value)}
                className={`${fieldClass} w-full sm:w-72`}
              />
              <button type="button" onClick={() => void rename()} disabled={renamingBusy} className={textButton}>
                {renamingBusy ? "Saving…" : "Save name"}
              </button>
              <button type="button" onClick={() => setRenaming(false)} disabled={renamingBusy} className={textButton}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="font-body text-sm text-pz-on-surface-variant">Loaded: {selected.name}</span>
              <button
                type="button"
                onClick={() => {
                  setRenameName(selected.name);
                  setRenameError(null);
                  setRenaming(true);
                }}
                className={textButton}
              >
                Rename
              </button>
              <button type="button" onClick={() => void remove()} disabled={removing} className={`${textButton} text-pz-danger`}>
                {removing ? "Deleting…" : "Delete"}
              </button>
            </>
          )}
          {renameError && <p className="w-full font-body text-sm text-pz-danger">{renameError}</p>}
        </div>
      )}

      {needsUpdate && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-pz-surface-container-high p-3 font-body text-sm text-pz-on-surface-variant">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This page needs one small database update first. The steps are in the file
            2026-11-17-meta-audiences-filters-owner-steps.md. Downloads on the Cohorts page still work.
          </span>
        </p>
      )}

      <IgnoredWarning choices={ignored} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="font-headline text-lg font-bold text-pz-secondary">Who to include</h2>
          <AudienceFilters filter={filter} facets={facets} onChange={changeFilter} />
          <button type="button" onClick={() => changeFilter(DEFAULT_AUDIENCE_FILTER)} className={textButton}>
            Reset filters
          </button>
        </div>

        <AudienceResultCard
          className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 self-end lg:bottom-auto lg:top-4 lg:self-start"
          count={count}
          currentKey={key}
          onCheck={() => void runCount(filter)}
          ignored={<IgnoredWarning choices={ignored} alert />}
          save={
            saveOpen ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <label htmlFor="save-audience-name" className="sr-only">Audience name</label>
                <input
                  id="save-audience-name"
                  value={saveName}
                  maxLength={80}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Name, for example Gulf recorded buyers"
                  className={`${fieldClass} w-full`}
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving || saveName.trim() === ""}
                    className="min-h-11 rounded-full bg-pz-primary px-5 py-2 font-headline text-sm font-semibold text-pz-on-primary disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setSaveOpen(false)} disabled={saving} className={textButton}>
                    Cancel
                  </button>
                </div>
                {saveError && <p className="font-body text-sm text-pz-danger">{saveError}</p>}
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSaveError(null);
                  setSaveOpen(true);
                }}
                className={textButton}
              >
                Save this audience
              </button>
            )
          }
        />
      </div>
    </div>
  );
}
