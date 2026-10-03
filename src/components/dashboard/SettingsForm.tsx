"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { ImageUploadField } from "@/components/admin/program/ImageUploadField";

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function SettingsForm({
  userId,
  initialFullName,
  initialAvatarUrl,
}: {
  userId: string;
  initialFullName: string;
  initialAvatarUrl: string;
}) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [fullName, setFullName] = useState(initialFullName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  const { run: save, pending: saving } = useAsyncAction(async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error("Name can't be empty.");
      return;
    }
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: trimmedName, avatarUrl }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; warning?: string | null } | null;
      if (!res.ok) {
        toast.error(payload?.error ?? "Could not save changes.");
        return;
      }
      toast.success("Profile updated.");
      if (payload?.warning) toast.warning(payload.warning);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not save changes.");
    }
  });
  const busy = saving || isNavigating;

  return (
    <div className="max-w-2xl">
    <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-headline font-bold text-pz-on-surface text-base">Profile</h2>
        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={busy}
          onClick={() => save()}
          className="max-md:hidden gap-2 px-4 py-2 bg-pz-primary text-pz-on-primary font-headline font-bold text-sm rounded-lg hover:opacity-90 transition-opacity"
        >
          <Save className="w-4 h-4" />
          {busy ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <div>
        <label className={labelClass}>Profile Photo</label>
        <ImageUploadField
          value={avatarUrl}
          onChange={setAvatarUrl}
          courseSlug={userId}
          kind="avatar"
          uploadUrl="/api/uploads/avatar"
          inputClassName={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Full Name</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={inputClass}
        />
      </div>
    </div>
    <div className="md:hidden mt-4 max-md:sticky max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
      <Button
        type="button"
        variant="bare"
        size="bare"
        loading={busy}
        onClick={() => save()}
        className="w-full gap-2 px-4 py-2 max-md:min-h-11 bg-pz-primary text-pz-on-primary font-headline font-bold text-sm rounded-lg hover:opacity-90 transition-opacity"
      >
        <Save className="w-4 h-4" />
        {busy ? "Saving…" : "Save Changes"}
      </Button>
    </div>
    </div>
  );
}
