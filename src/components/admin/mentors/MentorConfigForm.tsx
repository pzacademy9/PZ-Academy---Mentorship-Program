"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Save, Trash2, User, BookText, Image as ImageIcon, Banknote, Package, Award, Sparkles, Quote, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageUploadField } from "@/components/admin/program/ImageUploadField";
import { StringListRepeater } from "./StringListRepeater";
import { PackageRepeater } from "./PackageRepeater";
import { CredentialRepeater } from "./CredentialRepeater";
import { TestimonialRepeater } from "./TestimonialRepeater";
import { SocialLinkRepeater } from "./SocialLinkRepeater";
import { MENTOR_VISIBILITIES, MENTOR_TIMEZONES } from "@/lib/validations/admin-mentor";
import type { MentorConfigDetail } from "@/lib/data/admin-mentors";
import type { MentorPackage, MentorCredential, MentorTestimonial, MentorSocialLink } from "@/lib/data/mentors";

type FormState = {
  name: string;
  title: string;
  expertise: string;
  shortBio: string;
  fullBio: string[];
  photoUrl: string;
  experience: string;
  domain: string;
  language: string;
  format: string;
  pricePerSessionPkr: string;
  packages: MentorPackage[];
  availabilityText: string;
  leadTime: string;
  credentials: MentorCredential[];
  skills: string[];
  introVideoUrl: string;
  linkedinUrl: string;
  socialLinks: MentorSocialLink[];
  testimonials: MentorTestimonial[];
  sessionDurationMinutes: string;
  sessionDurationText: string;
  timezone: string;
  visibility: MentorConfigDetail["visibility"];
  showReviews: boolean;
};

function toFormState(mentor: MentorConfigDetail): FormState {
  return {
    name: mentor.name,
    title: mentor.title,
    expertise: mentor.expertise,
    shortBio: mentor.shortBio,
    fullBio: mentor.fullBio,
    photoUrl: mentor.photo,
    experience: mentor.experience,
    domain: mentor.domain,
    language: mentor.language,
    format: mentor.format,
    pricePerSessionPkr: String(mentor.pricePerSession),
    packages: mentor.packages,
    availabilityText: mentor.availability,
    leadTime: mentor.leadTime,
    credentials: mentor.credentials,
    skills: mentor.skills,
    introVideoUrl: mentor.introVideoUrl,
    linkedinUrl: mentor.linkedinUrl,
    socialLinks: mentor.socialLinks,
    testimonials: mentor.testimonials,
    sessionDurationMinutes: String(mentor.sessionDurationMinutes),
    sessionDurationText: mentor.sessionDurationText,
    timezone: mentor.timezone,
    visibility: mentor.visibility,
    showReviews: mentor.showReviews,
  };
}

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function MentorConfigForm({ mentor }: { mentor: MentorConfigDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => toFormState(mentor));
  const [deleteOpen, setDeleteOpen] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/mentors/${mentor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          title: form.title.trim() || undefined,
          expertise: form.expertise.trim() || undefined,
          shortBio: form.shortBio.trim() || undefined,
          fullBio: form.fullBio.filter((p) => p.trim().length > 0),
          photoUrl: form.photoUrl.trim() || undefined,
          experience: form.experience.trim() || undefined,
          domain: form.domain.trim() || undefined,
          language: form.language.trim() || undefined,
          format: form.format.trim() || undefined,
          pricePerSessionPkr: Number(form.pricePerSessionPkr) || 0,
          packages: form.packages.filter((p) => p.name.trim().length > 0),
          availabilityText: form.availabilityText.trim() || undefined,
          leadTime: form.leadTime.trim() || undefined,
          credentials: form.credentials.filter((c) => c.title.trim().length > 0),
          skills: form.skills.filter((s) => s.trim().length > 0),
          introVideoUrl: form.introVideoUrl.trim() || undefined,
          linkedinUrl: form.linkedinUrl.trim() || undefined,
          socialLinks: form.socialLinks.filter((l) => l.label.trim().length > 0 && l.url.trim().length > 0),
          testimonials: form.testimonials.filter((t) => t.quote.trim().length > 0),
          sessionDurationMinutes: Number(form.sessionDurationMinutes) || 60,
          sessionDurationText: form.sessionDurationText.trim() || undefined,
          timezone: form.timezone || undefined,
          visibility: form.visibility,
          showReviews: form.showReviews,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not save changes.");
        return;
      }

      const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
      if (payload?.warning) toast.warning(payload.warning);
      toast.success("Changes saved.");
      router.refresh();
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/mentors/${mentor.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not delete this mentor.");
        setDeleteOpen(false);
        return;
      }
      const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
      if (payload?.warning) toast.warning(payload.warning);
      toast.success("Mentor deleted.");
      router.push("/dashboard/admin/mentors");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <h1 className="font-headline font-bold text-2xl text-pz-on-surface">{form.name || "Untitled Mentor"}</h1>
        <div className="flex gap-3 shrink-0 flex-wrap">
          <Link
            href={`/mentorship/mentors/${mentor.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border-2 border-pz-primary text-pz-primary font-headline font-bold text-sm rounded-lg hover:bg-pz-primary/5 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Public Page
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Identity */}
      <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-6">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-pz-primary" />
          Identity
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Name</label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Slug (read-only)</label>
            <input
              type="text"
              value={mentor.slug}
              readOnly
              className={`${inputClass} bg-pz-surface-container text-pz-on-surface-variant cursor-not-allowed`}
            />
          </div>
          <div>
            <label className={labelClass}>Title</label>
            <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Expertise</label>
            <input type="text" value={form.expertise} onChange={(e) => set("expertise", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Visibility</label>
            <select
              value={form.visibility}
              onChange={(e) => set("visibility", e.target.value as FormState["visibility"])}
              className={inputClass}
            >
              {MENTOR_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Reviews on Public Profile</label>
            <label className="flex items-center gap-2.5 border border-pz-outline-variant rounded-lg px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.showReviews}
                onChange={(e) => set("showReviews", e.target.checked)}
                className="w-4 h-4 rounded border-pz-outline-variant text-pz-primary focus:ring-2 focus:ring-pz-primary/20"
              />
              <span className="font-body text-sm text-pz-on-surface">
                {form.showReviews ? "Shown — mentee feedback appears on this profile" : "Hidden — the reviews section is not rendered"}
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* Public Copy */}
      <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-6">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <BookText className="w-5 h-5 text-pz-primary" />
          Public Copy
        </h3>
        <div>
          <label className={labelClass}>Short Bio (card preview)</label>
          <textarea value={form.shortBio} onChange={(e) => set("shortBio", e.target.value)} rows={2} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Full Bio (profile page, one paragraph per row)</label>
          <StringListRepeater
            value={form.fullBio}
            onChange={(v) => set("fullBio", v)}
            multiline
            placeholder="Paragraph…"
            addLabel="Add Paragraph"
          />
        </div>
      </section>

      {/* Photo & Media */}
      <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-6">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-pz-primary" />
          Photo & Media
        </h3>
        <div>
          <label className={labelClass}>Photo</label>
          <ImageUploadField
            value={form.photoUrl}
            onChange={(url) => set("photoUrl", url)}
            courseSlug={mentor.slug}
            kind="mentor-photo"
            inputClassName={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Intro Video URL</label>
          <input
            type="text"
            placeholder="https://youtube.com/..."
            value={form.introVideoUrl}
            onChange={(e) => set("introVideoUrl", e.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      {/* Session & Pricing */}
      <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-6">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <Banknote className="w-5 h-5 text-pz-primary" />
          Session & Pricing
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Single-Session Price (PKR)</label>
            <input
              type="number"
              min={0}
              value={form.pricePerSessionPkr}
              onChange={(e) => set("pricePerSessionPkr", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Format</label>
            <input
              type="text"
              placeholder="e.g. Online via Zoom"
              value={form.format}
              onChange={(e) => set("format", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Session Duration (minutes)</label>
            <input
              type="number"
              min={1}
              value={form.sessionDurationMinutes}
              onChange={(e) => set("sessionDurationMinutes", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Duration Display Override (optional)</label>
            <input
              type="text"
              placeholder="e.g. 60–90 min, Varies"
              value={form.sessionDurationText}
              onChange={(e) => set("sessionDurationText", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Language</label>
            <input type="text" value={form.language} onChange={(e) => set("language", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Experience</label>
            <input
              type="text"
              placeholder="e.g. 5+ Years"
              value={form.experience}
              onChange={(e) => set("experience", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Domain</label>
            <input type="text" value={form.domain} onChange={(e) => set("domain", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className={inputClass}>
              <option value="">—</option>
              {MENTOR_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Availability</label>
            <input
              type="text"
              placeholder="e.g. Mon, Tue, Fri (Full Day)"
              value={form.availabilityText}
              onChange={(e) => set("availabilityText", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Lead Time</label>
            <input
              type="text"
              placeholder="e.g. 24 hours advance"
              value={form.leadTime}
              onChange={(e) => set("leadTime", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-4">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-pz-primary" />
          Packages
        </h3>
        <PackageRepeater value={form.packages} onChange={(v) => set("packages", v)} />
      </section>

      {/* Credentials */}
      <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-4">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-pz-primary" />
          Credentials
        </h3>
        <CredentialRepeater value={form.credentials} onChange={(v) => set("credentials", v)} />
      </section>

      {/* Skills */}
      <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-4">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pz-primary" />
          Skills
        </h3>
        <StringListRepeater value={form.skills} onChange={(v) => set("skills", v)} placeholder="Skill…" addLabel="Add Skill" />
      </section>

      {/* Testimonials */}
      <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-4">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <Quote className="w-5 h-5 text-pz-primary" />
          Testimonials
        </h3>
        <TestimonialRepeater value={form.testimonials} onChange={(v) => set("testimonials", v)} />
      </section>

      {/* Links */}
      <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-4">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-pz-primary" />
          Links
        </h3>
        <div>
          <label className={labelClass}>LinkedIn URL</label>
          <input
            type="text"
            placeholder="https://linkedin.com/in/..."
            value={form.linkedinUrl}
            onChange={(e) => set("linkedinUrl", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Other Social Links</label>
          <SocialLinkRepeater value={form.socialLinks} onChange={(v) => set("socialLinks", v)} />
        </div>
      </section>

      {/* Danger Zone */}
      <section className="bg-pz-danger/5 border border-pz-danger/30 rounded-xl p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-headline font-bold text-sm text-pz-on-surface">Danger Zone</p>
          <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">
            Deleting a mentor is permanent. Mentors with any booking history can&apos;t be deleted — set visibility to Hidden instead.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 border border-pz-danger text-pz-danger font-headline font-bold text-sm rounded-lg hover:bg-pz-danger/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Mentor
        </button>
      </section>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Delete &ldquo;{mentor.name}&rdquo;?</DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">
              This permanently removes the mentor&apos;s public profile. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-danger text-white hover:bg-pz-danger/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
