"use client";

import { useId } from "react";
import { MessageCircle, MousePointerClick, Share2, Timer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LandingSeo, LandingSettings } from "@/lib/landing/content";
import type { FieldDef } from "@/lib/landing/sections";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import type { RegistrationStepKey } from "@/lib/landing/registration/setup-steps";
import { FieldInput } from "./FieldInput";
import { ModulesEditor, type ModulesEditorProps } from "./ModulesEditor";
import type { CourseModule } from "@/lib/data/landing-course-modules";
import { RegistrationSetup } from "./registration/RegistrationSetup";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Stored ISO instant -> the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in Pakistan time. */
function isoToPkt(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + PKT_OFFSET_MS).toISOString().slice(0, 16);
}

/** datetime-local value (read as Pakistan time, UTC+5, no daylight saving) -> ISO instant, or "". */
function pktToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return "";
  const t = Date.parse(`${local}:00+05:00`);
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
}

const text = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "text", ...o });

const REGISTER_URL = text("registerUrl", "Register button link", { kind: "url", help: "Where the Register button sends people, for example your registration form. Starts with https://" });
const REGISTER_LABEL = text("registerLabel", "Register button text", { max: 40, example: "Register now" });
const WHATSAPP = text("whatsappNumber", "WhatsApp number", { max: 20, example: "923001234567", help: "Include the country code without a leading zero (92 for Pakistan, 971 for UAE). Leave empty to hide the WhatsApp button." });
const COUNTDOWN_LABEL = text("countdownLabel", "Countdown label", { max: 80, example: "Early Bird ends in", help: "Shown in the strip at the top of the page." });
const SEO_TITLE = text("title", "Title", { max: 120, help: "The big line people see when the link is shared or found on Google. Leave empty to use the page name." });
const SEO_DESC: FieldDef = { key: "description", label: "Description", kind: "textarea", max: 300, help: "One or two sentences shown under the title." };
const SEO_IMAGE: FieldDef = { key: "ogImage", label: "Share image", kind: "image", help: "The picture shown when the link is shared. Best at 1200 x 630 px." };

function Card({ icon: Icon, title, children }: { icon: typeof Timer; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4">
      <h3 className="flex items-center gap-2 font-headline text-sm font-bold text-pz-on-surface">
        <Icon className="h-4 w-4 text-pz-on-surface-variant" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export function PageSettingsPanel({
  settings, seo, slug, pageTitle, onSettings, onSeo,
  registration, registrationStep, onRegistrationStep, onRegistration, modules, courseModules, saveMessage, children,
}: {
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
  const cardTitle = seo.title || pageTitle || "";
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-headline text-lg font-bold text-pz-on-surface">Page settings</h2>
        <p className="font-body text-sm text-pz-on-surface-variant">Where the Register button goes, the countdown, and how the page looks when shared.</p>
      </div>

      <Card icon={MousePointerClick} title="Register button">
        <FieldInput field={registration?.enabled ? { ...REGISTER_URL, help: "Only used when the built-in registration form is off." } : REGISTER_URL} value={settings.registerUrl} onChange={(v) => onSettings({ registerUrl: String(v) })} />
        <FieldInput field={REGISTER_LABEL} value={settings.registerLabel} onChange={(v) => onSettings({ registerLabel: String(v) })} />
      </Card>

      {modules && <ModulesEditor {...modules} />}

      {registration && onRegistration && onRegistrationStep && (
        <div id="registration-setup" className="space-y-4">
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

      <Card icon={MessageCircle} title="WhatsApp chat button">
        <FieldInput field={WHATSAPP} value={settings.whatsappNumber} onChange={(v) => onSettings({ whatsappNumber: String(v) })} />
      </Card>

      <Card icon={Timer} title="Countdown strip">
        <FieldInput field={COUNTDOWN_LABEL} value={settings.countdownLabel} onChange={(v) => onSettings({ countdownLabel: String(v) })} />
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
      </Card>

      <Card icon={Share2} title="Google & WhatsApp previews">
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
      </Card>
    </div>
  );
}
