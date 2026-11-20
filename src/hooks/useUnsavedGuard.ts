"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Warns before leaving a page that has unsaved work. While `dirty`:
 * - closing or reloading the tab asks the browser's own question;
 * - clicking a link to another page in this site asks in our own dialog first.
 * A link can opt out with the `data-allow-leave` attribute.
 *
 * The dialog comes from the app-wide ConfirmProvider, so `confirmLeaveDialog`
 * is always null; it is returned so callers have one place to render it if
 * that ever changes.
 */
export function useUnsavedGuard(dirty: boolean): { confirmLeaveDialog: React.ReactNode } {
  const router = useRouter();
  const confirm = useConfirm();
  const asking = useRef(false);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("data-allow-leave") || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      const raw = anchor.getAttribute("href") ?? "";
      if (raw.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;

      e.preventDefault();
      e.stopPropagation();
      if (asking.current) return;
      asking.current = true;
      const href = url.pathname + url.search + url.hash;
      void confirm({
        title: "Leave without saving?",
        description: "You have changes that are not saved. Leave anyway?",
        confirmLabel: "Leave anyway",
        cancelLabel: "Stay",
        destructive: true,
      })
        .then((ok) => {
          if (ok) router.push(href);
        })
        .finally(() => {
          asking.current = false;
        });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirm, router]);

  return { confirmLeaveDialog: null };
}
