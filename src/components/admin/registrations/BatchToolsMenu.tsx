"use client";

import Link from "next/link";
import { ChevronDown, IdCard, KeyRound, RefreshCw, TrendingUp, Users, Wrench } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ITEM =
  "min-h-11 gap-3 px-3 rounded-lg text-sm font-medium text-pz-on-surface cursor-pointer focus:bg-pz-surface-container focus:text-pz-on-surface";
const ICON = "w-4 h-4 text-pz-on-surface-variant shrink-0";

export function BatchToolsMenu({ pageId, base }: { pageId: string; base: string }) {
  const campaign = `${base}/campaign/${pageId}`;
  // modal={false}: no page scroll lock or inert background, so opening the menu does not shift the layout (scrollbar jump) on desktop.
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 min-h-10 max-md:min-h-11 px-4 rounded-xl border border-pz-outline-variant/40 bg-pz-surface-container-lowest text-pz-primary text-sm font-headline font-bold hover:bg-pz-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary transition-colors"
        >
          <Wrench className="w-4 h-4" aria-hidden="true" />
          <span>Batch tools</span>
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-md:w-[min(20rem,calc(100vw-2rem))] p-2 rounded-xl bg-pz-surface-container-lowest text-pz-on-surface border-pz-outline-variant/40 shadow-lg"
      >
        <DropdownMenuLabel className="px-3 py-1.5 text-[11px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant">
          Cohort operations
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className={ITEM}>
          <Link href={`${base}/sheet/${pageId}`}>
            <RefreshCw className={ICON} aria-hidden="true" />
            Sheet sync
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link href={`${campaign}/sessions`}>
            <Users className={ICON} aria-hidden="true" />
            Classes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link href={`${campaign}/ids`}>
            <IdCard className={ICON} aria-hidden="true" />
            Student IDs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link href={`${campaign}/reports`}>
            <TrendingUp className={ICON} aria-hidden="true" />
            Progress reports
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-pz-outline-variant/40" />
        <DropdownMenuItem asChild className={ITEM}>
          <Link href={`${campaign}/portal`}>
            <KeyRound className={ICON} aria-hidden="true" />
            Portal access
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
