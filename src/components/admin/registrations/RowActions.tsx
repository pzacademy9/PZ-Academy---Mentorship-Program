"use client";

import { useState } from "react";
import { Mail, MailCheck, MessageCircle, MoreVertical, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";
import type { OpenBuilder } from "./CampaignRegistrations";
import { phoneProblemWord } from "./WhatsAppSendList";
import { EditDetailsDialog } from "./EditDetailsDialog";
import { StatusEmailDialog } from "./StatusEmailDialog";

const ITEM =
  "gap-3 px-3 py-2.5 max-md:min-h-11 rounded-lg text-sm font-headline font-semibold text-pz-on-surface focus:bg-pz-surface-container focus:text-pz-on-surface max-md:flex-col max-md:items-start max-md:gap-1 max-md:bg-pz-surface-container-low";
const ICON = "w-4 h-4 text-pz-primary shrink-0";

/** The row menu: Edit details, Status email, Send email, Send WhatsApp. List rows are never group members. */
export function RowActions({ row, onOpenBuilder }: { row: RegistrationListRow; onOpenBuilder: OpenBuilder }) {
  const [dialog, setDialog] = useState<"edit" | "status" | null>(null);
  const waProblem = phoneProblemWord(row.whatsapp);

  function openBuilder(channel: "email" | "whatsapp") {
    onOpenBuilder(channel, { pageId: row.pageId, pageTitle: row.pageTitle, selection: { mode: "ids", ids: [row.id] }, count: 1 });
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${row.name}`}
            className="inline-flex items-center justify-center w-9 h-9 max-md:w-11 max-md:h-11 rounded-full text-pz-on-surface-variant hover:bg-pz-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary transition-colors"
          >
            <MoreVertical className="w-5 h-5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 max-md:w-[min(20rem,calc(100vw-2rem))] max-md:grid max-md:grid-cols-2 max-md:gap-2 p-2 rounded-xl bg-pz-surface-container-lowest text-pz-on-surface border-pz-outline-variant/40 shadow-lg"
        >
          <DropdownMenuLabel className="px-3 py-1.5 text-[11px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant max-md:col-span-2 max-md:normal-case max-md:text-sm max-md:tracking-normal">
            <span className="md:hidden">Actions for {row.name}</span>
            <span className="max-md:hidden">Candidate actions</span>
          </DropdownMenuLabel>
          <DropdownMenuItem className={ITEM} onSelect={() => setDialog("edit")}>
            <Pencil className={ICON} aria-hidden="true" />
            <span>Edit details</span>
            <span className="md:hidden text-[11px] font-normal text-pz-on-surface-variant">Name, email, WhatsApp</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={() => setDialog("status")}>
            <MailCheck className={ICON} aria-hidden="true" />
            <span>Status email</span>
            <span className="md:hidden text-[11px] font-normal text-pz-on-surface-variant">Pending, Paid and more</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={() => openBuilder("email")}>
            <Mail className={ICON} aria-hidden="true" />
            <span>Send email</span>
            <span className="md:hidden text-[11px] font-normal text-pz-on-surface-variant">Your own message</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} disabled={waProblem !== null} onSelect={() => openBuilder("whatsapp")}>
            <MessageCircle className={ICON} aria-hidden="true" />
            <span>Send WhatsApp</span>
            {waProblem && <span className="text-[11px] font-normal text-pz-error md:ml-auto">{waProblem}</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "edit" && <EditDetailsDialog row={row} onClose={() => setDialog(null)} />}
      {dialog === "status" && <StatusEmailDialog row={row} rowType="lead" onClose={() => setDialog(null)} />}
    </>
  );
}
