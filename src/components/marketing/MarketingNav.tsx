"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { roleHome, type Role } from "@/lib/roles";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Courses", href: "/courses" },
  { label: "Webinars", href: "/webinars" },
  { label: "Workshops", href: "/workshops" },
  { label: "Mentorship", href: "/mentorship" },
];

export function MarketingNav({ alwaysSolid = false }: { alwaysSolid?: boolean } = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
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
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <nav className={cn(
      "fixed inset-x-0 top-0 z-50 h-[68px] flex items-center justify-between px-6 md:px-10 transition-all duration-300",
      (alwaysSolid || (scrolled && !open)) && "bg-[rgba(10,28,17,0.96)] backdrop-blur-xl shadow-[0_2px_24px_rgba(0,0,0,.25)]"
    )}>
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 z-10 shrink-0">
        <Image
          src="https://pharmacozyme.com/wp-content/uploads/2026/04/PZ-Academy-logo.png"
          alt="PZ Academy"
          width={52}
          height={52}
          className="h-[52px] w-auto"
          priority
          unoptimized
        />
      </Link>

      {/* Desktop links */}
      <ul className="hidden md:flex items-center gap-7">
        {NAV_LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="relative text-[rgba(255,255,255,.78)] text-sm font-medium font-poppins hover:text-pz-bright transition-colors duration-200
                after:absolute after:bottom-[-3px] after:left-0 after:right-0 after:h-[1.5px] after:bg-pz-bright
                after:scale-x-0 after:origin-left after:transition-transform after:duration-250
                hover:after:scale-x-100"
            >
              {l.label}
            </Link>
          </li>
        ))}
        <li>
          <Link
            href={homeHref ?? "/login"}
            className="bg-pz-bright text-pz-forest font-poppins font-bold text-sm px-5 py-2 rounded-full transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(126,217,87,.35)]"
          >
            {homeHref ? "Go to Portal" : "Start Learning"}
          </Link>
        </li>
      </ul>

      {/* Mobile hamburger */}
      <button
        className="md:hidden relative z-10 p-2 text-white"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile menu overlay */}
      <div className={cn(
        "md:hidden fixed inset-0 z-[199] bg-[rgba(10,28,17,0.98)] backdrop-blur-2xl flex flex-col justify-start items-center pt-24 gap-0 transition-transform duration-400",
        open ? "translate-x-0" : "translate-x-full"
      )}>
        {NAV_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className="w-full text-center text-[rgba(255,255,255,.85)] text-lg font-poppins font-medium py-4 border-b border-[rgba(255,255,255,.06)] hover:text-pz-bright hover:pl-5 transition-all"
          >
            {l.label}
          </Link>
        ))}
        <div className="mt-6">
          <Link
            href={homeHref ?? "/login"}
            onClick={() => setOpen(false)}
            className="bg-pz-bright text-pz-forest font-poppins font-bold px-10 py-3 rounded-full text-base"
          >
            {homeHref ? "Go to Portal" : "Start Learning"}
          </Link>
        </div>
      </div>
    </nav>
  );
}
