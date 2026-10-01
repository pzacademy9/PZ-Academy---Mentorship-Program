"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Save, FilePenLine, UserCheck, Trash2, LayoutList, Image, Mountain } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { COURSE_TYPES, COURSE_STATUSES } from "@/lib/validations/admin-lms";
import type { CourseConfigDetail } from "@/lib/data/admin-lms";
import { ImageUploadField } from "./ImageUploadField";

type FormState = {
  title: string;
  type: CourseConfigDetail["type"];
  tagline: string;
  description: string;
  status: CourseConfigDetail["status"];
  level: string;
  pricePkr: string;
  durationText: string;
  timings: string;
  registerUrl: string;
  gasWebappUrl: string;
  thumbnailUrl: string;
  bannerUrl: string;
  mentorName: string;
  mentorTitle: string;
  mentorBio: string;
  mentorAvatarUrl: string;
};

function toFormState(course: CourseConfigDetail): FormState {
  return {
    title: course.title,
    type: course.type,
    tagline: course.tagline,
    description: course.description,
    status: course.status,
    level: course.level,
    pricePkr: String(course.pricePkr),
    durationText: course.durationText,
    timings: course.timings,
    registerUrl: course.registerUrl,
    gasWebappUrl: course.gasWebappUrl,
    thumbnailUrl: course.thumbnailUrl,
    bannerUrl: course.bannerUrl,
    mentorName: course.mentorName,
    mentorTitle: course.mentorTitle,
    mentorBio: course.mentorBio,
    mentorAvatarUrl: course.mentorAvatarUrl,
  };
}

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function ProgramConfigForm({ course }: { course: CourseConfigDetail }) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => toFormState(course));
  const [deleteOpen, setDeleteOpen] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const { run: save, pending: saving } = useAsyncAction(async () => {
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          type: form.type,
          tagline: form.tagline.trim() || undefined,
          description: form.description.trim() || undefined,
          status: form.status,
          pricePkr: Number(form.pricePkr) || 0,
          level: form.level.trim() || undefined,
          durationText: form.durationText.trim() || undefined,
          timings: form.timings.trim() || undefined,
          registerUrl: form.registerUrl.trim() || undefined,
          gasWebappUrl: form.gasWebappUrl.trim() || undefined,
          thumbnailUrl: form.thumbnailUrl.trim() || undefined,
          bannerUrl: form.bannerUrl.trim() || undefined,
          mentorName: form.mentorName.trim() || undefined,
          mentorTitle: form.mentorTitle.trim() || undefined,
          mentorBio: form.mentorBio.trim() || undefined,
          mentorAvatarUrl: form.mentorAvatarUrl.trim() || undefined,
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
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not save changes.");
    }
  });

  const { run: confirmDelete, pending: deleting } = useAsyncAction(async () => {
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not delete this program.");
        setDeleteOpen(false);
        return;
      }
      const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
      if (payload?.warning) toast.warning(payload.warning);
      toast.success("Program deleted.");
      startTransition(() => router.push("/dashboard/admin/courses"));
    } catch {
      toast.error("Could not delete this program.");
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <h1 className="font-headline font-bold text-2xl text-pz-on-surface">{form.title || "Untitled Program"}</h1>
        <div className="flex gap-3 shrink-0 flex-wrap">
          <Link
            href={`/dashboard/admin/courses/${course.id}/builder`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 max-md:min-h-11 bg-pz-secondary-container text-pz-on-secondary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all"
          >
            <LayoutList className="w-4 h-4" />
            Curriculum Builder
          </Link>
          <Link
            href={`/courses/${course.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 max-md:min-h-11 border-2 border-pz-primary text-pz-primary font-headline font-bold text-sm rounded-lg hover:bg-pz-primary/5 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Public Page
          </Link>
          <Button
            type="button"
            variant="bare"
            size="bare"
            loading={saving || isNavigating}
            onClick={() => save()}
            className="max-md:hidden gap-2 px-4 py-2 bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all"
          >
            <Save className="w-4 h-4" />
            {saving || isNavigating ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      <section className="bg-pz-surface-container-lowest p-4 sm:p-8 rounded-xl border border-pz-outline-variant space-y-6">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <FilePenLine className="w-5 h-5 text-pz-primary" />
          Course Configuration
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <label className={labelClass}>Course Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Slug (read-only)</label>
            <input
              type="text"
              value={course.slug}
              readOnly
              className={`${inputClass} bg-pz-surface-container text-pz-on-surface-variant cursor-not-allowed`}
            />
          </div>

          <div>
            <label className={labelClass}>Program Type</label>
            <select value={form.type} onChange={(e) => set("type", e.target.value as FormState["type"])} className={inputClass}>
              {COURSE_TYPES.filter((t) => t !== "mentorship").map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Course Tagline</label>
            <input
              type="text"
              value={form.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value as FormState["status"])} className={inputClass}>
              {COURSE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Course Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Level</label>
            <input type="text" value={form.level} onChange={(e) => set("level", e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Price (PKR)</label>
            <input
              type="number"
              min={0}
              value={form.pricePkr}
              onChange={(e) => set("pricePkr", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Duration</label>
            <input
              type="text"
              placeholder="e.g. 8 Weeks, 4 Days"
              value={form.durationText}
              onChange={(e) => set("durationText", e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Course Thumbnail URL</label>
            <ImageUploadField
              value={form.thumbnailUrl}
              onChange={(url) => set("thumbnailUrl", url)}
              courseSlug={course.slug}
              kind="thumbnail"
              shape="square"
              icon={Image}
              inputClassName={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Banner Image URL</label>
            <ImageUploadField
              value={form.bannerUrl}
              onChange={(url) => set("bannerUrl", url)}
              courseSlug={course.slug}
              kind="banner"
              shape="square"
              icon={Mountain}
              inputClassName={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Timings</label>
            <input
              type="text"
              placeholder="e.g. Every Sat & Sun, 6–8 PM"
              value={form.timings}
              onChange={(e) => set("timings", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Register URL</label>
            <input
              type="text"
              placeholder="https://..."
              value={form.registerUrl}
              onChange={(e) => set("registerUrl", e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>GAS Webapp URL</label>
            <input
              type="text"
              placeholder="https://script.google.com/..."
              value={form.gasWebappUrl}
              onChange={(e) => set("gasWebappUrl", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="bg-pz-surface-container-lowest p-4 sm:p-8 rounded-xl border border-pz-outline-variant space-y-6">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-pz-primary" />
          Mentor Profile
        </h3>

        <div>
          <label className={labelClass}>Mentor Avatar</label>
          <ImageUploadField
            value={form.mentorAvatarUrl}
            onChange={(url) => set("mentorAvatarUrl", url)}
            courseSlug={course.slug}
            kind="mentor-avatar"
            inputClassName={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Mentor Name</label>
            <input
              type="text"
              value={form.mentorName}
              onChange={(e) => set("mentorName", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Designation</label>
            <input
              type="text"
              value={form.mentorTitle}
              onChange={(e) => set("mentorTitle", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Bio Summary</label>
            <textarea
              value={form.mentorBio}
              onChange={(e) => set("mentorBio", e.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <div className="md:hidden max-md:sticky max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={saving || isNavigating}
          onClick={() => save()}
          className="w-full gap-2 px-4 py-2 max-md:min-h-11 bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all"
        >
          <Save className="w-4 h-4" />
          {saving || isNavigating ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <section className="bg-pz-danger/5 border border-pz-danger/30 rounded-xl p-4 md:p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-headline font-bold text-sm text-pz-on-surface">Danger Zone</p>
          <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">
            Deleting a program is permanent. Programs with any enrollment history can&apos;t be deleted — unpublish instead.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 max-md:min-h-11 border border-pz-danger text-pz-danger font-headline font-bold text-sm rounded-lg hover:bg-pz-danger/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Program
        </button>
      </section>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Delete &ldquo;{course.title}&rdquo;?</DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">
              This permanently removes the program and its curriculum. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="bare"
              size="bare"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting || isNavigating}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="bare"
              size="bare"
              loading={deleting || isNavigating}
              onClick={() => confirmDelete()}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-danger text-white hover:bg-pz-danger/90 transition-colors"
            >
              {deleting || isNavigating ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
