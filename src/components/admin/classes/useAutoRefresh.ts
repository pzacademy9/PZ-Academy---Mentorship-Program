"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-reads the page's server data about every minute while the page is on screen, so the reminder line
 * and the send state keep up with the clock. Paused while the tab is hidden; refreshes once when it shows again.
 */
export function useAutoRefresh(everyMs = 60_000) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") routerRef.current.refresh();
    };
    const timer = setInterval(refreshIfVisible, everyMs);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [everyMs]);
}
