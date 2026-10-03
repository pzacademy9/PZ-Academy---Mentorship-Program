"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Check, ExternalLink, Globe, Award, Download, QrCode as QrCodeIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";

export type ShareTargetType = "session" | "program";

interface ShareReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ShareTargetType;
  targetId: string;
  targetName: string;
  shareToken: string | null;
}

/** Read-only URL input + copy + "Open" ghost button, ported from Stitch's C-share-modal.html link cards. */
function ShareLinkCard({
  icon: Icon,
  title,
  description,
  url,
  emphasized,
}: {
  icon: typeof Globe;
  title: string;
  description: string;
  url: string;
  emphasized?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Could not copy the link."));
  }

  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 rounded-lg border p-4",
        emphasized
          ? "border-pz-primary/40 bg-pz-surface-container-low"
          : "border-pz-outline-variant bg-pz-surface-container",
      )}
    >
      {emphasized && (
        <span className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-pz-primary-container px-2.5 py-1 font-headline text-xs font-semibold text-pz-on-primary-container">
          <Award className="w-3.5 h-3.5" />
          Recommended
        </span>
      )}
      <div className={cn("flex items-start gap-3", emphasized && "pr-32")}>
        <Icon className="w-5 h-5 mt-0.5 shrink-0 text-pz-on-surface-variant" />
        <div className="flex-1 min-w-0">
          <h3 className="font-headline text-sm font-semibold text-pz-on-surface">{title}</h3>
          <p className="font-body text-xs text-pz-on-surface-variant mt-1">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="text"
          readOnly
          value={url}
          className="flex-1 min-w-0 h-10 max-md:h-11 max-md:text-base rounded-md border border-pz-outline-variant bg-pz-surface-container-highest px-3 font-body text-sm text-pz-on-surface truncate outline-none focus:border-pz-primary focus:ring-1 focus:ring-pz-primary"
        />
        <button
          type="button"
          onClick={copy}
          title="Copy link"
          aria-label={`Copy ${title.toLowerCase()}`}
          className="shrink-0 h-10 w-10 max-md:size-11 grid place-items-center rounded-md text-pz-on-surface-variant hover:text-pz-primary hover:bg-pz-surface-container-highest transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-pz-primary" /> : <Copy className="w-4 h-4" />}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 h-10 max-md:h-11 max-md:min-w-11 px-3 rounded-md font-headline text-sm font-semibold text-pz-primary hover:bg-pz-primary/10 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open
        </a>
      </div>
    </div>
  );
}

/**
 * Two-tier share modal — ported from Stitch's C-share-modal.html "fully clean" screen.
 * Public link (no filter/search/share controls) + Members link (adds filter, search,
 * sort, share-card download) are the same review page gated by ?member=1 — the gating
 * itself already lives in ReviewClient.tsx and is unchanged by this modal.
 */
export function ShareReviewModal({ open, onOpenChange, targetType, targetId, targetName, shareToken }: ShareReviewModalProps) {
  const [token, setToken] = useState<string | null>(shareToken);
  const [generating, setGenerating] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => setToken(shareToken), [shareToken]);

  // If this session/program has never had a share link generated, generate one
  // as soon as the modal opens — mirrors SessionDetailClient's existing
  // generateShareLink() flow, just moved to run automatically instead of
  // requiring a second click once the modal is already up.
  useEffect(() => {
    if (!open || token || generating) return;
    setGenerating(true);
    const path = targetType === "session" ? "sessions" : "programs";
    fetch(`/api/admin/feedback/${path}/${targetId}/share-token`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Could not generate a share link.");
        }
        return res.json() as Promise<{ token: string }>;
      })
      .then((payload) => setToken(payload.token))
      .catch((e: Error) => {
        toast.error(e.message);
        onOpenChange(false);
      })
      .finally(() => setGenerating(false));
  }, [open, token, generating, targetType, targetId, onOpenChange]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = token ? `${origin}/review/${token}` : "";
  const memberUrl = token ? `${origin}/review/${token}?member=1` : "";
  const shareCardUrl = token ? `/api/share-card/${token}` : "";

  // Real QR of the public (non-member) link — generated client-side, no server round-trip.
  useEffect(() => {
    if (!publicUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(publicUrl, { width: 480, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  // Same fetch → blob → trigger-download pattern as ReviewClient.tsx's ShareModal.handleDownload.
  const { run: downloadImage, pending: downloadingImage } = useAsyncAction(async () => {
    if (!shareCardUrl) return;
    try {
      const r = await fetch(shareCardUrl);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pz-academy-feedback.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download the share card.");
    }
  });

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = "pz-academy-review-qr.png";
    a.click();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-headline text-pz-on-surface">Share Review Page</DialogTitle>
          <p className="font-body text-sm text-pz-on-surface-variant mt-1">
            Choose how you want to share these reviews with your audience.
          </p>
        </DialogHeader>

        {!token ? (
          <div className="py-10 text-center font-body text-sm text-pz-on-surface-variant">
            Preparing a share link for &ldquo;{targetName}&rdquo;…
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <ShareLinkCard
                icon={Globe}
                title="Public Link"
                description="Viewers see reviews only — no filter, search, or share controls"
                url={publicUrl}
              />
              <ShareLinkCard
                icon={Award}
                title="Members Link"
                description="Includes filter, search, sort, and social share-card download"
                url={memberUrl}
                emphasized
              />
            </div>

            {/* Social share card */}
            <div className="border border-pz-outline-variant rounded-lg p-4 bg-pz-surface-container flex flex-col sm:flex-row gap-4 items-center sm:items-start">
              <div className="w-full sm:w-[120px] aspect-square rounded-md overflow-hidden border border-pz-outline-variant shrink-0 bg-pz-surface-container-lowest">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shareCardUrl} alt={`Social share card preview for ${targetName}`} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 flex flex-col justify-center text-center sm:text-left gap-2">
                <div>
                  <h4 className="font-headline text-sm font-semibold text-pz-on-surface">Session Summary Share Card</h4>
                  <p className="font-body text-xs text-pz-on-surface-variant">1080 × 1080 · PNG</p>
                </div>
                <p className="font-body text-sm text-pz-on-surface-variant hidden sm:block">
                  Perfect for sharing on LinkedIn, Twitter, or Instagram to highlight recent feedback.
                </p>
                <div className="mt-1">
                  <Button
                    variant="bare"
                    size="bare"
                    type="button"
                    loading={downloadingImage}
                    onClick={() => downloadImage()}
                    className="inline-flex items-center justify-center gap-2 max-md:min-h-11 rounded-lg bg-pz-primary-container px-5 py-2 font-headline text-sm font-semibold text-pz-on-primary-container hover:bg-pz-primary-container/90 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download image
                  </Button>
                </div>
              </div>
            </div>

            {/* QR code */}
            <div className="pt-4 border-t border-pz-outline-variant flex flex-col sm:flex-row items-center justify-between gap-5">
              <div className="flex flex-col items-center gap-2">
                <div className="w-[120px] h-[120px] bg-white rounded-lg p-2 flex items-center justify-center shadow-sm">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt={`QR code linking to the public review page for ${targetName}`} className="w-full h-full object-contain" />
                  ) : (
                    <QrCodeIcon className="w-14 h-14 text-pz-surface-container-highest" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={downloadQr}
                  disabled={!qrDataUrl}
                  className="max-md:min-h-11 font-headline text-sm font-semibold text-pz-primary hover:text-pz-tertiary-fixed-dim underline-offset-4 hover:underline transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download QR
                </button>
              </div>
              <div className="flex-1 text-center sm:text-right hidden sm:block">
                <p className="font-body text-xs text-pz-on-surface-variant max-w-[200px] ml-auto">
                  Print this QR code to place on physical materials or display on screens during events.
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
