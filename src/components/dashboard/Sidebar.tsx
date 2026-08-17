"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BookOpen, Calendar, Award, Users, Settings, Clock,
  GraduationCap, BarChart3, CreditCard, Video, NotebookPen, Bell, Megaphone, Link2,
  Handshake, UserCheck, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Role } from "@/lib/roles";

interface NavItem {
  label: string;
  shortLabel?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["student", "mentor", "admin", "super_admin"] },
  { label: "My Courses", shortLabel: "Courses", href: "/dashboard/courses", icon: BookOpen, roles: ["student"] },
  { label: "My Notes", shortLabel: "Notes", href: "/dashboard/notes", icon: NotebookPen, roles: ["student"] },
  { label: "Sessions", href: "/dashboard/sessions", icon: Calendar, roles: ["student", "mentor"] },
  { label: "My Application", href: "/dashboard/mentor-application", icon: UserCheck, roles: ["student"] },
  { label: "Certificates", href: "/dashboard/certificates", icon: Award, roles: ["student"] },
  { label: "Webinars", href: "/webinars", icon: Video, roles: ["student", "mentor"] },
  { label: "My Students", shortLabel: "Students", href: "/dashboard/mentor", icon: GraduationCap, roles: ["mentor"] },
  { label: "Availability", href: "/dashboard/mentor/availability", icon: Clock, roles: ["mentor"] },
  { label: "Feedback", href: "/dashboard/mentor/feedback", icon: Star, roles: ["mentor"] },
  { label: "Students", href: "/dashboard/admin/students", icon: Users, roles: ["admin", "super_admin"] },
  { label: "Enrollments", href: "/dashboard/admin/enrollments", icon: CreditCard, roles: ["admin", "super_admin"] },
  { label: "Mentorship", href: "/dashboard/admin/mentorship", icon: Handshake, roles: ["admin", "super_admin"] },
  { label: "Programs", href: "/dashboard/admin/courses", icon: BookOpen, roles: ["admin", "super_admin"] },
  { label: "Mentors", href: "/dashboard/admin/mentors", icon: UserCheck, roles: ["admin", "super_admin"] },
  { label: "Feedback", href: "/dashboard/admin/feedback", icon: Star, roles: ["admin", "super_admin"] },
  { label: "Sheet Sync", href: "/dashboard/admin/sheet-sync", icon: Link2, roles: ["admin", "super_admin"] },
  { label: "Send Notice", shortLabel: "Notice", href: "/dashboard/admin/notifications", icon: Megaphone, roles: ["admin", "super_admin"] },
  { label: "Analytics", href: "/dashboard/admin", icon: BarChart3, roles: ["admin", "super_admin"] },
  { label: "Notifications", shortLabel: "Alerts", href: "/dashboard/notifications", icon: Bell, roles: ["student", "mentor", "admin", "super_admin"] },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["student", "mentor", "admin", "super_admin"] },
];

interface SidebarProps {
  role: Role;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  /*
   * 6, not 5 — the mentor role's filtered list is Dashboard, Sessions,
   * Webinars, My Students, Availability, Feedback (6 items before
   * Notifications/Settings). At slice(0, 5), Feedback fell off the mobile
   * bottom nav entirely with no way to reach it except typing the URL.
   * Bumping to 6 is purely additive for every role — no role's filtered
   * list order changed, so this can only add an item to a role's mobile
   * nav, never remove one that was reachable before.
   *
   * Admin's new Feedback entry lands at index 6 (Dashboard, Students,
   * Enrollments, Mentorship, Programs, Mentors, Feedback, ...) — past this
   * same slice(0, 6) bound, so it doesn't appear on mobile either. That's
   * not a regression: Sheet Sync, Send Notice, Analytics, Notifications,
   * and Settings were already past index 6 for admin before this change,
   * so no previously-reachable admin item becomes unreachable — Feedback
   * simply joins that same already-desktop-only group.
   */
  const mobileItems = items.slice(0, 6);

  /*
   * Longest matching href wins. A plain startsWith lit up every ancestor —
   * on /dashboard/admin/enrollments both "Analytics" (/dashboard/admin) and
   * "Enrollments" highlighted at once. Matching on `href + "/"` also stops
   * /dashboard/adminfoo from matching /dashboard/admin.
   */
  const activeHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

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

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex justify-around items-center px-2 py-2 bg-pz-surface-container-highest shadow-lg rounded-t-xl">
        {mobileItems.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-full text-[10px] font-label transition-colors",
                active ? "bg-pz-secondary-container text-pz-on-secondary-container" : "text-pz-on-surface-variant"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.shortLabel ?? item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
