"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Role } from "@/lib/roles";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { navForRole, activeHrefFor, splitMobileNav, type NavItem } from "./nav";

interface SidebarProps {
  role: Role;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const items = navForRole(role);
  const activeHref = activeHrefFor(items, pathname);
  const { bar, more, moreActive } = splitMobileNav(items, activeHref);
  const [moreOpen, setMoreOpen] = useState(false);

  const tab = (active: boolean) =>
    cn(
      "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-label transition-colors",
      active ? "text-pz-on-secondary-container" : "text-pz-on-surface-variant",
    );
  const pill = (active: boolean) =>
    cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-pz-secondary-container");

  return (
    <>
      {/* Desktop side nav */}
      <aside className="hidden lg:flex flex-col w-60 min-h-screen bg-pz-surface-container shrink-0 border-r border-pz-outline-variant/20">
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="w-8 h-8 rounded-full bg-pz-bright flex items-center justify-center shrink-0">
            <span className="font-headline font-black text-pz-deep text-xs">PZ</span>
          </div>
          <span className="font-headline font-bold text-pz-secondary text-sm">PZ Academy</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {items.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-label font-medium transition-colors",
                  active
                    ? "bg-pz-primary-container text-pz-on-primary-container font-bold"
                    : "text-pz-on-surface-variant hover:text-pz-on-surface hover:bg-pz-surface-container-high"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav: 4 items + More */}
      <nav
        aria-label="Main"
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch gap-1 border-t border-pz-outline-variant/20 bg-pz-surface-container-highest px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-lg"
      >
        {bar.map((item: NavItem) => {
          const active = item.href === activeHref;
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={tab(active)}>
              <span className={pill(active)}><item.icon className="h-5 w-5" /></span>
              <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
        {more.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={tab(moreActive)}
          >
            <span className={pill(moreActive)}><Menu className="h-5 w-5" /></span>
            <span>More</span>
          </button>
        )}
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="lg:hidden">
          <DialogTitle className="font-headline text-base">More</DialogTitle>
          <div className="grid grid-cols-3 gap-2">
            {more.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl p-2 text-center text-xs font-label",
                    active ? "bg-pz-primary-container text-pz-on-primary-container font-bold" : "bg-pz-surface-container text-pz-on-surface",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.shortLabel ?? item.label}
                </Link>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
