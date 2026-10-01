"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { ImageUploadField } from "@/components/admin/program/ImageUploadField";
import { StringListRepeater } from "@/components/admin/mentors/StringListRepeater";
import { SocialLinkRepeater } from "@/components/admin/mentors/SocialLinkRepeater";
import { CredentialRepeater } from "@/components/admin/mentors/CredentialRepeater";
import { MENTOR_TIMEZONES } from "@/lib/validations/admin-mentor";
import type { Mentor, MentorCredential, MentorSocialLink } from "@/lib/data/mentors";

type FormState = {
  shortBio: string;
  fullBio: string[];
  photoUrl: string;
  availabilityText: string;
  introVideoUrl: string;
  linkedinUrl: string;
  socialLinks: MentorSocialLink[];
  skills: string[];
  credentials: MentorCredential[];
  timezone: string;
  sessionDurationText: string;
};

function toFormState(mentor: Mentor): FormState {
  return {
    shortBio: mentor.shortBio,
    fullBio: mentor.fullBio,
    photoUrl: mentor.photo,
    availabilityText: mentor.availability,
    introVideoUrl: mentor.introVideoUrl,
    linkedinUrl: mentor.linkedinUrl,
    socialLinks: mentor.socialLinks,
    skills: mentor.skills,
    credentials: mentor.credentials,
    timezone: mentor.timezone,
    sessionDurationText: mentor.sessionDurationText,
  };
}

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function MentorSelfProfileForm({ mentor }: { mentor: Mentor }) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => toFormState(mentor));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const { run: save, pending: saving } = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/mentor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortBio: form.shortBio.trim() || undefined,
          fullBio: form.fullBio.filter((p) => p.trim().length > 0),
          photoUrl: form.photoUrl.trim() || undefined,
          availabilityText: form.availabilityText.trim() || undefined,
          introVideoUrl: form.introVideoUrl.trim() || undefined,
          linkedinUrl: form.linkedinUrl.trim() || undefined,
          socialLinks: form.socialLinks.filter((l) => l.label.trim().length > 0 && l.url.trim().length > 0),
          skills: form.skills.filter((s) => s.trim().length > 0),
          credentials: form.credentials.filter((c) => c.title.trim().length > 0),
          timezone: form.timezone || undefined,
          sessionDurationText: form.sessionDurationText.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not save changes.");
        return;
      }
      toast.success("Profile updated.");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not save changes.");
    }
  });
  const busy = saving || isNavigating;

  return (
    <div>
    <div className="bg-white rounded-xl shadow-card p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-montserrat font-bold text-pz-forest text-base">My Profile</h2>
        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={busy}
          onClick={() => save()}
          className="max-md:hidden gap-2 px-4 py-2 bg-pz-lime text-pz-forest font-semibold text-sm rounded-lg hover:bg-pz-mint transition-colors"
        >
          <Save className="w-4 h-4" />
          {busy ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <div>
        <label className={labelClass}>Short Bio</label>
        <textarea value={form.shortBio} onChange={(e) => set("shortBio", e.target.value)} rows={2} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Full Bio (one paragraph per row)</label>
        <StringListRepeater
          value={form.fullBio}
          onChange={(v) => set("fullBio", v)}
          multiline
          placeholder="Paragraph…"
          addLabel="Add Paragraph"
        />
      </div>

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Availability Blurb</label>
          <input
            type="text"
            value={form.availabilityText}
            onChange={(e) => set("availabilityText", e.target.value)}
            placeholder="e.g. Mon, Tue, Fri (Full Day)"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Session Duration Display Override</label>
          <input
            type="text"
            value={form.sessionDurationText}
            onChange={(e) => set("sessionDurationText", e.target.value)}
            placeholder="e.g. 60–90 min"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Intro Video URL</label>
          <input
            type="text"
            value={form.introVideoUrl}
            onChange={(e) => set("introVideoUrl", e.target.value)}
            placeholder="https://youtube.com/..."
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>LinkedIn URL</label>
          <input
            type="text"
            value={form.linkedinUrl}
            onChange={(e) => set("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/in/..."
            className={inputClass}
          />
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
      </div>

      <div>
        <label className={labelClass}>Other Social Links</label>
        <SocialLinkRepeater value={form.socialLinks} onChange={(v) => set("socialLinks", v)} />
      </div>

      <div>
        <label className={labelClass}>Skills</label>
        <StringListRepeater value={form.skills} onChange={(v) => set("skills", v)} placeholder="Skill…" addLabel="Add Skill" />
      </div>

      <div>
        <label className={labelClass}>Credentials</label>
        <CredentialRepeater value={form.credentials} onChange={(v) => set("credentials", v)} />
      </div>
    </div>
    <div className="md:hidden mt-4 max-md:sticky max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
      <Button
        type="button"
        variant="bare"
        size="bare"
        loading={busy}
        onClick={() => save()}
        className="w-full gap-2 px-4 py-2 max-md:min-h-11 bg-pz-lime text-pz-forest font-semibold text-sm rounded-lg hover:bg-pz-mint transition-colors"
      >
        <Save className="w-4 h-4" />
        {busy ? "Saving…" : "Save Changes"}
      </Button>
    </div>
    </div>
  );
}
