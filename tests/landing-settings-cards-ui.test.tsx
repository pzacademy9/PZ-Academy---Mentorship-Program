import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ModeChoice } from "@/components/admin/landing/ModeChoice";
import { PageSettingsPanel } from "@/components/admin/landing/PageSettingsPanel";
import { emptyContent } from "@/lib/landing/content";
import type { SettingsCardId, CardStatus } from "@/lib/landing/settings-cards";
import { ppcConfig } from "./fixtures/registration-fixtures";

const READY: Record<SettingsCardId, CardStatus> = { who: "ready", button: "ready", after: "ready", links: "ready", dates: "ready" };

function panel(over: Partial<React.ComponentProps<typeof PageSettingsPanel>> = {}) {
  const c = emptyContent("course");
  const props: React.ComponentProps<typeof PageSettingsPanel> = {
    settings: c.settings, seo: c.seo, slug: "demo", pageTitle: "Demo",
    onSettings: vi.fn(), onSeo: vi.fn(),
    registration: { ...ppcConfig, enabled: true, modes: ["live", "recorded"], recordedPercentOfRegular: 80 },
    registrationStep: "buy", onRegistrationStep: vi.fn(), onRegistration: vi.fn(),
    statuses: READY, hasCourse: true, courseTitle: "Demo Course",
    ...over,
  };
  return { ...render(<PageSettingsPanel {...props} />), props };
}

describe("ModeChoice", () => {
  it("selects Both for live and recorded and none for empty", () => {
    const { rerender } = render(<ModeChoice modes={["recorded", "live"]} onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /^Both/ }).getAttribute("aria-checked")).toBe("true");
    rerender(<ModeChoice modes={[]} onChange={vi.fn()} />);
    for (const r of screen.getAllByRole("radio")) expect(r.getAttribute("aria-checked")).toBe("false");
  });
});

describe("Page settings cards", () => {
  it("choosing Live only keeps the recorded percent and every option", () => {
    const { props } = panel();
    fireEvent.click(screen.getByRole("radio", { name: /^Live only/ }));
    const next = (props.onRegistration as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(next.modes).toEqual(["live"]);
    expect(next.recordedPercentOfRegular).toBe(80);
    expect(next.options).toEqual(props.registration!.options);
  });
  it("a card shows its tag and toggles open and closed", () => {
    panel({ statuses: { ...READY, button: "attention" } });
    const card = screen.getByRole("region", { name: "Register button" });
    expect(within(card).getByText("Needs attention")).toBeTruthy();
    expect(within(card).getByLabelText("Button text")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Close Register button" }));
    expect(within(card).queryByLabelText("Button text")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Open Register button" }));
    expect(within(card).getByLabelText("Button text")).toBeTruthy();
  });
  it("the header counts ready cards", () => {
    panel({ statuses: { ...READY, who: "attention", links: "attention" } });
    expect(screen.getByText("3 of 5 ready")).toBeTruthy();
  });
  it("the Create account switch writes showCreateAccount", () => {
    const { props } = panel();
    const sw = screen.getByRole("switch", { name: "Offer to create an account" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(props.onSettings).toHaveBeenCalledWith({ showCreateAccount: false });
  });
  it("card 4 lists each option's link state and Edit group links jumps to the WhatsApp step", () => {
    const registration = {
      ...ppcConfig, enabled: true, modes: ["live" as const],
      options: ppcConfig.options.map((o, i) => ({ ...o, waGroupUrl: i === 0 ? "https://chat.whatsapp.com/AAAAAAAAAA" : "" })),
    };
    const { props } = panel({ registration });
    const card = screen.getByRole("region", { name: "WhatsApp and portal links" });
    expect(within(card).getAllByText("Valid link").length).toBe(1);
    expect(within(card).getAllByText("No link").length).toBe(registration.options.length - 1);
    fireEvent.click(within(card).getByRole("button", { name: "Edit group links" }));
    expect(props.onRegistrationStep).toHaveBeenCalledWith("whatsapp");
  });
  it("card 2 shows the link field only when the registration form is off", () => {
    const { unmount } = panel();
    expect(screen.queryByLabelText("What the button does")).toBeNull();
    expect(screen.getByText(/opens the built-in registration form/i)).toBeTruthy();
    unmount();
    panel({ registration: { ...ppcConfig, enabled: false } });
    expect(screen.getByLabelText("What the button does")).toBeTruthy();
  });
});
