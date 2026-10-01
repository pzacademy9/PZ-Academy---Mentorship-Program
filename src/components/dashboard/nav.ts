import {
  LayoutDashboard, BookOpen, Calendar, Award, Users, Settings, Clock,
  GraduationCap, BarChart3, CreditCard, Video, NotebookPen, Bell, Megaphone, Link2,
  Handshake, UserCheck, Star, MessageCircle, Image, Contact,
} from "lucide-react";
import { type Role } from "@/lib/roles";

export interface NavItem {
  label: string;
  shortLabel?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["student", "mentor", "admin", "super_admin"] },
  { label: "My Courses", shortLabel: "Courses", href: "/dashboard/courses", icon: BookOpen, roles: ["student"] },
  { label: "My Notes", shortLabel: "Notes", href: "/dashboard/notes", icon: NotebookPen, roles: ["student"] },
  { label: "Sessions", href: "/dashboard/sessions", icon: Calendar, roles: ["student", "mentor"] },
  { label: "Messages", href: "/dashboard/messages", icon: MessageCircle, roles: ["student"] },
  { label: "Messages", href: "/dashboard/mentor/messages", icon: MessageCircle, roles: ["mentor"] },
  { label: "My Application", href: "/dashboard/mentor-application", icon: UserCheck, roles: ["student"] },
  { label: "Certificates", href: "/dashboard/certificates", icon: Award, roles: ["student"] },
  { label: "Webinars", href: "/webinars", icon: Video, roles: ["student", "mentor"] },
  { label: "My Students", shortLabel: "Students", href: "/dashboard/mentor", icon: GraduationCap, roles: ["mentor"] },
  { label: "Edit Profile", shortLabel: "Profile", href: "/dashboard/mentor/profile", icon: UserCheck, roles: ["mentor"] },
  { label: "Availability", href: "/dashboard/mentor/availability", icon: Clock, roles: ["mentor"] },
  { label: "Feedback", href: "/dashboard/mentor/feedback", icon: Star, roles: ["mentor"] },
  { label: "Students", href: "/dashboard/admin/students", icon: Users, roles: ["admin", "super_admin"] },
  { label: "Enrollments", href: "/dashboard/admin/enrollments", icon: CreditCard, roles: ["admin", "super_admin"] },
  { label: "Mentorship", href: "/dashboard/admin/mentorship", icon: Handshake, roles: ["admin", "super_admin"] },
  { label: "Programs", href: "/dashboard/admin/courses", icon: BookOpen, roles: ["admin", "super_admin"] },
  { label: "Marketing", href: "/dashboard/admin/marketing", icon: Image, roles: ["admin", "super_admin"] },
  { label: "CRM", href: "/dashboard/admin/crm", icon: Contact, roles: ["admin", "super_admin"] },
  { label: "Mentors", href: "/dashboard/admin/mentors", icon: UserCheck, roles: ["admin", "super_admin"] },
  { label: "Feedback", href: "/dashboard/admin/feedback", icon: Star, roles: ["admin", "super_admin"] },
  { label: "Sheet Sync", href: "/dashboard/admin/sheet-sync", icon: Link2, roles: ["admin", "super_admin"] },
  { label: "Send Notice", shortLabel: "Notice", href: "/dashboard/admin/notifications", icon: Megaphone, roles: ["admin", "super_admin"] },
  { label: "Analytics", href: "/dashboard/admin", icon: BarChart3, roles: ["admin", "super_admin"] },
  { label: "Notifications", shortLabel: "Alerts", href: "/dashboard/notifications", icon: Bell, roles: ["student", "mentor", "admin", "super_admin"] },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["student", "mentor", "admin", "super_admin"] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Longest matching href wins; matches `href` exactly or `href + "/"` prefix. */
export function activeHrefFor(items: NavItem[], pathname: string): string | undefined {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function splitMobileNav(items: NavItem[], activeHref: string | undefined, barSize = 4) {
  const bar = items.slice(0, barSize);
  const more = items.slice(barSize);
  return { bar, more, moreActive: more.some((i) => i.href === activeHref) };
}
