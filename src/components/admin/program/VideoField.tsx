"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { checkVideoLink } from "@/lib/video-link";

/**
 * One video link input. Saves on blur (an empty value clears the video) and
 * shows a plain-words check of the link. The check never blocks saving, so
 * links saved before the check existed stay editable.
 */
export function VideoField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (url: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const check = checkVideoLink(draft);

  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase font-bold text-pz-on-surface-variant tracking-wider ml-1">
        {label}
      </label>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== value.trim()) void onSave(draft.trim());
        }}
        placeholder="Paste a YouTube or Vimeo link"
        className="w-full bg-pz-surface border border-pz-outline-variant rounded-lg px-4 py-3 focus:ring-2 focus:ring-pz-primary focus:outline-none font-medium max-md:text-base max-md:min-h-11"
      />
      {check.status === "ok" && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-pz-primary ml-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {check.provider === "youtube" ? "YouTube video found" : "Vimeo video found"}
        </p>
      )}
      {(check.status === "unsupported" || check.status === "invalid") && (
        <p
          className={
            "flex items-start gap-1.5 text-xs font-bold ml-1 " +
            (check.status === "invalid" ? "text-pz-danger" : "text-amber-700")
          }
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {check.message}
        </p>
      )}
    </div>
  );
}
