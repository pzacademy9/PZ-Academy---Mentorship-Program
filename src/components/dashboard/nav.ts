import {
  LayoutDashboard, BookOpen, Calendar, Award, Users, Settings, Clock,
  GraduationCap, BarChart3, CreditCard, Video, NotebookPen, Bell, Megaphone, Link2, Target,
  Handshake, UserCheck, Star, MessageCircle, Image, Contact,
  ClipboardList, ClipboardCheck, UserPlus, LifeBuoy, ShieldCheck, ArrowLeft, LayoutTemplate, TicketPercent, Images, Landmark, Trophy, TrendingUp, ScrollText, Wallet,
} from "lucide-react";
import { type Role } from "@/lib/roles";
import { MEDIA_AREAS, type Area } from "@/lib/team/areas";
import { SALES_HUB_BASE, hubPath } from "@/lib/crm/sales-hub-routes";
import { affiliatesTabHref } from "@/lib/affiliates/hub-routes";

export interface NavItem {
  label: string;
  shortLabel?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
  /** Admin-space entries: shown when the person has any one of these areas. */
  areas?: readonly Area[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/dashboard/sales", icon: ClipboardList, roles: ["sales_agent"] },
  { label: "My Contacts", shortLabel: "Contacts", href: "/dashboard/sales/contacts", icon: Users, roles: ["sales_agent"] },
  { label: "Registrations", href: "/dashboard/sales/registrations", icon: ClipboardCheck, roles: ["sales_agent"] },
  { label: "Campaigns", href: "/dashboard/sales/campaigns", icon: Megaphone, roles: ["sales_agent"] },
  { label: "My Links", href: "/dashboard/sales/my-links", icon: Link2, roles: ["sales_agent"] },
  { label: "Add a Lead", shortLabel: "Add lead", href: "/dashboard/sales/add-lead", icon: UserPlus, roles: ["sales_agent"] },
  { label: "Help & Safety", shortLabel: "Help", href: "/dashboard/sales/help", icon: LifeBuoy, roles: ["sales_agent"] },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["student", "mentor", "admin", "manager", "super_admin"] },
  { label: "My Courses", shortLabel: "Courses", href: "/dashboard/courses", icon: BookOpen, roles: ["student"] },
  { label: "My Progress", shortLabel: "Progress", href: "/dashboard/progress", icon: TrendingUp, roles: ["student"] },
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
  { label: "Students", href: "/dashboard/admin/students", icon: Users, roles: ["admin", "manager", "super_admin"], areas: ["students"] },
  { label: "Certificates", href: "/dashboard/admin/certificates", icon: Award, roles: ["admin", "manager", "super_admin"], areas: ["certificates"] },
  { label: "Enrollments", href: "/dashboard/admin/enrollments", icon: CreditCard, roles: ["admin", "manager", "super_admin"], areas: ["enrollments"] },
  { label: "Mentorship", href: "/dashboard/admin/mentorship", icon: Handshake, roles: ["admin", "manager", "super_admin"], areas: ["mentorship"] },
  { label: "Programs", href: "/dashboard/admin/courses", icon: BookOpen, roles: ["admin", "manager", "super_admin"], areas: ["courses"] },
  { label: "Marketing", href: "/dashboard/admin/marketing", icon: Image, roles: ["admin", "manager", "super_admin"], areas: ["marketing"] },
  { label: "Landing Pages", href: "/dashboard/admin/landing-pages", icon: LayoutTemplate, roles: ["admin", "manager", "super_admin"], areas: ["landing_pages"] },
  { label: "Media Library", shortLabel: "Media", href: "/dashboard/admin/landing-media", icon: Images, roles: ["admin", "manager", "super_admin"], areas: MEDIA_AREAS },
  { label: "Promo Codes", shortLabel: "Promos", href: "/dashboard/admin/landing-promo-codes", icon: TicketPercent, roles: ["admin", "manager", "super_admin"], areas: ["landing_pages"] },
  { label: "Affiliates", href: "/dashboard/admin/affiliates", icon: UserPlus, roles: ["admin", "manager", "super_admin"], areas: ["sales_hub"] },
  { label: "Mentors", href: "/dashboard/admin/mentors", icon: UserCheck, roles: ["admin", "manager", "super_admin"], areas: ["mentors"] },
  { label: "Feedback", href: "/dashboard/admin/feedback", icon: Star, roles: ["admin", "manager", "super_admin"], areas: ["feedback"] },
  { label: "Sheet Sync", href: "/dashboard/admin/sheet-sync", icon: Link2, roles: ["admin", "manager", "super_admin"], areas: ["sheet_sync"] },
  { label: "Team", href: "/dashboard/admin/team", icon: ShieldCheck, roles: ["super_admin"] },
  { label: "Analytics", href: "/dashboard/admin", icon: BarChart3, roles: ["admin", "super_admin"] },
  { label: "Notifications", shortLabel: "Alerts", href: "/dashboard/notifications", icon: Bell, roles: ["student", "mentor", "admin", "manager", "super_admin", "sales_agent"] },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["student", "mentor", "admin", "manager", "super_admin", "sales_agent"] },
];

/**
 * What a role sees. Admin-space entries carry `areas` and show only when the person has one of them
 * (`areas` is their effective list). A super admin sees all. When the areas are not known, a manager
 * sees no admin entries at all (fail closed).
 */
export function navForRole(role: Role, areas?: readonly Area[]): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (!item.areas || role === "super_admin") return true;
    if (!areas) return role !== "manager";
    return item.areas.some((a) => areas.includes(a));
  });
}

/** Cards on the Settings page: admin tools that no longer have their own menu entry. */
export interface AdminToolCard {
  label: string;
  description: string;
  href: string;
  icon: NavItem["icon"];
  areas: readonly Area[];
}

export const ADMIN_TOOLS: AdminToolCard[] = [
  { label: "Agent Leaderboard", description: "See how each agent is doing.", href: "/dashboard/admin/agent-leaderboard", icon: Trophy, areas: ["sales_hub"] },
  { label: "Sales Hub", description: "Contacts, cohorts, audiences and campaigns.", href: SALES_HUB_BASE, icon: Contact, areas: ["sales_hub"] },
  { label: "Payment Accounts", description: "Where students send their payments.", href: "/dashboard/admin/payment-accounts", icon: Landmark, areas: ["payment_accounts"] },
  { label: "Terms and Conditions", description: "The terms students agree to when they register.", href: "/dashboard/admin/terms", icon: ScrollText, areas: ["terms"] },
];

/** Same rules as navForRole: admin, manager and super admin only; a manager needs a matching area. */
export function toolsForRole(role: Role, areas?: readonly Area[]): AdminToolCard[] {
  if (role !== "admin" && role !== "manager" && role !== "super_admin") return [];
  return ADMIN_TOOLS.filter((tool) => {
    if (role === "super_admin") return true;
    if (!areas) return role !== "manager";
    return tool.areas.some((a) => areas.includes(a));
  });
}

/** The "Send a notice" button on Notifications: super admin, or anyone with the notifications area. */
export function canSendNotice(role: Role, areas?: readonly Area[]): boolean {
  if (role === "super_admin") return true;
  if (role !== "admin" && role !== "manager") return false;
  if (!areas) return role !== "manager";
  return areas.includes("notifications");
}

/**
 * Pages that live under another menu item. Exact keys (Import and Merge review are tabs of Cohorts)
 * and prefix keys (a key plus "/..."): the tool pages sit under Settings, the notice page under Notifications.
 */
const ROUTE_ALIASES: Record<string, string> = {
  [`${SALES_HUB_BASE}/import`]: `${SALES_HUB_BASE}/cohorts`,
  [`${SALES_HUB_BASE}/merge`]: `${SALES_HUB_BASE}/cohorts`,
  "/dashboard/admin/agent-leaderboard": "/dashboard/settings",
  [SALES_HUB_BASE]: "/dashboard/settings",
  "/dashboard/admin/payment-accounts": "/dashboard/settings",
  "/dashboard/admin/terms": "/dashboard/settings",
  "/dashboard/admin/notifications": "/dashboard/notifications",
};

function aliasFor(pathname: string): string | undefined {
  if (ROUTE_ALIASES[pathname]) return ROUTE_ALIASES[pathname];
  const key = Object.keys(ROUTE_ALIASES)
    .filter((k) => pathname.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? ROUTE_ALIASES[key] : undefined;
}

/**
 * Longest matching href wins; matches `href` exactly or `href + "/"` prefix. An alias is used only when
 * its target is in this list, so a hub menu (which has no Settings entry) keeps resolving its own pages.
 */
export function activeHrefFor(items: NavItem[], rawPathname: string): string | undefined {
  const target = aliasFor(rawPathname);
  const pathname = target && items.some((i) => i.href === target) ? target : rawPathname;
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function splitMobileNav(items: NavItem[], activeHref: string | undefined, barSize = 4) {
  const bar = items.slice(0, barSize);
  const more = items.slice(barSize);
  return { bar, more, moreActive: more.some((i) => i.href === activeHref) };
}

export type HubGroup = "Overview" | "Audience" | "Outreach" | "Team";
export interface HubNavItem extends NavItem { group: HubGroup }

const ADMINS: Role[] = ["admin", "super_admin"];
const hub = (group: HubGroup, label: string, href: string, icon: NavItem["icon"], shortLabel?: string): HubNavItem =>
  ({ group, label, shortLabel, href, icon, roles: ADMINS });

export const SALES_HUB_ITEMS: HubNavItem[] = [
  hub("Overview", "Overview", SALES_HUB_BASE, LayoutDashboard),
  hub("Audience", "Contacts", hubPath("contacts"), Users),
  hub("Team", "Assign Lists", hubPath("assign"), ClipboardList, "Assign"),
  hub("Team", "Sales Team", hubPath("team"), UserPlus, "Team"),
  hub("Audience", "Cohorts", hubPath("cohorts"), GraduationCap),
  hub("Audience", "Audiences", hubPath("audiences"), Target),
  hub("Outreach", "Campaigns", hubPath("campaigns"), Megaphone),
  hub("Outreach", "WhatsApp Batches", hubPath("whatsapp"), MessageCircle, "WhatsApp"),
  hub("Outreach", "Conversion", hubPath("conversion"), BarChart3),
  hub("Team", "WhatsApp Safety", hubPath("safety"), ShieldCheck, "Safety"),
];

export const SALES_HUB_BACK: NavItem = { label: "Back to Admin", shortLabel: "Admin", href: "/dashboard/admin", icon: ArrowLeft, roles: ADMINS };

const AFFILIATE_ROLES: Role[] = ["admin", "manager", "super_admin"];

/** The Affiliates hub menu: each section is a tab of the one Affiliates page. */
export const AFFILIATES_HUB_ITEMS: NavItem[] = [
  { label: "Applications", href: affiliatesTabHref("applications"), icon: ClipboardList, roles: AFFILIATE_ROLES },
  { label: "Affiliates", href: affiliatesTabHref("affiliates"), icon: Users, roles: AFFILIATE_ROLES },
  { label: "Payouts", href: affiliatesTabHref("payouts"), icon: Wallet, roles: AFFILIATE_ROLES },
  { label: "Leaderboard", href: affiliatesTabHref("leaderboard"), icon: Trophy, roles: AFFILIATE_ROLES },
  { label: "Emails", href: affiliatesTabHref("emails"), icon: Megaphone, roles: AFFILIATE_ROLES },
];

export const AFFILIATES_HUB_BACK: NavItem = { label: "Back to Admin", shortLabel: "Admin", href: "/dashboard/admin", icon: ArrowLeft, roles: AFFILIATE_ROLES };
