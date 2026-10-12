import { describe, it, expect, vi } from "vitest";
import {
  modeStorageKey,
  readMode,
  writeMode,
  clearMode,
  linkForMode,
  preOpenWebTab,
  WEB_TAB_NAME,
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

describe("preOpenWebTab", () => {
  it("opens a named blank tab and navigates it later", () => {
    const tab = { location: { href: "about:blank" }, close: vi.fn(), closed: false };
    const open = vi.fn(() => tab);
    const h = preOpenWebTab({ open });
    expect(open).toHaveBeenCalledWith("about:blank", WEB_TAB_NAME);
    h.navigate("https://web.whatsapp.com/send?phone=1");
    expect(tab.location.href).toBe("https://web.whatsapp.com/send?phone=1");
  });
  it("closes a still-blank tab on refusal but not one that moved on", () => {
    const blank = { location: { href: "about:blank" }, close: vi.fn(), closed: false };
    preOpenWebTab({ open: () => blank }).closeIfBlank();
    expect(blank.close).toHaveBeenCalled();
    const live = { location: { href: "https://web.whatsapp.com/" }, close: vi.fn(), closed: false };
    preOpenWebTab({ open: () => live }).closeIfBlank();
    expect(live.close).not.toHaveBeenCalled();
    const cross = { get location(): never { throw new Error("cross-origin"); }, close: vi.fn(), closed: false };
    preOpenWebTab({ open: () => cross as never }).closeIfBlank();
    expect(cross.close).not.toHaveBeenCalled();
  });
  it("reports a blocked popup and falls back on navigate", () => {
    const h = preOpenWebTab({ open: () => null });
    expect(h.blocked).toBe(true);
    expect(() => h.closeIfBlank()).not.toThrow();
  });
});
