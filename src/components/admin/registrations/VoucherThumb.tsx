"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { voucherThumbSrc } from "@/lib/landing/registration/voucher-thumb";

const BOX = "w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-pz-surface-container border border-pz-outline-variant/40 grid place-items-center text-pz-on-surface-variant";

/**
 * The payment voucher as a small picture that opens the full file in a new tab. Falls back to a
 * document icon when there is no picture or it will not load. "No voucher" when there is no link.
 */
export function VoucherThumb({ url, variant = "cell" }: { url: string | null; variant?: "cell" | "card" }) {
  const [failed, setFailed] = useState(false);
  if (!url) return <span className="text-xs text-pz-on-surface-variant/80 italic">No voucher</span>;

  const src = failed ? null : voucherThumbSrc(url);
  const box = (
    <span className={BOX}>
      {src ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <FileText className="w-5 h-5" aria-hidden="true" />
      )}
    </span>
  );

  if (variant === "card") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-3 max-md:min-h-11 rounded-lg pr-3 text-xs font-headline font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed"
      >
        {box}
        View voucher
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label="View voucher" className="inline-flex rounded-lg hover:opacity-80 transition-opacity">
      {box}
    </a>
  );
}
