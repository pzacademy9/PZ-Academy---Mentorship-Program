"use client";

import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "./NotificationBell";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AppNotification } from "@/lib/data/notifications";

interface TopbarProps {
  fullName: string;
  role: string;
  currentUserId: string;
  /** Server-rendered by the dashboard layout; see getNotificationSummary. */
  notifications?: AppNotification[];
  unreadCount?: number;
}

export function Topbar({ fullName, role, currentUserId, notifications = [], unreadCount = 0 }: TopbarProps) {
  const router = useRouter();
  const initials = fullName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="h-16 border-b border-pz-outline-variant/20 dark:border-[#2a2f2c] bg-pz-surface dark:bg-[#1c211e] flex items-center justify-between px-4 sm:px-6 shrink-0 sticky top-0 z-30">
      <div className="flex items-center gap-2 lg:hidden">
        <span className="font-headline font-black text-pz-primary">PharmaZyme</span>
      </div>
      <div className="hidden lg:block" />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationBell currentUserId={currentUserId} items={notifications} unreadCount={unreadCount} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2 h-9">
              <Avatar className="w-8 h-8 ring-2 ring-pz-primary/40">
                <AvatarFallback className="bg-pz-bright text-pz-deep text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm font-label font-medium text-pz-on-surface max-w-[120px] truncate">{fullName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-pz-on-surface truncate">{fullName}</p>
              <p className="text-xs text-pz-on-surface-variant capitalize">{role.replace("_", " ")}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/dashboard/settings" className="cursor-pointer">
                <User className="w-4 h-4 mr-2" /> Profile
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-pz-danger cursor-pointer">
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
