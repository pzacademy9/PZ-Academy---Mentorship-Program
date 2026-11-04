"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { roleHome, type Role } from "@/lib/roles";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Courses", href: "/courses" },
  { label: "Workshops", href: "/workshops" },
  { label: "Webinars", href: "/webinars" },
  { label: "Mentorship", href: "/mentorship" },
];

const FIND_ID = { label: "Find my ID", href: "/progress" };

/** Is this menu link the page the visitor is on? Program detail pages live under /courses/. */
function isCurrent(href: string, path: string): boolean {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

/** Light top bar of the public website (Stitch "PZ Academy Platform 2"). */
export function MarketingNav() {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // A link tap navigates away: closing then must not pull focus back to the button.
  const closingByLink = useRef(false);
  const closeByLink = () => {
    closingByLink.current = true;
    setOpen(false);
  };
  // null = not logged in / not yet known; a Role once resolved. Marketing
  // pages (mentorship, booking, thank-you, courses) sit outside /dashboard,
  // so this is the only nav a logged-in student sees while booking or
  // enrolling -- without this check it always said "Start Learning" -> /login
  // with no way back to the portal.
  const [homeHref, setHomeHref] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setHomeHref(roleHome((profile?.role as Role) ?? "student"));
    });
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Phone menu keyboard care: a closed menu is out of the tab order (inert;
  // React 18 has no inert prop), opening moves focus into it, Escape closes
  // it, and closing hands focus back to the menu button.
  useEffect(() => {
    const menu = menuRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (menu) menu.inert = !open;
    if (open) {
      menu?.querySelector<HTMLElement>("a, button")?.focus();
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
      document.addEventListener("keydown", onKey);
      wasOpen.current = true;
      return () => document.removeEventListener("keydown", onKey);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      if (!closingByLink.current) buttonRef.current?.focus();
      closingByLink.current = false;
    }
  }, [open]);

  const ctaHref = homeHref ?? "/login";
  const ctaLabel = homeHref ? "Go to Portal" : "Start Learning";

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 top-0 z-50 h-20 bg-pz-web-surface/90 shadow-[0_1px_8px_rgba(15,61,34,0.06)]",
        // No backdrop blur while the phone menu is open: a backdrop filter makes the
        // nav the containing block of the fixed overlay and clips it to the bar.
        !open && "backdrop-blur-xl",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1320px] items-center justify-between gap-4 px-5 md:px-6">
        {/* Wordmark */}
        <Link href="/" aria-label="PZ Academy home" className="relative z-[200] flex shrink-0 flex-col leading-none">
          <span className="font-montserrat text-xl font-extrabold tracking-tight text-pz-deep">PZ ACADEMY</span>
          <span className="mt-1 font-poppins text-[11px] font-semibold uppercase tracking-wide text-pz-muted">by Pharmacozyme</span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => {
            const current = isCurrent(l.href, path);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full px-4 font-montserrat text-[15px] font-bold transition-colors",
                    current ? "bg-pz-solid-forest text-white" : "text-pz-muted hover:text-pz-deep",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex shrink-0 items-center gap-2 md:gap-4">
          <Link
            href={FIND_ID.href}
            aria-current={isCurrent(FIND_ID.href, path) ? "page" : undefined}
            className="hidden min-h-11 items-center font-montserrat text-[15px] font-bold text-pz-deep transition-colors hover:text-pz-mid sm:inline-flex"
          >
            {FIND_ID.label}
          </Link>
          <Link
            href={ctaHref}
            className="hidden min-h-11 items-center justify-center rounded-full bg-pz-bright px-6 font-montserrat text-[15px] font-bold text-pz-solid-deep shadow-[0_8px_30px_rgba(15,61,34,0.05)] transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-solid-mid sm:inline-flex"
          >
            {ctaLabel}
          </Link>

          {/* Phone / tablet menu button */}
          <button
            ref={buttonRef}
            type="button"
            className="relative z-[200] flex min-h-11 min-w-11 items-center justify-center rounded-full text-pz-deep lg:hidden"
            aria-controls="marketing-mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Phone menu overlay */}
      <div
        id="marketing-mobile-menu"
        ref={menuRef}
        aria-hidden={open ? undefined : true}
        className={cn(
          "fixed inset-0 z-[199] flex flex-col items-stretch gap-1 overflow-y-auto bg-pz-web-surface px-5 pb-10 pt-24 transition-[transform,visibility] duration-[400ms] lg:hidden",
          open ? "translate-x-0" : "invisible translate-x-full",
        )}
      >
        {[...NAV_LINKS, FIND_ID].map((l) => {
          const current = isCurrent(l.href, path);
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={closeByLink}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center rounded-2xl px-5 font-montserrat text-lg font-bold transition-colors",
                current ? "bg-pz-solid-forest text-white" : "text-pz-deep hover:bg-pz-web-surface-high",
              )}
            >
              {l.label}
            </Link>
          );
        })}
        <Link
          href={ctaHref}
          onClick={closeByLink}
          className="mt-6 flex min-h-12 items-center justify-center rounded-full bg-pz-bright px-10 font-montserrat text-base font-bold text-pz-solid-deep"
        >
          {ctaLabel}
        </Link>
      </div>
    </nav>
  );
}
