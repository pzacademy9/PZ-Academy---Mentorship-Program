"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { PromoCode } from "@/lib/landing/registration/promo";
import type { AgentChoice, PromoPageOption } from "@/lib/landing/registration/promo-form";
import { HELP, LABEL } from "../registration/styles";

type Kind = "public" | "agent" | "affiliate";
type Mode = "share" | "me";
type Job = { kind: Kind; mode?: Mode };

const MENU_LABEL: Record<Kind, string> = {
  public: "Ordinary codes",
  agent: "Sales agent codes",
  affiliate: "Affiliate codes",
};
const ITEM = "min-h-11 rounded-lg px-3 py-2.5 text-sm font-headline font-semibold text-pz-on-surface focus:bg-pz-surface-container focus:text-pz-on-surface";

/** One "Download PDF" menu for the code lists. The PDF builder is loaded on click so jsPDF stays out of the page. */
export function PromoDownloads({ codes, pages, agents = [], affiliates = [], canDownloadPeople = false }: {
  codes: PromoCode[];
  pages: PromoPageOption[];
  agents?: AgentChoice[];
  affiliates?: { id: string; name: string }[];
  canDownloadPeople?: boolean;
}) {
  const [asking, setAsking] = useState<"agent" | "affiliate" | null>(null);
  // The dialog opens from state, not a trigger, so keep the menu button to give focus back to it.
  const opener = useRef<HTMLButtonElement | null>(null);
  // Set while a pick is opening the dialog, so the menu does not pull focus back to the button over it.
  const openingDialog = useRef(false);

  const { run, pendingKey } = useAsyncAction(async (job: Job) => {
    try {
      const pdfLib = await import("@/lib/landing/registration/promo-pdf");
      const now = new Date();
      let spec;
      if (job.kind === "public") {
        const rows = pdfLib.publicCodeRows(codes, pages, now);
        if (rows.length === 0) { toast.error("There are no codes to put in this file."); return; }
        spec = pdfLib.publicPdfSpec(rows, now);
      } else {
        const mode = job.mode ?? "share";
        const rows = pdfLib.personCodeRows(job.kind, codes, job.kind === "agent" ? agents : affiliates, mode, now);
        if (rows.length === 0) { toast.error("There are no codes to put in this file."); return; }
        spec = pdfLib.personPdfSpec(job.kind, rows, mode, now);
      }
      pdfLib.renderPromoPdf(spec).save(pdfLib.promoPdfFileName(job.kind, now));
    } catch {
      toast.error("Could not make the file. Please try again.");
    }
  }, { getKey: (job) => job.kind });

  const choose = (mode: Mode) => {
    const kind = asking;
    setAsking(null);
    if (kind) void run({ kind, mode });
  };
  const option = (mode: Mode, title: string, help: string) => (
    <button type="button" onClick={() => choose(mode)} className="block w-full min-h-11 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-3 text-left hover:bg-pz-surface-container-low focus-visible:outline-2 focus-visible:outline-pz-primary">
      <span className={`block ${LABEL}`}>{title}</span>
      <span className={`block ${HELP}`}>{help}</span>
    </button>
  );

  const busy = pendingKey !== null;
  const pick = (kind: Kind) => {
    if (busy) return;
    if (kind === "public") { void run({ kind }); return; }
    openingDialog.current = true;
    setAsking(kind);
  };
  const item = (kind: Kind) => (
    <DropdownMenuItem className={ITEM} onSelect={() => pick(kind)}>{MENU_LABEL[kind]}</DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button ref={opener} type="button" variant="outline" className="max-md:min-h-11" disabled={busy} loading={busy}>
            <Download aria-hidden="true" /> {busy ? "Making the file…" : "Download PDF"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 max-md:w-[min(20rem,calc(100vw-2rem))] p-2 rounded-xl bg-pz-surface-container-lowest text-pz-on-surface border-pz-outline-variant/40 shadow-lg"
          onCloseAutoFocus={(e) => { if (openingDialog.current) { e.preventDefault(); openingDialog.current = false; } }}
        >
          {item("public")}
          {canDownloadPeople && item("agent")}
          {canDownloadPeople && item("affiliate")}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={asking !== null} onOpenChange={(o) => { if (!o) setAsking(null); }}>
        {asking && (
          <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => { e.preventDefault(); opener.current?.focus(); }}>
            <DialogHeader>
              <DialogTitle>Who will see this file?</DialogTitle>
              <DialogDescription>Pick the version that suits who you are sending it to.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {option("share", "Share in a group", "Shows name and code only.")}
              {option("me", "For me", "Also shows the discount and whether the code is on.")}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
