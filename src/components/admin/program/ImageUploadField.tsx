"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Uploads to Google Drive via /api/admin/uploads/course-image and writes the
 * resulting public URL into `value`. The text input stays editable underneath
 * so pasting a URL directly still works — the plan's explicit requirement for
 * course-image fields (they're marketing assets on a public Drive link, not
 * protected content).
 *
 * `shape`/`icon` follow the real Stitch markup: Mentor Avatar is a circular
 * preview (border-2, rounded-full); the regenerated Course Thumbnail/Banner
 * fields use a square rounded-lg preview (single border) with a distinct
 * placeholder icon each ("image" / "landscape" in the Material Symbols the
 * screen specifies).
 */
export function ImageUploadField({
  value,
  onChange,
  courseSlug,
  kind,
  inputClassName,
  shape = "circle",
  icon: Icon = ImagePlus,
  uploadUrl = "/api/admin/uploads/course-image",
}: {
  value: string;
  onChange: (url: string) => void;
  courseSlug: string;
  kind: string;
  inputClassName: string;
  shape?: "circle" | "square";
  icon?: LucideIcon;
  /** Which route the file POSTs to -- defaults to the admin course-image relay; pass a different route for non-admin callers (e.g. /api/uploads/avatar). */
  uploadUrl?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("courseSlug", courseSlug);
      form.append("kind", kind);

      const res = await fetch(uploadUrl, { method: "POST", body: form });
      const payload = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!res.ok || !payload?.url) {
        toast.error(payload?.error ?? "Upload failed.");
        return;
      }
      onChange(payload.url);
      toast.success("Image uploaded.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "w-16 h-16 shrink-0 overflow-hidden bg-pz-surface-container flex items-center justify-center",
          shape === "circle" ? "rounded-full border-2 border-pz-outline-variant" : "rounded-lg border border-pz-outline-variant",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-6 h-6 text-pz-on-surface-variant/50" />
        )}
      </div>

      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://... (or upload a file)"
            className={inputClassName}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-pz-outline-variant text-xs font-bold text-pz-on-surface-variant hover:bg-pz-surface-container-low transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={uploading}
              title="Remove image"
              className="shrink-0 inline-flex items-center justify-center p-2.5 rounded-lg border border-pz-outline-variant text-pz-on-surface-variant hover:bg-pz-danger/10 hover:text-pz-danger hover:border-pz-danger/30 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
    </div>
  );
}
