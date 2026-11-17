"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RESUME_KEY, isRememberablePath } from "@/lib/resume-path";

// Remembers the last portal page so the home-screen icon can reopen it. Renders nothing.
export function ResumeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? "";

  useEffect(() => {
    const path = query ? `${pathname}?${query}` : pathname;
    if (!isRememberablePath(path)) return;
    try {
      localStorage.setItem(RESUME_KEY, path);
    } catch {
      // Storage can be blocked or full; remembering the page is optional.
    }
  }, [pathname, query]);

  return null;
}
