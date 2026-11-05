"use client";

import { ArrowDown, ArrowUp, Award, Globe, Plus, Trash2 } from "lucide-react";
import { LibraryImageField } from "@/components/admin/landing/LibraryImageField";
import type { CourseType } from "@/lib/data/lms";
import { PROGRAM_COPY } from "@/lib/program-copy";
import { TOPIC_MAX } from "@/lib/marketing/topics";
import { RECORDED_AFTER_HOURS } from "@/lib/marketing/webinar-time";
import { isoToPktInput, pktToIso } from "@/lib/attendance/rules";
import {
  SECTION_LABEL,
  SECTION_TITLE_MAX,
  sectionTitle,
  type PageSection,
  type PublicPageFields,
} from "@/lib/marketing/course-sections";

export type PublicPageValue = PublicPageFields;

const inputClass =
  "w-full min-w-0 border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base min-h-11 font-body bg-pz-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";
const legendClass = "font-headline text-sm font-bold text-pz-on-surface";
const helpClass = "mt-1 font-body text-xs text-pz-on-surface-variant";
const iconBtn =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-pz-outline-variant text-pz-on-surface-variant transition-colors hover:bg-pz-surface-container-low disabled:cursor-not-allowed disabled:opacity-40";
const addBtn =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-pz-outline-variant px-4 font-headline text-sm font-bold text-pz-primary transition-colors hover:bg-pz-surface-container-low disabled:opacity-40";

const MAX_LINES = 20;
const MAX_FAQS = 30;

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function RowButtons({ index, count, name, onMove, onRemove }: { index: number; count: number; name: string; onMove: (to: number) => void; onRemove?: () => void }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <button type="button" className={iconBtn} aria-label={`Move up: ${name}`} disabled={index === 0} onClick={() => onMove(index - 1)}>
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" className={iconBtn} aria-label={`Move down: ${name}`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {onRemove && (
        <button type="button" className={`${iconBtn} hover:text-pz-danger`} aria-label={`Remove: ${name}`} onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Editable list of short lines ("What you'll learn", "This course includes"). */
function LineList({ legend, help, lines, onChange }: { legend: string; help: string; lines: string[]; onChange: (lines: string[]) => void }) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className={legendClass}>{legend}</legend>
      <p className={helpClass}>{help}</p>
      <ul className="space-y-2">
        {lines.map((line, i) => (
          <li key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              aria-label={`${legend}, line ${i + 1}`}
              value={line}
              maxLength={200}
              onChange={(e) => onChange(lines.map((l, j) => (j === i ? e.target.value : l)))}
              className={inputClass}
            />
            <RowButtons
              index={i}
              count={lines.length}
              name={`line ${i + 1}`}
              onMove={(to) => onChange(move(lines, i, to))}
              onRemove={() => onChange(lines.filter((_, j) => j !== i))}
            />
          </li>
        ))}
      </ul>
      <button type="button" className={addBtn} disabled={lines.length >= MAX_LINES} onClick={() => onChange([...lines, ""])}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add a line
      </button>
    </fieldset>
  );
}

/**
 * "Public page" card of the course editor: what the public course page shows
 * and in which order. Built in the course editor's own style (owner's choice,
 * 2026-11-04: no separate Stitch screen).
 */
export function PublicPageEditor({
  value,
  onChange,
  courseSlug,
  courseType,
  topicOptions = [],
}: {
  value: PublicPageValue;
  onChange: (next: PublicPageValue) => void;
  courseSlug: string;
  courseType: CourseType;
  /** Topics already used on other courses, offered as suggestions. */
  topicOptions?: string[];
}) {
  const copy = PROGRAM_COPY[courseType];
  const set = <K extends keyof PublicPageValue>(key: K, v: PublicPageValue[K]) => onChange({ ...value, [key]: v });

  // A webinar has no certificate: its row is kept in the saved list but not shown here.
  const allowed = (s: PageSection) => copy.showCertificate || s.key !== "certificate";
  const shown = value.pageSections.filter(allowed);
  const setShown = (next: PageSection[]) => set("pageSections", [...next, ...value.pageSections.filter((s) => !allowed(s))]);

  return (
    <section className="bg-pz-surface-container-lowest p-4 sm:p-8 rounded-xl border border-pz-outline-variant space-y-8">
      <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
        <Globe className="w-5 h-5 text-pz-primary" />
        Public Page
      </h3>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Topic buttons exist on the Courses and Workshops lists only. */}
        {(courseType === "course" || courseType === "workshop") && (
          <div className="sm:col-span-2">
            <label htmlFor="course-topic" className={labelClass}>Topic</label>
            <input
              id="course-topic"
              type="text"
              list="course-topic-options"
              placeholder="e.g. Clinical Pharmacy"
              value={value.topic}
              maxLength={TOPIC_MAX}
              onChange={(e) => set("topic", e.target.value)}
              className={inputClass}
            />
            <datalist id="course-topic-options">
              {topicOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className={helpClass}>Shown as a button on the {copy.noun} list, so visitors can pick a topic. Use the same spelling for courses of the same topic. Leave empty for none.</p>
          </div>
        )}

        {courseType === "webinar" && (
          <div className="sm:col-span-2">
            <label htmlFor="webinar-starts" className={labelClass}>Webinar date and time (Pakistan time)</label>
            <input
              id="webinar-starts"
              type="datetime-local"
              value={value.startsAt ? isoToPktInput(value.startsAt) : ""}
              onChange={(e) => set("startsAt", e.target.value ? pktToIso(e.target.value) ?? "" : "")}
              className={inputClass}
            />
            <p className={helpClass}>
              Shows the date and an Add to calendar button. {RECORDED_AFTER_HOURS} hours after it starts, the webinar moves to
              Recorded by itself. Leave empty to keep using Timings.
            </p>
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="public-video" className={labelClass}>Preview video link</label>
          <input
            id="public-video"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={value.publicVideoUrl}
            onChange={(e) => set("publicVideoUrl", e.target.value)}
            className={inputClass}
          />
          <p className={helpClass}>YouTube or Vimeo. Anyone can watch it on the page, without enrolling. Leave empty for none.</p>
        </div>

        {copy.showCertificate && (
          <div className="sm:col-span-2">
            <p id="cert-picture-label" className={labelClass}>Certificate picture</p>
            <LibraryImageField
              value={value.certificateImageUrl}
              onChange={(url) => set("certificateImageUrl", url)}
              labelledBy="cert-picture-label"
              courseSlug={courseSlug}
              kind="certificate"
              folder="misc"
              want="wide"
              uploadLabel="Upload new"
              shape="square"
              icon={Award}
              inputClassName={inputClass}
            />
            <p className={helpClass}>A picture of the real certificate. When empty, the page shows a sample certificate.</p>
          </div>
        )}
      </div>

      <LineList
        legend="What you'll learn"
        help="One skill per line. Shown as tick boxes on the page."
        lines={value.outcomes}
        onChange={(l) => set("outcomes", l)}
      />

      <LineList
        legend={`This ${copy.noun} includes`}
        help="One item per line, e.g. 8 live classes. Shown next to the price."
        lines={value.features}
        onChange={(l) => set("features", l)}
      />

      <fieldset className="min-w-0 space-y-3">
        <legend className={legendClass}>Questions and answers</legend>
        <p className={helpClass}>Shown at the bottom of the page. A question without an answer is not saved.</p>
        <ul className="space-y-3">
          {value.faqs.map((f, i) => (
            <li key={i} className="space-y-2 rounded-lg border border-pz-outline-variant p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  aria-label={`Question ${i + 1}`}
                  placeholder="Question"
                  value={f.question}
                  maxLength={300}
                  onChange={(e) => set("faqs", value.faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                  className={inputClass}
                />
                <RowButtons
                  index={i}
                  count={value.faqs.length}
                  name={`question ${i + 1}`}
                  onMove={(to) => set("faqs", move(value.faqs, i, to))}
                  onRemove={() => set("faqs", value.faqs.filter((_, j) => j !== i))}
                />
              </div>
              <textarea
                aria-label={`Answer ${i + 1}`}
                placeholder="Answer"
                rows={3}
                value={f.answer}
                maxLength={2000}
                onChange={(e) => set("faqs", value.faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                className={inputClass}
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={addBtn}
          disabled={value.faqs.length >= MAX_FAQS}
          onClick={() => set("faqs", [...value.faqs, { question: "", answer: "" }])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add a question
        </button>
      </fieldset>

      <fieldset className="min-w-0 space-y-3">
        <legend className={legendClass}>Page sections</legend>
        <p className={helpClass}>
          The order of the sections under the top of the page. Untick Show to hide one. A heading left empty uses the
          normal one. A section with nothing filled in is hidden by itself.
        </p>
        <ul className="space-y-2">
          {shown.map((sec, i) => (
            <li key={sec.key} className="flex flex-col gap-3 rounded-lg border border-pz-outline-variant p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <span className="font-headline text-sm font-bold text-pz-on-surface sm:w-44 sm:shrink-0">{SECTION_LABEL[sec.key]}</span>
                <input
                  type="text"
                  aria-label={`Heading for ${SECTION_LABEL[sec.key]}`}
                  placeholder={sectionTitle({ key: sec.key, visible: true }, courseType)}
                  value={sec.title ?? ""}
                  maxLength={SECTION_TITLE_MAX}
                  onChange={(e) => setShown(shown.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-body text-sm text-pz-on-surface">
                  <input
                    type="checkbox"
                    aria-label={`Show ${SECTION_LABEL[sec.key]}`}
                    checked={sec.visible}
                    onChange={(e) => setShown(shown.map((x, j) => (j === i ? { ...x, visible: e.target.checked } : x)))}
                    className="h-5 w-5 accent-pz-solid-mid"
                  />
                  Show
                </label>
                <RowButtons index={i} count={shown.length} name={SECTION_LABEL[sec.key]} onMove={(to) => setShown(move(shown, i, to))} />
              </div>
            </li>
          ))}
        </ul>
      </fieldset>
    </section>
  );
}
