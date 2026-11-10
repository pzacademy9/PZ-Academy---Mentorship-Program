"use client";

import { useId } from "react";
import { Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LandingSeo, LandingSettings } from "@/lib/landing/content";
import type { FieldDef } from "@/lib/landing/sections";
import { formatDateRange, isRealDate, weekdayText } from "@/lib/landing/dates";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import type { RegistrationStepKey } from "@/lib/landing/registration/setup-steps";
import Link from "next/link";
import { FieldInput } from "./FieldInput";
import { ModulesEditor, type ModulesEditorProps } from "./ModulesEditor";
import type { CourseModule } from "@/lib/data/landing-course-modules";
import { RegistrationSetup } from "./registration/RegistrationSetup";
import { StepCard } from "./StepCard";
import { ModeChoice } from "./ModeChoice";
import { isValidWaGroupUrl } from "@/lib/landing/registration/wa-groups";
import { readyCount, type CardStatus, type SettingsCardId } from "@/lib/landing/settings-cards";

const READY_ALL: Record<SettingsCardId, CardStatus> = { who: "ready", button: "ready", after: "ready", links: "ready", dates: "ready" };

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Stored ISO instant -> the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in Pakistan time. */
function isoToPkt(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + PKT_OFFSET_MS).toISOString().slice(0, 16);
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Stored ISO instant -> "15 Oct 2026, 7:30 PM (Pakistan time)", or "". */
function pktLabel(iso: string): string {
  const v = isoToPkt(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return "";
  const h = Number(m[4]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1]} ${m[1]}, ${h12}:${m[5]} ${h >= 12 ? "PM" : "AM"} (Pakistan time)`;
}

/** datetime-local value (read as Pakistan time, UTC+5, no daylight saving) -> ISO instant, or "". */
function pktToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return "";
  const t = Date.parse(`${local}:00+05:00`);
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
}

const DAY_MS = 86_400_000;
const DATE_INPUT_CLASS = "h-auto w-full rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11 max-md:text-base";

function daysBetween(start: string, end: string): number | null {
  if (!isRealDate(start) || !isRealDate(end) || end < start) return null;
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
}

const text = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "text", ...o });

const BUTTON_ACTION = text("registerUrl", "What the button does", { kind: "url", help: "The link the button opens, for example your registration form. Starts with https://" });
const PORTAL_LINK = text("portalLink", "Portal link", { kind: "url", help: "Where recorded students open their lessons. Must start with https://." });
const BUTTON_TEXT = text("registerLabel", "Button text", { max: 40, example: "Register now" });
const WHATSAPP = text("whatsappNumber", "WhatsApp number", { max: 20, example: "923001234567", help: "Include the country code without a leading zero (92 for Pakistan, 971 for UAE). Leave empty to hide the WhatsApp button." });
const COUNTDOWN_LABEL = text("countdownLabel", "Countdown label", { max: 80, example: "Early Bird ends in", help: "Shown in the strip at the top of the page." });
const TERMS_BOX: FieldDef = { key: "terms", label: "Terms and Conditions for this page", kind: "textarea", plain: true, max: 20000, help: "Plain text. Start each part with 1. 2. 3. and a short title on its own line." };
const SEO_TITLE = text("title", "Title", { max: 120, help: "The big line people see when the link is shared or found on Google. Leave empty to use the page name." });
const SEO_DESC: FieldDef = { key: "description", label: "Description", kind: "textarea", max: 300, help: "One or two sentences shown under the title." };
const SEO_IMAGE: FieldDef = { key: "ogImage", label: "Share image", kind: "image", help: "The picture shown when the link is shared. Best at 1200 x 630 px." };

export function PageSettingsPanel({
  settings, seo, slug, pageTitle, onSettings, onSeo,
  registration, registrationStep, onRegistrationStep, onRegistration, modules, courseModules, saveMessage, children,
  hasCourse = false, courseTitle = null, statuses, onHeroDateLine,
}: {
  /** Sends the automatic date line to the main hero; the button is hidden when this is omitted. */
  onHeroDateLine?: (text: string) => void;
  /** Ready / Needs attention for each card; omitted = all ready. */
  statuses?: Record<SettingsCardId, CardStatus>;
  /** Whether the page is linked to a course (recorded students then open that course's portal). */
  hasCourse?: boolean;
  courseTitle?: string | null;
  /** The Modules card (course and workshop pages only; omit it elsewhere). */
  modules?: ModulesEditorProps;
  /** The page's course modules for the registration options (null = no course). */
  courseModules?: CourseModule[] | null;
  /** The server's message when it refused the last save. */
  saveMessage?: string | null;
  settings: LandingSettings;
  seo: LandingSeo;
  /** Used only for the share-card preview line. */
  slug?: string;
  pageTitle?: string;
  onSettings: (patch: Partial<LandingSettings>) => void;
  onSeo: (patch: Partial<LandingSeo>) => void;
  registration?: RegistrationConfig;
  registrationStep?: RegistrationStepKey;
  onRegistrationStep?: (s: RegistrationStepKey) => void;
  onRegistration?: (next: RegistrationConfig) => void;
  /** Task 20's operations card. */
  children?: React.ReactNode;
}) {
  const countdownId = useId();
  const batchStartId = useId();
  const followId = useId();
  const dateRows: { key: string; title: string; start: string; end: string; set: (patch: { start?: string; end?: string }) => void }[] = modules && modules.modules.length > 0
    ? modules.modules.map((m, i) => ({
        key: m.key, title: m.title || `Module ${i + 1}`, start: m.startsOn ?? "", end: m.endsOn ?? "",
        set: (patch) => modules.onModules(modules.modules.map((x, j) => (j === i ? {
          ...x,
          ...(patch.start !== undefined ? { startsOn: patch.start } : {}),
          ...(patch.end !== undefined ? { endsOn: patch.end } : {}),
        } : x))),
      }))
    : [{
        key: "event", title: "Event", start: settings.eventStartsOn ?? "", end: settings.eventEndsOn ?? "",
        set: (patch) => onSettings({
          ...(patch.start !== undefined ? { eventStartsOn: patch.start } : {}),
          ...(patch.end !== undefined ? { eventEndsOn: patch.end } : {}),
        }),
      }];
  const validRanges = dateRows.filter((r) => daysBetween(r.start, r.end) !== null).map((r) => ({ start: r.start, end: r.end }));
  const heroLine = (() => {
    if (validRanges.length === 0) return "";
    const start = validRanges.reduce((a, r) => (r.start < a ? r.start : a), validRanges[0].start);
    const end = validRanges.reduce((a, r) => (r.end > a ? r.end : a), validRanges[0].end);
    const weekdays = weekdayText(validRanges);
    const dates = formatDateRange(start, end);
    return weekdays ? `${dates} (${weekdays})` : dates;
  })();
  const followsEarlyBird = settings.countdownFollowsEarlyBird === true;
  const earlyBirdText = registration?.earlyBirdEndsAt ? pktLabel(registration.earlyBirdEndsAt) : "";
  const cardTitle = seo.title || pageTitle || "";
  const st = statuses ?? READY_ALL;
  const toRegistrationStep = (step: RegistrationStepKey) => {
    onRegistrationStep?.(step);
    requestAnimationFrame(() => {
      const el = document.getElementById("registration-setup");
      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
    });
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-headline text-lg font-bold text-pz-on-surface">Page settings</h2>
          <p className="font-body text-sm text-pz-on-surface-variant">Five steps: who can register, the button, what happens after, links, and dates.</p>
        </div>
        <span className="rounded-full bg-pz-surface-container-high px-2.5 py-1 font-headline text-[11px] font-semibold text-pz-on-surface">{readyCount(st)} of 5 ready</span>
      </div>

      {registration?.enabled && onRegistration && (
        <StepCard number={1} title="Who can register" blurb="Decide if students join live classes, watch recordings, or choose either." status={st.who}>
          <ModeChoice modes={registration.modes} onChange={(modes) => onRegistration({ ...registration, modes })} />
        </StepCard>
      )}

      <StepCard number={2} title="Register button" blurb="Choose what the main button says and where it goes." status={st.button}>
        <FieldInput field={BUTTON_TEXT} value={settings.registerLabel} onChange={(v) => onSettings({ registerLabel: String(v) })} />
        {registration?.enabled ? (
          <p className="font-body text-sm text-pz-on-surface-variant">The button opens the built-in registration form. Turn the form on or off in Registration setup below.</p>
        ) : (
          <FieldInput field={BUTTON_ACTION} value={settings.registerUrl} onChange={(v) => onSettings({ registerUrl: String(v) })} />
        )}
      </StepCard>

      <StepCard number={3} title="After registering" blurb="Choose what students see right after they register." status={st.after}>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-3">
          <div className="min-w-0">
            <p className="font-body text-sm font-semibold text-pz-on-surface">Offer to create an account</p>
            <p className="font-body text-xs text-pz-on-surface-variant">Shown in the thank-you message after registering.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.showCreateAccount}
            aria-label="Offer to create an account"
            onClick={() => onSettings({ showCreateAccount: !settings.showCreateAccount })}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-8 max-md:w-14",
              settings.showCreateAccount ? "bg-pz-solid-forest" : "bg-pz-outline-variant",
            )}
          >
            <span aria-hidden="true" className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-pz-surface-container-lowest shadow transition-transform max-md:h-7 max-md:w-7", settings.showCreateAccount ? "translate-x-5 max-md:translate-x-6" : "translate-x-0.5")} />
          </button>
        </div>
      </StepCard>

      <StepCard number={4} title="WhatsApp and portal links" blurb="Connect students to their group or their portal." status={st.links}>
        <FieldInput field={WHATSAPP} value={settings.whatsappNumber} onChange={(v) => onSettings({ whatsappNumber: String(v) })} />
        {registration?.enabled && registration.modes.includes("live") && (
          <div className="space-y-2">
            <p className="font-body text-sm font-semibold text-pz-on-surface">Group link for each option</p>
            <ul className="space-y-1.5">
              {registration.options.map((o) => {
                const ok = isValidWaGroupUrl(o.waGroupUrl);
                return (
                  <li key={o.key} className="flex items-center justify-between gap-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm">
                    <span className="min-w-0 truncate text-pz-on-surface">{o.label || o.key}</span>
                    <span className={cn("shrink-0 text-xs font-semibold", ok ? "text-pz-success" : "text-pz-on-surface-variant")}>{ok ? "Valid link" : "No link"}</span>
                  </li>
                );
              })}
            </ul>
            {onRegistrationStep && (
              <button type="button" onClick={() => toRegistrationStep("whatsapp")} className="rounded-lg border border-pz-outline-variant px-3 py-1.5 font-body text-xs font-semibold text-pz-primary hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11">
                Edit group links
              </button>
            )}
          </div>
        )}
        {registration?.enabled && registration.modes.includes("recorded") && (
          <div className="space-y-2">
            <p className="font-body text-sm font-semibold text-pz-on-surface">Which portal they get</p>
            {hasCourse ? (
              <p className="font-body text-sm text-pz-on-surface">Recorded students get the portal for {courseTitle ?? "this page's course"}.</p>
            ) : (
              <FieldInput field={PORTAL_LINK} value={settings.portalLink} onChange={(v) => onSettings({ portalLink: String(v) })} />
            )}
          </div>
        )}
      </StepCard>

      <StepCard number={5} title="Countdown and start date" blurb="Optional. A strip at the top of the page and the start date on the website." status={st.dates}>
        <FieldInput field={COUNTDOWN_LABEL} value={settings.countdownLabel} onChange={(v) => onSettings({ countdownLabel: String(v) })} />
        <div className="space-y-3 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-3">
          <p className="font-headline text-sm font-bold text-pz-on-surface">Dates</p>
          <ul className="space-y-3">
            {dateRows.map((r) => {
              const n = daysBetween(r.start, r.end);
              const startId = `${followId}-${r.key}-s`;
              const endId = `${followId}-${r.key}-e`;
              return (
                <li key={r.key} className="space-y-1.5">
                  <p className="font-body text-sm font-semibold text-pz-on-surface">{r.title}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label htmlFor={startId} className="font-body text-xs text-pz-on-surface-variant">Start date</label>
                      <Input id={startId} type="date" aria-label={`${r.title} starts`} value={r.start} onChange={(e) => r.set({ start: e.target.value })} className={DATE_INPUT_CLASS} />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={endId} className="font-body text-xs text-pz-on-surface-variant">End date</label>
                      <Input id={endId} type="date" aria-label={`${r.title} ends`} min={r.start || undefined} value={r.end} onChange={(e) => r.set({ end: e.target.value })} className={DATE_INPUT_CLASS} />
                    </div>
                  </div>
                  {n !== null && <p className="font-body text-xs text-pz-on-surface-variant">{n} {n === 1 ? "day" : "days"}</p>}
                </li>
              );
            })}
          </ul>
          <p className="font-body text-xs text-pz-on-surface-variant">Hero, Schedule and links follow these dates.</p>
          {onHeroDateLine && (
            <button
              type="button"
              disabled={heroLine === ""}
              onClick={() => onHeroDateLine("{dates} ({weekdays})")}
              className="rounded-lg border border-pz-outline-variant px-3 py-1.5 font-body text-xs font-semibold text-pz-primary hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 max-md:min-h-11"
            >
              Use automatic dates in the hero
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-3">
          <div className="min-w-0">
            <p className="font-body text-sm font-semibold text-pz-on-surface">Count down to the Early Bird end</p>
            <p className="font-body text-xs text-pz-on-surface-variant">The strip counts down to the Early Bird end set in Registration setup.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={followsEarlyBird}
            aria-label="Count down to the Early Bird end"
            onClick={() => onSettings({ countdownFollowsEarlyBird: !followsEarlyBird })}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-8 max-md:w-14",
              followsEarlyBird ? "bg-pz-solid-forest" : "bg-pz-outline-variant",
            )}
          >
            <span aria-hidden="true" className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-pz-surface-container-lowest shadow transition-transform max-md:h-7 max-md:w-7", followsEarlyBird ? "translate-x-5 max-md:translate-x-6" : "translate-x-0.5")} />
          </button>
        </div>
        {followsEarlyBird ? (
          <p className="font-body text-sm text-pz-on-surface">Follows the Early Bird end: {earlyBirdText || "not set yet"}</p>
        ) : (
          <>
          <div className="space-y-1.5">
            <label htmlFor={countdownId} className="font-body text-sm font-semibold text-pz-on-surface">Countdown ends (Pakistan time)</label>
            <p className="font-body text-xs text-pz-on-surface-variant">The strip counts down to this moment. Clear it to hide the countdown.</p>
            <Input
              id={countdownId}
              type="datetime-local"
              value={isoToPkt(settings.countdownTo)}
              onChange={(e) => onSettings({ countdownTo: pktToIso(e.target.value) })}
              className="h-auto w-full rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11 max-md:text-base"
            />
          </div>
          </>
        )}
        <div className="space-y-1.5">
          <label htmlFor={batchStartId} className="font-body text-sm font-semibold text-pz-on-surface">Batch starts (Pakistan time)</label>
          <p className="font-body text-xs text-pz-on-surface-variant">Optional. The website shows &quot;starts &lt;date&gt;&quot; for this course while the page is open. Clear it to hide the date.</p>
          <Input
            id={batchStartId}
            type="datetime-local"
            value={isoToPkt(settings.batchStartsOn)}
            onChange={(e) => onSettings({ batchStartsOn: pktToIso(e.target.value) })}
            className="h-auto w-full rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11 max-md:text-base"
          />
        </div>
      </StepCard>

      {/* Optional, so it is not one of the five counted steps. */}
      <StepCard number={6} title="Terms and Conditions" blurb="Optional. The rules students agree to. If you leave it empty, the general Terms are used." status="ready">
        <FieldInput field={TERMS_BOX} value={settings.terms ?? ""} onChange={(v) => onSettings({ terms: String(v) })} />
        <Link href="/dashboard/admin/terms" target="_blank" rel="noopener noreferrer" className="font-body text-sm font-semibold text-pz-secondary underline underline-offset-2">Edit the general Terms</Link>
      </StepCard>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4">
        <div className="min-w-0">
          <p className="font-headline text-sm font-bold text-pz-on-surface">Soft shadows behind boxes</p>
          <p className="font-body text-xs text-pz-on-surface-variant">Turn off to remove the shadow from every box on this page.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.boxShadows !== false}
          aria-label="Soft shadows behind boxes"
          onClick={() => onSettings({ boxShadows: settings.boxShadows === false })}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-8 max-md:w-14",
            settings.boxShadows !== false ? "bg-pz-solid-forest" : "bg-pz-outline-variant",
          )}
        >
          <span aria-hidden="true" className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-pz-surface-container-lowest shadow transition-transform max-md:h-7 max-md:w-7", settings.boxShadows !== false ? "translate-x-5 max-md:translate-x-6" : "translate-x-0.5")} />
        </button>
      </div>

      {modules && <ModulesEditor {...modules} />}

      {registration && onRegistration && onRegistrationStep && (
        <div id="registration-setup" className="space-y-4">
          <h3 className="font-headline text-sm font-bold text-pz-on-surface">Registration setup</h3>
          {children}
          <RegistrationSetup
            registration={registration}
            step={registrationStep ?? "buy"}
            onStep={onRegistrationStep}
            onChange={onRegistration}
            courseModules={courseModules}
            saveMessage={saveMessage}
          />
        </div>
      )}

      <details className="group rounded-xl border border-pz-outline-variant bg-pz-surface-container-low">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-headline text-sm font-bold text-pz-on-surface max-md:min-h-11">
          <Share2 className="h-4 w-4 text-pz-on-surface-variant" aria-hidden="true" />
          Sharing preview
          <span className="font-body text-xs font-normal text-pz-on-surface-variant">Google &amp; WhatsApp previews</span>
        </summary>
        <div className="space-y-4 border-t border-pz-outline-variant p-4">
          <FieldInput field={SEO_TITLE} value={seo.title} onChange={(v) => onSeo({ title: String(v) })} />
          <FieldInput field={SEO_DESC} value={seo.description} onChange={(v) => onSeo({ description: String(v) })} />
          <FieldInput field={SEO_IMAGE} value={seo.ogImage} onChange={(v) => onSeo({ ogImage: String(v) })} />
          <div className="space-y-1.5">
            <p className="font-body text-sm font-semibold text-pz-on-surface">How a shared link looks</p>
            <div className="overflow-hidden rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest">
              {seo.ogImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={seo.ogImage} alt="" referrerPolicy="no-referrer" className="h-32 w-full object-cover" />
              )}
              <div className={cn("space-y-0.5 p-3", !seo.ogImage && "border-l-4 border-pz-solid-forest")}>
                <p className="font-body text-sm font-semibold text-pz-on-surface">{cardTitle || "Your page title"}</p>
                <p className="line-clamp-2 font-body text-xs text-pz-on-surface-variant">{seo.description || "Your short description will appear here."}</p>
                {slug && <p className="font-body text-xs text-pz-on-surface-variant">{`/e/${slug}`}</p>}
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
