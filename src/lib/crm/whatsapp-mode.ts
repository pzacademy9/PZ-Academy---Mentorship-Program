import { toWebLink } from "@/lib/crm/whatsapp-link";

/** How the person wants WhatsApp opened for the rest of this session. */
export type WhatsAppMode = "web" | "app";

export const WEB_TAB_NAME = "pz-whatsapp-web";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const modeStorageKey = (scope: string) => `pz-whatsapp-mode:${scope}`;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readMode(scope: string, storage: StorageLike | null = defaultStorage()): WhatsAppMode | null {
  try {
    const v = storage?.getItem(modeStorageKey(scope));
    return v === "web" || v === "app" ? v : null;
  } catch {
    return null;
  }
}

export function writeMode(scope: string, mode: WhatsAppMode, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(modeStorageKey(scope), mode);
  } catch {
    /* storage unavailable: the choice just lasts until the page reloads */
  }
}

export function clearMode(scope: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(modeStorageKey(scope));
  } catch {
    /* ignore */
  }
}

/** The link to hand the browser (or show as an anchor) for the chosen mode. */
export function linkForMode(appLink: string, mode: WhatsAppMode | null): string {
  return mode === "web" ? toWebLink(appLink) : appLink;
}

type TabLike = { location: { href: string }; close: () => void };
export type WebTabHandle = {
  /** True when the browser refused the popup. */
  blocked: boolean;
  navigate: (url: string) => void;
  /** Closes the pre-opened tab only if it is still our empty placeholder. */
  closeIfBlank: () => void;
};

/**
 * Must be called synchronously inside the click handler, before any await,
 * so the browser treats it as user-initiated. The named target means repeat
 * clicks reuse one tab.
 */
export function preOpenWebTab(
  env: { open: (url: string, name: string) => TabLike | null } = window as unknown as {
    open: (url: string, name: string) => TabLike | null;
  },
): WebTabHandle {
  let tab: TabLike | null = null;
  try {
    tab = env.open("about:blank", WEB_TAB_NAME);
  } catch {
    tab = null;
  }
  return {
    blocked: tab === null,
    navigate(url) {
      if (tab) tab.location.href = url;
    },
    closeIfBlank() {
      if (!tab) return;
      try {
        // Cross-origin (already WhatsApp) throws or differs: then it is not ours to close.
        if (tab.location.href === "about:blank") tab.close();
      } catch {
        /* not ours */
      }
    },
  };
}
