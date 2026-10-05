"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Gauge, Hourglass, Moon, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { SafetySettings } from "@/lib/crm/send-limits";
import { quietSegments, settingsPatch, validateSettings } from "@/lib/crm/sales-admin-ui";

type NumKey = Exclude<keyof SafetySettings, "timezone">;
type Field = { key: NumKey; label: string; unit: string; help: string };
const FIELDS: { card: string; sub: string; icon: LucideIcon; items: Field[] }[] = [
  { card: "1. New chats per day and hour", sub: "How many new people one number may message", icon: Gauge, items: [
    { key: "daily_cap", label: "New chats per day, per number", unit: "chats", help: "Replies to people who already answered do not count." },
    { key: "hourly_cap", label: "New chats per hour, per number", unit: "chats", help: "The most new chats one number can start in any hour." },
    { key: "hourly_warn_at", label: "Warn the agent from this many in an hour", unit: "chats", help: "The agent's hour meter turns amber from here. It cannot be higher than the hourly limit." },
  ] },
  { card: "2. Gaps and breaks", sub: "Time between messages, and rests", icon: Hourglass, items: [
    { key: "spacing_min_s", label: "Gap between messages, from (seconds)", unit: "sec", help: "After each message the agent waits a random time between the two gap values." },
    { key: "spacing_max_s", label: "Gap between messages, to (seconds)", unit: "sec", help: "Must be at least the 'from' gap." },
    { key: "burst_size", label: "Break after this many messages", unit: "msgs", help: "After this many in a row, the agent must stop for a break." },
    { key: "burst_break_min", label: "Break length (minutes)", unit: "min", help: "How long that break lasts." },
  ] },
  { card: "3. Quiet hours (no sending)", sub: "Hours when agents cannot send", icon: Moon, items: [
    { key: "quiet_start_hour", label: "Quiet from (hour, 0-23)", unit: "hour", help: "Uses the time zone below. The same hour in both boxes turns quiet hours off." },
    { key: "quiet_end_hour", label: "Quiet until (hour, 0-23)", unit: "hour", help: "Sending opens again at this hour." },
  ] },
  { card: "4. New numbers and panic pause", sub: "Slow starts, and what happens after a warning", icon: ShieldCheck, items: [
    { key: "warmup_start", label: "New numbers start at (new chats a day)", unit: "a day", help: "A new number may start this many new chats on its first day." },
    { key: "warmup_step", label: "Then add this many each day", unit: "a day", help: "Its daily limit grows by this much each day until it reaches the limit above." },
    { key: "freeze_hours", label: "Panic pause lasts (hours)", unit: "hours", help: "How long a number stays paused after an agent reports a WhatsApp warning." },
  ] },
];

const inputClass =
  "w-24 bg-pz-surface-container-lowest rounded-lg px-3 py-2 max-md:min-h-11 text-center text-sm font-headline font-bold text-pz-on-surface shadow-sm focus:outline-none focus:ring-2 focus:ring-pz-primary/20";

export function SettingsSection({ settings, onSaved }: { settings: SafetySettings; onSaved: (s: SafetySettings) => void }) {
  const [draft, setDraft] = useState<SafetySettings>(settings);
  // Reset the draft only when the stored values really changed, so a refresh
  // triggered by a number action does not wipe unsaved edits.
  const lastStored = useRef(settings);
  useEffect(() => {
    if (Object.keys(settingsPatch(lastStored.current, settings)).length > 0) setDraft(settings);
    lastStored.current = settings;
  }, [settings]);
  const patch = settingsPatch(settings, draft);
  const dirty = Object.keys(patch).length > 0;
  const problems = dirty ? validateSettings(draft) : [];

  const { run: save, pending } = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/admin/sales/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => null)) as { settings?: SafetySettings; error?: string } | null;
      if (!res.ok || !body?.settings) {
        toast.error(body?.error ?? "Could not save the settings.");
        return;
      }
      toast.success("Saved. Changes apply to the next message an agent sends.");
      onSaved(body.settings);
    } catch {
      toast.error("Could not save the settings.");
    }
  });

  const saveButton = (
    <Button
      type="button"
      variant="bare"
      size="bare"
      disabled={!dirty || problems.length > 0}
      loading={pending}
      onClick={() => void save()}
      className="min-h-11 px-5 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-xs tracking-wider uppercase shadow-md hover:bg-pz-on-primary-container transition-all disabled:opacity-100 disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant disabled:shadow-none"
    >
      Save settings
    </Button>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-headline font-bold text-lg md:text-xl text-pz-on-surface">Team-wide rules</h2>
          <p className="text-xs md:text-sm text-pz-on-surface-variant">These apply to every number. Every value here is a cautious default, not a promise from WhatsApp.</p>
        </div>
        {saveButton}
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="bg-pz-error-container text-pz-on-error-container rounded-lg p-3 text-sm list-disc pl-8">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {FIELDS.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.card} className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-pz-primary/10 text-pz-primary flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="flex flex-col">
                  <h3 className="font-headline font-bold text-base text-pz-on-surface">{group.card}</h3>
                  <span className="text-xs text-pz-outline font-body">{group.sub}</span>
                </div>
              </div>
              {group.items.map((f) => (
                <div key={f.key} className="flex flex-col gap-2 bg-pz-surface-container-low/50 p-4 rounded-lg">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`set-${f.key}`} className="font-headline font-bold text-xs text-pz-on-surface">{f.label}</label>
                    <span className="flex items-center gap-1 shrink-0">
                      <input
                        id={`set-${f.key}`}
                        type="number"
                        inputMode="numeric"
                        value={Number.isNaN(draft[f.key]) ? "" : draft[f.key]}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value === "" ? NaN : Number(e.target.value) }))}
                        className={inputClass}
                      />
                      <span className="text-xs text-pz-outline font-sans w-12">{f.unit}</span>
                    </span>
                  </div>
                  <p className="text-xs font-body text-pz-on-surface-variant leading-relaxed">{f.help}</p>
                </div>
              ))}
              {group.card.startsWith("3.") && (
                <>
                  <div className="flex flex-col gap-2 p-3 bg-pz-surface-container-low/30 rounded-lg">
                    <div className="flex items-center justify-between text-[11px] font-headline font-bold text-pz-outline">
                      <span>00:00</span>
                      <span>12:00</span>
                      <span>24:00</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-pz-surface-container-high overflow-hidden flex" aria-hidden="true">
                      {quietSegments(
                        Number.isFinite(draft.quiet_start_hour) ? draft.quiet_start_hour : 0,
                        Number.isFinite(draft.quiet_end_hour) ? draft.quiet_end_hour : 0,
                      ).map((s) => (
                        <div
                          key={s.from}
                          className={s.quiet ? "h-full bg-pz-inverse-surface" : "h-full bg-pz-primary-container"}
                          style={{ width: `${((s.to - s.from) / 24) * 100}%` }}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-pz-on-surface-variant font-body">Dark = no sending. Green = sending allowed.</p>
                  </div>
                  <div className="flex flex-col gap-2 bg-pz-surface-container-low/50 p-4 rounded-lg">
                    <label htmlFor="set-timezone" className="font-headline font-bold text-xs text-pz-on-surface">Time zone</label>
                    <input
                      id="set-timezone"
                      value={draft.timezone}
                      onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
                      className="w-full bg-pz-surface-container-lowest rounded-lg px-3 py-2 max-md:min-h-11 text-sm font-body text-pz-on-surface shadow-sm focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
                    />
                    <p className="text-xs text-pz-on-surface-variant">Replies to people who wrote first are still blocked at night; only the caps ignore them.</p>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {dirty && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 z-30 bg-pz-surface-container-lowest/95 backdrop-blur-md rounded-xl shadow-xl p-3 md:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-sm text-pz-on-surface-variant">Changes apply to the next message an agent sends.</span>
          <span className="flex gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setDraft(settings)}
              className="min-h-11 px-4 rounded-lg bg-pz-surface-container-low font-headline font-semibold text-xs text-pz-on-surface hover:bg-pz-surface-container-high transition-colors"
            >
              Discard
            </button>
            {saveButton}
          </span>
        </div>
      )}
    </section>
  );
}
