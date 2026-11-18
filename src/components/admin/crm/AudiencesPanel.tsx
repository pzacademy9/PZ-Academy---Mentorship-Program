"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Info } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import {
  DEFAULT_AUDIENCE_FILTER, encodeAudienceFilter, type AudienceFilter,
} from "@/lib/crm/audience-filter";
import type { AudienceFacets } from "@/lib/data/audience-query";
import type { SavedAudience } from "@/lib/data/audience-saved";
import { AudienceCheckStep } from "@/components/admin/crm/AudienceCheckStep";
import { AudienceDownloadStep } from "@/components/admin/crm/AudienceDownloadStep";
import type { AudiencePreview } from "@/lib/crm/audience-preview";
import { AudienceFilters } from "@/components/admin/crm/AudienceFilters";
import type { CountState } from "@/components/admin/crm/AudienceResultCard";
import { AudienceStepper, type AudienceStep } from "@/components/admin/crm/AudienceStepper";
import { AudienceSummary, ChoiceSentence } from "@/components/admin/crm/AudienceSummary";
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

// Shown once, inside the summary card.
function IgnoredWarning({ choices }: { choices: string[] }) {
  if (choices.length === 0) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-pz-surface-container-high p-3 font-body text-sm font-semibold text-pz-danger">
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
  const [savedOpen, setSavedOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // null until a count has finished; then the latest count alone decides.
  const [statusFlag, setStatusFlag] = useState<boolean | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [step, setStep] = useState<AudienceStep>(1);
  // Set when a saved audience is loaded: go to step 2 once its own count has finished.
  // The last choices that had a finished count; a recount of the same choices keeps the later steps open.
  const [reachedKey, setReachedKey] = useState<string | null>(null);
  // The preview belongs to the choices it was fetched for; it is never used for any other key.
  const [previewState, setPreviewState] = useState<{ key: string; preview: AudiencePreview } | null>(null);
  const [goToCheckKey, setGoToCheckKey] = useState<string | null>(null);

  const key = encodeAudienceFilter(filter);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const firstRender = useRef(true);

  const runCount = useCallback(async (f: AudienceFilter, fresh = false) => {
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
        body: JSON.stringify(fresh ? { ...f, fresh: true } : f),
        signal: c.signal,
      });
      if (!res.ok) {
        const error = await readError(res);
        if (!c.signal.aborted) setCount({ status: "error", key: k, error });
        return;
      }
      const data = await res.json();
      if (!c.signal.aborted) {
        setCount({ status: "done", key: k, data });
        // Only a count that can go on unlocks the later steps.
        setReachedKey(!data.tooLarge && !data.needsUpdate && data.inFile > 0 ? k : null);
        setStatusFlag(!!data?.statusNeedsUpdate);
      }
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

  // A number for the current choices unlocks the later steps; any change to the choices locks them again.
  const preview = previewState && previewState.key === key ? previewState.preview : null;
  // 2 after a usable count for these choices; 3 only once the list for these choices has been looked at.
  const maxStep: AudienceStep = reachedKey === key ? (preview ? 3 : 2) : 1;

  // If the number is being recounted (for example after Bring in), later steps lock and we return to step 1.
  useEffect(() => {
    if (step > maxStep) setStep(maxStep);
  }, [step, maxStep]);

  // Move keyboard focus to the new step heading whenever the step changes (not on first mount).
  const stepMounted = useRef(false);
  useEffect(() => {
    if (!stepMounted.current) {
      stepMounted.current = true;
      return;
    }
    document.querySelector<HTMLElement>("[data-step-heading]")?.focus();
  }, [step]);

  useEffect(() => {
    if (goToCheckKey === null || count.key !== goToCheckKey || count.status === "idle" || count.status === "loading") return;
    setGoToCheckKey(null);
    if (count.status === "done" && count.data.inFile > 0 && !count.data.tooLarge && !count.data.needsUpdate) setStep(2);
  }, [count, goToCheckKey]);

  const changeFilter = (f: AudienceFilter) => {
    setFilter(f);
    // Same choices again (for example Reset on the defaults): the finished count still stands.
    if (encodeAudienceFilter(f) !== key) {
      setReachedKey(null);
      setPreviewState(null);
      setStep(1);
    }
    setGoToCheckKey(null);
    setSavedId("");
    setRenamingId(null);
  };

  const selected = saved.find((s) => s.id === savedId) ?? null;

  function loadSaved(id: string) {
    setRenamingId(null);
    const item = saved.find((s) => s.id === id);
    if (!item || item.invalid || !item.filter) return; // needs checking: cannot be loaded
    const k = encodeAudienceFilter(item.filter);
    setFilter(item.filter);
    setSavedId(item.id);
    setSavedOpen(false);
    if (k === key) {
      // Same choices as now: no recount happens by itself, so go on or count once.
      if (reachedKey === key) {
        setStep(2);
      } else {
        setGoToCheckKey(k);
        void runCount(item.filter);
      }
      return;
    }
    setReachedKey(null);
    setPreviewState(null);
    setStep(1);
    setGoToCheckKey(k);
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
    if (!renamingId) return;
    setRenameError(null);
    try {
      const res = await fetch(`${SAVED_URL}/${renamingId}`, {
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
      setRenamingId(null);
      titleRef.current?.focus();
      toast.success("Name changed.");
    } catch {
      setRenameError(GENERIC);
    }
  });

  const { run: remove, pending: removing } = useAsyncAction(async (target: SavedAudience) => {
    const ok = await confirm({
      title: "Delete this saved audience?",
      description: `"${target.name}" will be removed from the list. Nobody in the CRM is changed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`${SAVED_URL}/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }
      setSaved((prev) => prev.filter((s) => s.id !== target.id));
      setSavedId((cur) => (cur === target.id ? "" : cur));
      titleRef.current?.focus();
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
    // Another server instance may have older data: ask this count to read fresh, and look at the list again.
    setPreviewState(null);
    void runCount(filterRef.current, true);
  }, [runCount]);

  const ignored = count.status === "done" && count.key === key ? count.data.ignoredChoices : [];
  const sentence = <ChoiceSentence filter={filter} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold text-pz-secondary">Audiences</h1>
          <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
            Build a list of people for Meta ads in three steps: choose who, check the number, download.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <BringInDialog landingPages={facets.landingPages} onDone={() => void refreshAfterBringIn()} />
          <Dialog open={savedOpen} onOpenChange={(o) => { setSavedOpen(o); if (!o) setRenamingId(null); }}>
            <DialogTrigger asChild>
              <button type="button" className={textButton}>Saved audiences</button>
            </DialogTrigger>
            <DialogContent className="md:max-w-xl">
              <DialogHeader>
                <DialogTitle ref={titleRef} tabIndex={-1} className="font-headline text-pz-secondary outline-none">Saved audiences</DialogTitle>
                <DialogDescription className="font-body text-pz-on-surface-variant">
                  Load a list you saved before, change its name, or delete it.
                </DialogDescription>
              </DialogHeader>
              {saved.length === 0 ? (
                <p className="font-body text-sm text-pz-on-surface-variant">Nothing saved yet.</p>
              ) : (
                <ul className="max-h-[50dvh] space-y-2 overflow-y-auto">
                  {saved.map((s) => {
                    const unusable = s.invalid || !s.filter;
                    return (
                      <li key={s.id} className="space-y-2 rounded-xl border border-pz-outline-variant p-3">
                        {renamingId === s.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor="rename-audience" className="sr-only">New name</label>
                            <input
                              id="rename-audience"
                              value={renameName}
                              maxLength={80}
                              onChange={(e) => setRenameName(e.target.value)}
                              className={`${fieldClass} w-full`}
                            />
                            <button type="button" onClick={() => void rename()} disabled={renamingBusy} className={textButton}>
                              {renamingBusy ? "Saving…" : "Save name"}
                            </button>
                            <button type="button" onClick={() => setRenamingId(null)} disabled={renamingBusy} className={textButton}>
                              Cancel
                            </button>
                            {renameError && <p className="w-full font-body text-sm text-pz-danger">{renameError}</p>}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-3">
                            <span className="min-w-0 flex-1 font-body text-sm">
                              {unusable ? `${s.name} (needs checking)` : s.name}
                            </span>
                            <button
                              type="button"
                              aria-label={`Load ${s.name}`}
                              disabled={unusable}
                              onClick={() => loadSaved(s.id)}
                              className={textButton}
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              aria-label={`Rename ${s.name}`}
                              onClick={() => {
                                setRenameName(s.name);
                                setRenameError(null);
                                setRenamingId(s.id);
                              }}
                              className={textButton}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${s.name}`}
                              onClick={() => void remove(s)}
                              disabled={removing}
                              className={`${textButton} text-pz-danger`}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {selected && (
        <p className="font-body text-sm text-pz-on-surface-variant">Loaded: {selected.name}</p>
      )}

      {needsUpdate && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-pz-surface-container-high p-3 font-body text-sm text-pz-on-surface-variant">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This page needs one small one-time setup step first. Ask for it and the page will work.
            Downloads on the Cohorts page still work.
          </span>
        </p>
      )}

      <AudienceStepper step={step} maxStep={maxStep} onGo={setStep} />

      {step === 2 && (
        <AudienceCheckStep
          filter={filter}
          filterKey={key}
          preview={preview}
          sentence={sentence}
          onLoaded={(k, p) => setPreviewState({ key: k, preview: p })}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && preview && (
        <AudienceDownloadStep
          filter={filter}
          filterKey={key}
          preview={preview}
          sentence={sentence}
          ignored={<IgnoredWarning choices={ignored} />}
          onBack={() => setStep(2)}
        />
      )}

      {step === 1 && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 data-step-heading tabIndex={-1} className="font-headline text-lg font-bold text-pz-secondary outline-none">Who do you want?</h2>
          {(statusFlag ?? facets.statusNeedsUpdate) && !needsUpdate && (
            <p className="flex items-start gap-2 rounded-xl bg-pz-surface-container-high p-3 font-body text-sm text-pz-on-surface-variant">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Reserved, Pending, Part-paid and Free cannot be told apart yet. One small setup step is waiting.</span>
            </p>
          )}
          <AudienceFilters filter={filter} facets={facets} onChange={changeFilter} />
        </div>

        <AudienceSummary
          filter={filter}
          nextLabel="Next: Check the list"
          onNext={() => setStep(2)}
          onReset={() => changeFilter(DEFAULT_AUDIENCE_FILTER)}
          className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 max-h-[50dvh] self-end overflow-y-auto lg:bottom-auto lg:top-4 lg:max-h-none lg:self-start lg:overflow-visible"
          count={count}
          currentKey={key}
          onCheck={() => void runCount(filter)}
          ignored={<IgnoredWarning choices={ignored} />}
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
      )}
    </div>
  );
}
