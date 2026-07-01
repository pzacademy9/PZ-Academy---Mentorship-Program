"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BookOpen, Calendar, Award, Users, Settings,
  GraduationCap, BarChart3, CreditCard, Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Role } from "@/lib/roles";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["student", "mentor", "admin", "super_admin"] },
  { label: "My Courses", href: "/dashboard/courses", icon: BookOpen, roles: ["student"] },
  { label: "Sessions", href: "/dashboard/sessions", icon: Calendar, roles: ["student", "mentor"] },
  { label: "Certificates", href: "/dashboard/certificates", icon: Award, roles: ["student"] },
  { label: "Webinars", href: "/dashboard/webinars", icon: Video, roles: ["student", "mentor"] },
  { label: "My Students", href: "/dashboard/mentor", icon: GraduationCap, roles: ["mentor"] },
  { label: "Students", href: "/dashboard/admin/students", icon: Users, roles: ["admin", "super_admin"] },
  { label: "Enrollments", href: "/dashboard/admin/enrollments", icon: CreditCard, roles: ["admin", "super_admin"] },
  { label: "Analytics", href: "/dashboard/admin", icon: BarChart3, roles: ["admin", "super_admin"] },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["student", "mentor", "admin", "super_admin"] },
];

interface SidebarProps {
  role: Role;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside className="hidden lg:flex flex-col w-60 min-h-screen bg-pz-forest shrink-0">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-pz-pine/40">
        <div className="w-8 h-8 rounded-full bg-pz-lime flex items-center justify-center shrink-0">
          <span className="font-montserrat font-black text-pz-forest text-xs">PZ</span>
        </div>
        <span className="font-montserrat font-bold text-white text-sm">PZ Academy</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-pz-lime/10 text-pz-lime border-l-2 border-pz-lime pl-2.5"
                  : "text-pz-mint/70 hover:text-pz-mint hover:bg-white/5"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
