"use client";

/** Clipboard API first; old browsers fall back to execCommand, whose boolean result is the truth. */
export async function copyText(text: string, host: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    (host ?? document.body).appendChild(el);
    el.select();
    let ok = false;
    try { ok = document.execCommand("copy") === true; } catch { ok = false; }
    el.remove();
    return ok;
  }
}
