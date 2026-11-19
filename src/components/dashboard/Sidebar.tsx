"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Role } from "@/lib/roles";
import type { Area } from "@/lib/team/areas";
import { useEffect, useState, type ComponentType } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isSalesHubPath } from "@/lib/crm/sales-hub-routes";
import { AFFILIATES_HUB_BASE, isAffiliatesHubPath, parseAffiliatesTab, affiliatesTabHref } from "@/lib/affiliates/hub-routes";
import { navForRole, activeHrefFor, splitMobileNav, SALES_HUB_ITEMS, SALES_HUB_BACK, AFFILIATES_HUB_ITEMS, AFFILIATES_HUB_BACK, type NavItem, type HubGroup } from "./nav";

const HUB_GROUPS: HubGroup[] = ["Overview", "Audience", "Outreach", "Team"];
const COLLAPSE_KEY = "pz.sidebar.collapsed";

interface SidebarProps {
  role: Role;
  /** The admin areas this person may open (admin and manager); undefined for everyone else and the super admin. */
  areas?: readonly Area[];
}

export function Sidebar({ role, areas }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hubMode = (role === "admin" || role === "super_admin") && isSalesHubPath(pathname);
  const normalItems = navForRole(role, areas);
  // The Affiliates hub is for whoever can see the Affiliates page (it needs the same area as its menu entry).
  const affiliatesHub = !hubMode && isAffiliatesHubPath(pathname) && normalItems.some((i) => i.href === AFFILIATES_HUB_BASE);
  const items: NavItem[] = hubMode ? [...SALES_HUB_ITEMS, SALES_HUB_BACK] : affiliatesHub ? [...AFFILIATES_HUB_ITEMS, AFFILIATES_HUB_BACK] : normalItems;
  // The hub items differ only by ?tab=, which activeHrefFor cannot see, so read it here.
  const activeHref = affiliatesHub ? affiliatesTabHref(parseAffiliatesTab(searchParams?.get("tab"))) : activeHrefFor(items, pathname);
  const { bar, more, moreActive } = splitMobileNav(items, activeHref);
  const [moreOpen, setMoreOpen] = useState(false);
  // Starts expanded so the server render and the first client render match; the saved choice is read after mount.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      // Storage blocked: the menu still works for this visit.
    }
  }, []);
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      // Storage blocked: the choice just is not remembered.
    }
  };

  const tab = (active: boolean) =>
    cn(
      "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-label transition-colors",
      active ? "text-pz-on-secondary-container dark:text-pz-secondary" : "text-pz-on-surface-variant",
    );
  const pill = (active: boolean) =>
    cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-pz-secondary-container text-pz-on-secondary-container");

  const desktopLink = (active: boolean) =>
    cn(
      "flex items-center rounded-lg py-2.5 text-sm font-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary",
      collapsed ? "justify-center px-0" : "gap-3 px-3",
      active
        ? "bg-pz-primary-container text-pz-on-primary-container font-bold"
        : "text-pz-on-surface-variant hover:text-pz-on-surface hover:bg-pz-surface-container-high"
    );

  const renderLink = (item: { href: string; label: string; icon: ComponentType<{ className?: string }> }, active: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={desktopLink(active)}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {!collapsed && item.label}
    </Link>
  );
  const backLink = (href: string) => renderLink({ href, label: "Back to Admin", icon: ArrowLeft }, false);

  return (
    <>
      {/* Desktop side nav */}
      <aside
        className={cn(
          "hidden lg:flex flex-col lg:sticky lg:top-0 lg:h-screen bg-pz-surface-container shrink-0 border-r border-pz-outline-variant/20 transition-[width] duration-200 motion-reduce:transition-none",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex shrink-0 items-center gap-3 py-5", collapsed ? "justify-center px-0" : "px-6")}>
          <div className="w-8 h-8 rounded-full bg-pz-bright flex items-center justify-center shrink-0">
            <span className="font-headline font-black text-pz-deep dark:text-pz-solid-deep text-xs">PZ</span>
          </div>
          {!collapsed && <span className="font-headline font-bold text-pz-secondary text-sm">PZ Academy</span>}
        </div>

        <nav className="flex-1 min-h-0 px-3 py-4 space-y-0.5 overflow-y-auto">
          {hubMode ? (
            <>
              {backLink(SALES_HUB_BACK.href)}
              {!collapsed && <p className="px-3 pt-2 font-headline font-bold text-pz-secondary text-sm">Sales Hub</p>}
              {HUB_GROUPS.map((group) => (
                <div key={group}>
                  {group !== "Overview" && !collapsed && (
                    <p className="px-3 pt-4 pb-1 text-[11px] font-label font-bold uppercase tracking-wide text-pz-on-surface-variant">{group}</p>
                  )}
                  {SALES_HUB_ITEMS.filter((item) => item.group === group).map((item) => renderLink(item, item.href === activeHref))}
                </div>
              ))}
            </>
          ) : affiliatesHub ? (
            <>
              {backLink(AFFILIATES_HUB_BACK.href)}
              {!collapsed && <p className="px-3 pt-2 font-headline font-bold text-pz-secondary text-sm">Affiliates</p>}
              {AFFILIATES_HUB_ITEMS.map((item) => renderLink(item, item.href === activeHref))}
            </>
          ) : (
            items.map((item) => renderLink(item, item.href === activeHref))
          )}
        </nav>

        <div className="shrink-0 border-t border-pz-outline-variant/20 p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className={cn(
              "flex min-h-11 w-full items-center rounded-lg text-sm font-label font-medium text-pz-on-surface-variant transition-colors hover:bg-pz-surface-container-high hover:text-pz-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
            )}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
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
