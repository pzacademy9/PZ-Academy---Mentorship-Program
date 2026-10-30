"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AUDIENCE_PRESETS, audienceFromJson, presetLiveWithModule, type Audience } from "@/lib/classes/audience";
import type { RecipientPreview } from "@/lib/data/audience-preview";
import { RecipientPreviewLists } from "@/components/admin/shared/RecipientPreviewLists";
import { previewClassAudience, saveClassAudience } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";
import { fieldCls, labelCls, primaryBtn } from "./styles";

const MODULE = "module";
type Choice = typeof MODULE | string | null;

function initialChoice(a: Audience | null): { choice: Choice; module: string } {
  if (!a) return { choice: null, module: "" };
  const preset = AUDIENCE_PRESETS.find((p) => p.audience.mode === a.mode && p.audience.modules === a.modules);
  if (preset) return { choice: preset.key, module: "" };
  if (a.mode === "live" && Array.isArray(a.modules) && a.modules.length === 1) return { choice: MODULE, module: String(a.modules[0]) };
  return { choice: null, module: "" };
}

/** A whole number from 1 to 12, or null. */
function moduleNumber(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= 1 && n <= 12 ? n : null;
}

export function AudiencePicker({
  pageId, sessionId, saved,
}: {
  pageId: string;
  sessionId: string;
  /** The class's stored audience (the raw column), or empty when none is chosen yet. */
  saved: unknown;
}) {
  const start = initialChoice(audienceFromJson(saved));
  const [choice, setChoice] = useState<Choice>(start.choice);
  const [moduleText, setModuleText] = useState(start.module);
  const [preview, setPreview] = useState<RecipientPreview | null>(null);
  /** The audience the lists on screen were loaded for. Save only works when it matches the current choice. */
  const [loadedFor, setLoadedFor] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const request = useRef(0);

  function audienceFor(c: Choice, text: string): Audience | null {
    if (c === MODULE) {
      const n = moduleNumber(text);
      return n === null ? null : presetLiveWithModule(n);
    }
    return AUDIENCE_PRESETS.find((p) => p.key === c)?.audience ?? null;
  }

  const audience = audienceFor(choice, moduleText);

  async function refreshPreview(a: Audience | null) {
    const id = ++request.current;
    setPreviewError("");
    setPreview(null);
    setLoadedFor("");
    if (!a) {
      setPreview(null);
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    try {
      const res = await previewClassAudience(pageId, sessionId, a);
      if (id === request.current) {
        setPreview(res);
        setLoadedFor(JSON.stringify(a));
      }
    } catch {
      if (id === request.current) {
        setPreview(null);
        setPreviewError("The list could not be loaded. Please try again.");
      }
    } finally {
      if (id === request.current) setPreviewing(false);
    }
  }

  // A class that already has an audience shows its lists straight away, so Save is meaningful.
  useEffect(() => {
    if (audience) void refreshPreview(audience);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listShown = !!audience && !!preview && !previewing && !previewError && loadedFor === JSON.stringify(audience);

  function pick(c: Choice) {
    setChoice(c);
    setNote(null);
    void refreshPreview(audienceFor(c, moduleText));
  }

  function changeModule(text: string) {
    setModuleText(text);
    setNote(null);
    if (choice === MODULE) void refreshPreview(audienceFor(MODULE, text));
  }

  async function save() {
    if (!audience || !listShown) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await saveClassAudience(pageId, sessionId, audience);
      setNote(res.ok ? { ok: true, text: "Saved. This class's emails will go to the people listed above." } : { ok: false, text: res.message });
    } catch {
      setNote({ ok: false, text: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const rowCls = (on: boolean) =>
    cn(
      "flex min-h-12 w-full items-center gap-3 rounded-lg border px-4 text-left font-headline text-base font-bold transition-colors",
      on ? "border-pz-primary bg-pz-primary/10 text-pz-on-surface" : "border-pz-outline-variant/60 text-pz-on-surface-variant hover:text-pz-on-surface",
    );
  const dot = (on: boolean) => (
    <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-pz-primary" : "border-pz-outline-variant")}>
      {on && <span className="size-2.5 rounded-full bg-pz-primary" />}
    </span>
  );

  return (
    <div data-testid="audience-picker" className="space-y-3 rounded-lg bg-pz-surface-container-low p-4">
      <h4 className="font-headline text-lg font-bold text-pz-on-surface">Who gets this</h4>
      <p className="text-base text-pz-on-surface-variant">Choose who receives this class&apos;s emails. Nobody is emailed until you choose.</p>
      <div role="radiogroup" aria-label="Who gets this" className="space-y-2">
        <button type="button" role="radio" aria-checked={choice === MODULE} className={rowCls(choice === MODULE)} onClick={() => pick(MODULE)}>
          {dot(choice === MODULE)}
          Live full course + Module N
        </button>
        {choice === MODULE && (
          <div className="pl-2">
            <label htmlFor={`aud-module-${sessionId}`} className={labelCls}>Module number (1 to 12)</label>
            <input
              id={`aud-module-${sessionId}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              required
              className={fieldCls}
              value={moduleText}
              onChange={(e) => changeModule(e.target.value)}
            />
          </div>
        )}
        {AUDIENCE_PRESETS.map((p) => (
          <button key={p.key} type="button" role="radio" aria-checked={choice === p.key} className={rowCls(choice === p.key)} onClick={() => pick(p.key)}>
            {dot(choice === p.key)}
            {p.label}
          </button>
        ))}
      </div>

      {previewing && <p role="status" className="text-base text-pz-on-surface-variant">Loading the list...</p>}
      {previewError && <p role="alert" className="text-base text-red-700 dark:text-red-300">{previewError}</p>}
      {preview && (
        <RecipientPreviewLists preview={preview} receivingTitle="Will get this email" notReceivingTitle="Will not get this email" />
      )}

      <button type="button" className={`${primaryBtn} max-md:w-full`} disabled={!listShown || saving} onClick={save}>
        {saving ? "Saving..." : "Save who gets this"}
      </button>
      {audience && !listShown && !saving && (
        <p className="text-base text-pz-on-surface-variant">Look at the two lists above, then save.</p>
      )}
      {note && (
        <p role={note.ok ? "status" : "alert"} className={cn("text-base", note.ok ? "text-emerald-800 dark:text-emerald-200" : "text-red-700 dark:text-red-300")}>
          {note.text}
        </p>
      )}
    </div>
  );
}
