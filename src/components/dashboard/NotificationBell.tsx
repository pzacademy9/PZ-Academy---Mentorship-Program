"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationBellProps {
  count?: number;
}

export function NotificationBell({ count = 0 }: NotificationBellProps) {
  return (
    <Button variant="ghost" size="icon" className="relative text-pz-muted hover:text-pz-forest">
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-pz-danger text-white text-[10px] flex items-center justify-center font-bold">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Button>
  );
}
