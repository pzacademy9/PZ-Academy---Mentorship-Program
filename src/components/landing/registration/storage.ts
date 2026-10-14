// Storage and cookies can throw (private mode, blocked site data, quota). Nothing here ever does.
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

function wrap(get: () => Storage): KV | null {
  try {
    const s = get();
    return {
      getItem: (k) => { try { return s.getItem(k); } catch { return null; } },
      setItem: (k, v) => { try { s.setItem(k, v); } catch { /* full or blocked */ } },
      removeItem: (k) => { try { s.removeItem(k); } catch { /* blocked */ } },
    };
  } catch {
    return null;
  }
}

export function safeLocal(): KV | null {
  return typeof window === "undefined" ? null : wrap(() => window.localStorage);
}
export function safeSession(): KV | null {
  return typeof window === "undefined" ? null : wrap(() => window.sessionStorage);
}
export function documentCookie(): string {
  try { return typeof document === "undefined" ? "" : document.cookie; } catch { return ""; }
}
