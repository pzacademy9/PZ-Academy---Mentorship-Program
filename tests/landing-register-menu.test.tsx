// tests/landing-register-menu.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/landing/compress-image", () => ({ compressImage: async (f: File) => f }));

import { RegisterButton } from "@/components/landing/RegisterButton";
import { RegistrationModal } from "@/components/landing/registration/RegistrationModal";
import { RegistrationHost } from "@/components/landing/registration/RegistrationHost";
import { onOpenRegistration, openRegistration } from "@/components/landing/registration/registration-bus";
import { ppcConfig, publicConfig } from "./fixtures/registration-fixtures";

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (rawUrl: string): Promise<unknown> => {
    const url = String(rawUrl).split("?")[0];
    if (url.endsWith("/config")) return { ok: true, status: 200, json: async () => publicConfig(ppcConfig) };
    return { ok: true, json: async () => null };
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const two = { url: "https://x.com", label: "Register now", closed: false, builtIn: true, modes: ["live", "recorded"] as ("live" | "recorded")[] };

describe("RegisterMenu", () => {
  it("two modes: a menu button lists Join Live and Join Recorded Lectures, and picking Recorded opens with that mode", () => {
    const seen: unknown[] = [];
    const off = onOpenRegistration((o) => seen.push(o));
    render(<RegisterButton register={two} />);
    const trigger = screen.getByRole("button", { name: /register now/i });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Join Live", "Join Recorded Lectures"]);
    fireEvent.click(items[1]);
    expect(seen).toEqual([{ mode: "recorded" }]);
    expect(screen.queryByRole("menu")).toBeNull();
    off();
  });
  it("arrow keys move between items and Escape closes and refocuses the trigger", () => {
    render(<RegisterButton register={two} />);
    const trigger = screen.getByRole("button", { name: /register now/i });
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("an outside click closes the menu", () => {
    render(<><RegisterButton register={two} /><p>elsewhere</p></>);
    fireEvent.click(screen.getByRole("button", { name: /register now/i }));
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("one mode renders the plain launcher link (no menu)", () => {
    render(<RegisterButton register={{ ...two, modes: ["live"] }} />);
    expect(screen.queryByRole("button", { name: /register now/i })?.getAttribute("aria-haspopup")).not.toBe("menu");
    expect(screen.getByRole("link", { name: /register now/i }).getAttribute("href")).toBe("https://x.com");
  });
  it("no modes field renders the plain launcher", () => {
    const { modes: _m, ...plain } = two; void _m;
    render(<RegisterButton register={plain} />);
    expect(screen.getByRole("link", { name: /register now/i })).toBeTruthy();
  });
  it("a closed page renders the notice, not the menu", () => {
    render(<RegisterButton register={{ ...two, closed: true }} />);
    expect(screen.getByText(/registration is closed/i)).toBeTruthy();
    expect(screen.queryByRole("menuitem")).toBeNull();
  });
  it("a pending open (before the host mounts) carries the chosen mode", () => {
    openRegistration(null, { mode: "recorded" });
    const seen: unknown[] = [];
    const off = onOpenRegistration((o) => seen.push(o));
    expect(seen).toEqual([{ mode: "recorded" }]);
    off();
  });
  it("a plain open passes no mode", () => {
    const seen: unknown[] = [];
    const off = onOpenRegistration((o) => seen.push(o));
    openRegistration(null);
    expect(seen).toEqual([{}]);
    off();
  });
});

describe("RegistrationModal initialMode", () => {
  it("starts on the given mode and does not render the mode fieldset", async () => {
    render(<RegistrationModal slug="ppc" open onClose={() => {}} tracking={false} initialMode="recorded" />);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("radio", { name: /full course/i })).toBeTruthy());
    expect(within(dialog).queryByText(/how do you want to learn/i)).toBeNull();
  });
  it("without initialMode the fieldset is still shown", async () => {
    render(<RegistrationModal slug="ppc" open onClose={() => {}} tracking={false} />);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText(/how do you want to learn/i)).toBeTruthy());
  });
  it("reopening keeps typed answers but applies a newly picked mode", async () => {
    const { rerender } = render(<RegistrationModal slug="ppc" open onClose={() => {}} tracking={false} initialMode="live" />);
    const dialog = await screen.findByRole("dialog");
    const full = await within(dialog).findByRole("radio", { name: /full course/i }) as HTMLInputElement;
    fireEvent.click(full);
    rerender(<RegistrationModal slug="ppc" open={false} onClose={() => {}} tracking={false} initialMode="live" />);
    rerender(<RegistrationModal slug="ppc" open onClose={() => {}} tracking={false} initialMode="recorded" />);
    const again = await screen.findByRole("radio", { name: /full course/i }) as HTMLInputElement;
    expect(again.checked).toBe(true);
    // the recorded price differs from live in the fixture, so the shown price proves the mode applied
    const liveRow = again.closest("label")!.textContent;
    rerender(<RegistrationModal slug="ppc" open onClose={() => {}} tracking={false} initialMode="live" />);
    await waitFor(() => expect((screen.getByRole("radio", { name: /full course/i }).closest("label")!.textContent)).not.toBe(liveRow));
  });
});

describe("RegistrationHost mode", () => {
  it("a plain Register click does not clobber a chosen mode", async () => {
    render(<RegistrationHost slug="ppc" tracking={false} />);
    openRegistration(null, { mode: "recorded" });
    await screen.findByRole("dialog");
    await screen.findByRole("radio", { name: /full course/i });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    openRegistration(null);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/how do you want to learn/i)).toBeNull();
  });
});

describe("LandingRenderer wiring", () => {
  it("two modes on the public route render the menu; the preview route keeps the plain link", async () => {
    const { LandingRenderer } = await import("@/components/landing/LandingRenderer");
    const { emptyContent, updateRegistration, updateSettings } = await import("@/lib/landing/content");
    const on = updateRegistration(updateSettings(emptyContent("course"), { registerUrl: "https://old.example/register" }), ppcConfig);
    const pub = render(<LandingRenderer content={on} status="published" kind="course" pageTitle="PPC" slug="ppc" />);
    expect(pub.container.querySelectorAll("button[aria-haspopup='menu']").length).toBeGreaterThan(0);
    pub.unmount();
    const preview = render(<LandingRenderer content={on} status="published" kind="course" pageTitle="PPC" />);
    expect(preview.container.querySelector("button[aria-haspopup='menu']")).toBeNull();
  });
});
