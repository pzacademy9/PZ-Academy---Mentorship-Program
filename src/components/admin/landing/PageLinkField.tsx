"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { validateSlug } from "@/lib/landing/slug";

/**
 * The "Your page link: /e/<slug>" line with a small Change control.
 * `slug` is the effective link; `onChange` receives a user-edited override.
 * The validation message (if any) is shown under the line.
 */
export function PageLinkField({
  slug, onChange, showValidation,
}: { slug: string; onChange: (slug: string) => void; showValidation: boolean }) {
  const [editing, setEditing] = useState(false);
  const check = validateSlug(slug);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-pz-surface-container-high px-3 py-2 text-sm">
        <Link2 className="h-4 w-4 text-pz-on-surface-variant" aria-hidden="true" />
        <span className="font-body text-pz-on-surface-variant">Your page link:</span>
        {editing ? (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="text-pz-on-surface-variant">/e/</span>
            <Input
              aria-label="Link ending"
              value={slug}
              onChange={(e) => onChange(e.target.value.toLowerCase())}
              className="h-8 min-w-0 flex-1 bg-pz-surface-container-lowest"
            />
          </span>
        ) : (
          <span className="min-w-0 break-all font-semibold text-pz-on-surface">{`/e/${slug}`}</span>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="ml-auto font-headline text-xs font-semibold text-pz-primary hover:underline max-md:min-h-11 max-md:px-2"
        >
          {editing ? "Done" : "Change"}
        </button>
      </div>
      {showValidation && !check.ok && (
        <p role="alert" className="text-xs text-pz-danger">{check.message}</p>
      )}
    </div>
  );
}
