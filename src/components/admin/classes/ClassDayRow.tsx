"use client";

import { Pencil, Trash2 } from "lucide-react";
import { dateWords } from "./ClassCalendar";
import { fieldCls, labelCls, quietBtn } from "./styles";

export type DayState = {
  date: string;
  existingId?: string;
  /** The class number the server gave an existing class. */
  number?: number;
  hasData: boolean;
  title: string;
  speaker: string;
  start: string;
  end: string;
  zoom: string;
  /** The inline own-time box is open. */
  editing: boolean;
};

export function ownWords(d: Pick<DayState, "start" | "end" | "zoom">): string | null {
  const time = d.start !== "" || d.end !== "";
  const link = d.zoom !== "";
  if (time && link) return "Own time and link";
  if (time) return "Own time";
  if (link) return "Own link";
  return null;
}

export function ClassDayRow({
  day, onChange, onRemove,
}: {
  day: DayState;
  onChange: (patch: Partial<DayState>) => void;
  onRemove: () => void;
}) {
  const own = ownWords(day);
  return (
    <li
      data-testid={`day-row-${day.date}`}
      data-highlight={own ? "true" : "false"}
      className={`rounded-xl border p-4 ${own ? "border-pz-primary bg-pz-primary/5" : "border-pz-outline-variant/60 bg-pz-surface-container-lowest"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-headline text-base font-bold text-pz-on-surface">{day.existingId ? `Day ${day.number}` : "New"}: {dateWords(day.date)}</p>
          <p className={`text-base ${own ? "font-bold text-pz-primary" : "text-pz-on-surface-variant"}`}>
            {own ?? "Same as default"}
          </p>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove the class on ${dateWords(day.date)}`}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-pz-danger hover:bg-pz-surface-container-low">
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor={`topic-${day.date}`}>Topic title (optional)</label>
          <input id={`topic-${day.date}`} className={fieldCls} value={day.title} onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`speaker-${day.date}`}>Speaker (optional)</label>
          <input id={`speaker-${day.date}`} className={fieldCls} value={day.speaker} onChange={(e) => onChange({ speaker: e.target.value })} />
        </div>
      </div>

      <button type="button" className={`${quietBtn} mt-3`} onClick={() => onChange({ editing: !day.editing })}>
        <Pencil className="h-4 w-4" /> Change just this day
      </button>

      {day.editing && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor={`start-${day.date}`}>Starts (Pakistan time)</label>
            <input id={`start-${day.date}`} type="time" className={fieldCls} value={day.start} onChange={(e) => onChange({ start: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`end-${day.date}`}>Ends (Pakistan time)</label>
            <input id={`end-${day.date}`} type="time" className={fieldCls} value={day.end} onChange={(e) => onChange({ end: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`zoom-${day.date}`}>Zoom link for this day</label>
            <input id={`zoom-${day.date}`} type="url" className={fieldCls} value={day.zoom} onChange={(e) => onChange({ zoom: e.target.value })} />
          </div>
          <p className="text-base text-pz-on-surface-variant md:col-span-3">Leave a box empty to use the default.</p>
        </div>
      )}
    </li>
  );
}
