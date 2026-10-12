import { describe, it, expect, vi } from "vitest";
import {
  modeStorageKey,
  readMode,
  writeMode,
  clearMode,
  linkForMode,
  preOpenWebTab,
  WEB_TAB_NAME,
  linkTargetProps,
} from "@/lib/crm/whatsapp-mode";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("whatsapp mode storage", () => {
  it("keys per scope", () => {
    expect(modeStorageKey("campaign:abc")).not.toBe(modeStorageKey("campaign:def"));
  });
  it("reads nothing before a choice, then the saved choice, then nothing after clear", () => {
    const s = mem();
    expect(readMode("a", s)).toBeNull();
    writeMode("a", "web", s);
    expect(readMode("a", s)).toBe("web");
    expect(readMode("b", s)).toBeNull();
    clearMode("a", s);
    expect(readMode("a", s)).toBeNull();
  });
  it("ignores junk values", () => {
    const s = mem();
    s.setItem(modeStorageKey("a"), "carrier-pigeon");
    expect(readMode("a", s)).toBeNull();
  });
  it("never throws when storage is unavailable", () => {
    const boom = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(readMode("a", boom)).toBeNull();
    expect(() => writeMode("a", "app", boom)).not.toThrow();
    expect(() => clearMode("a", boom)).not.toThrow();
  });
});

describe("linkForMode", () => {
  it("keeps the app link for app and converts for web", () => {
    const app = "whatsapp://send?phone=923001234567&text=hi";
    expect(linkForMode(app, "app")).toBe(app);
    expect(linkForMode(app, "web")).toBe("https://web.whatsapp.com/send?phone=923001234567&text=hi");
  });
});

describe("linkTargetProps", () => {
  it("web reuses the named tab with no noopener; app on desktop opens a fresh tab; phones stay in place", () => {
    expect(linkTargetProps("web", true)).toEqual({ target: WEB_TAB_NAME });
    expect(linkTargetProps("app", true)).toEqual({ target: "_blank", rel: "noopener noreferrer" });
    expect(linkTargetProps("app", false)).toEqual({});
  });
});

type FakeTab = { location: { href: string }; close: ReturnType<typeof vi.fn<() => void>>; closed: boolean; opener: unknown };
const freshTab = (): FakeTab => ({ location: { href: "about:blank" }, close: vi.fn<() => void>(), closed: false, opener: {} });
// A live WhatsApp Web tab: reading its location from our origin throws, like a real cross-origin window.
const liveTab = () => ({
  get location(): never { throw new Error("cross-origin"); },
  close: vi.fn<() => void>(), closed: false, opener: {},
});

describe("preOpenWebTab", () => {
  it("opens with an empty URL (so an existing named tab is not navigated), drops the opener, and navigates later", () => {
    const tab = freshTab();
    const open = vi.fn(() => tab);
    const h = preOpenWebTab({ open });
    expect(open).toHaveBeenCalledWith("", WEB_TAB_NAME);
    expect(tab.opener).toBeNull();
    h.navigate("https://web.whatsapp.com/send?phone=1");
    expect(tab.location.href).toBe("https://web.whatsapp.com/send?phone=1");
  });
  it("closes a tab it just created on refusal", () => {
    const tab = freshTab();
    preOpenWebTab({ open: () => tab }).closeIfBlank();
    expect(tab.close).toHaveBeenCalled();
  });
  it("never closes an existing live WhatsApp tab on refusal", () => {
    const live = liveTab();
    preOpenWebTab({ open: () => live as never }).closeIfBlank();
    expect(live.close).not.toHaveBeenCalled();
    const moved = { ...freshTab(), location: { href: "https://web.whatsapp.com/" } };
    preOpenWebTab({ open: () => moved }).closeIfBlank();
    expect(moved.close).not.toHaveBeenCalled();
  });
  it("reports closed and blocked state", () => {
    const tab = freshTab();
    const h = preOpenWebTab({ open: () => tab });
    expect(h.isClosed()).toBe(false);
    tab.closed = true;
    expect(h.isClosed()).toBe(true);
    const b = preOpenWebTab({ open: () => null });
    expect(b.blocked).toBe(true);
    expect(() => b.closeIfBlank()).not.toThrow();
  });
});
