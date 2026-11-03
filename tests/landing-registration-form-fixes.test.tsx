// tests/landing-registration-form-fixes.test.tsx
// "Other" country choice, a calmer success screen on phones, and the usual "How did you hear about us?" choices.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";

vi.mock("server-only", () => ({}));

import { StepChoose } from "@/components/landing/registration/StepChoose";
import { SuccessScreen, type SuccessScreenProps } from "@/components/landing/registration/SuccessScreen";
import { RegistrationSetup } from "@/components/admin/landing/registration/RegistrationSetup";
import { R_BTN_WHATSAPP } from "@/components/landing/registration/ui";
import { initialState } from "@/lib/landing/registration/form-state";
import { DEFAULT_DISCOVERY_OPTIONS, type RegistrationConfig } from "@/lib/landing/registration/config";
import { emptyContent } from "@/lib/landing/content";
import { ppcConfig, publicConfig } from "./fixtures/registration-fixtures";
import type { RegisterSuccess } from "@/components/landing/registration/types";

describe("Registering from: Other", () => {
  const view = publicConfig(ppcConfig).registration;
  const noop = () => {};
  const mount = (regions = view.regions) =>
    render(
      <StepChoose
        config={{ ...view, regions }} state={initialState(view, { country: "PK", me: null })} errors={{}} notice={null} isFree={false}
        onRegion={noop} onMode={noop} onToggleOption={noop} onTier={noop} onGroupSize={noop}
      />,
    );
  it("shows the International country as 'Other' and puts it last", () => {
    mount([...view.regions].sort((a, b) => (a.key === "INTL" ? -1 : b.key === "INTL" ? 1 : 0)));
    const group = screen.getByRole("group", { name: "Registering from" });
    const labels = within(group).getAllByRole("radio").map((r) => (r as HTMLInputElement).closest("label")?.textContent);
    expect(labels).toContain("Other");
    expect(labels).not.toContain("International");
    expect(labels.at(-1)).toBe("Other");
  });
  it("leaves the other countries' names alone", () => {
    mount();
    const group = screen.getByRole("group", { name: "Registering from" });
    expect(within(group).getByText("Pakistan")).toBeTruthy();
  });
});

describe("success screen on a phone", () => {
  const paid: RegisterSuccess = {
    refId: "PZA-PPC-042", total: 4800, currency: "PKR",
    waGroups: [{ label: "Module 1", url: "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle" }],
    verifyMessage: "Hi PZ Academy! Ref: PZA-PPC-042",
  };
  const props: SuccessScreenProps = {
    slug: "ppc", config: { ...publicConfig(ppcConfig).registration, whatsappVerifyNumber: "923001234567" }, result: paid,
    lead: { name: "Sara Ali", email: "sara@mail.com" }, mode: "live", isFree: false, testMode: false, isGuest: false, onClose: () => {},
  };
  it("a long WhatsApp button wraps centred, and its icon is not squeezed", () => {
    expect(R_BTN_WHATSAPP).toContain("text-center");
    render(<SuccessScreen {...props} />);
    const join = screen.getByRole("link", { name: /join the module 1 whatsapp group/i });
    expect(join.querySelector("svg")?.getAttribute("class")).toContain("shrink-0");
  });
  it("the status link is a proper button, not a thin underlined line", () => {
    render(<SuccessScreen {...props} />);
    const link = screen.getByRole("link", { name: /check your registration status/i });
    expect(link.className).toContain("border-2");
    expect(link.className).not.toContain("underline");
  });
  it("Done stays in view at the bottom of the screen", () => {
    render(<SuccessScreen {...props} />);
    const done = screen.getByRole("button", { name: "Done" });
    expect(done.parentElement?.className).toContain("sticky");
  });
});

describe("How did you hear about us? choices", () => {
  it("a new page starts with the usual five choices, ending with Other", () => {
    const fresh = emptyContent("course").registration.discoveryOptions;
    expect(fresh).toEqual([...DEFAULT_DISCOVERY_OPTIONS]);
    expect(DEFAULT_DISCOVERY_OPTIONS).toHaveLength(5);
    expect(DEFAULT_DISCOVERY_OPTIONS.at(-1)).toBe("Other");
  });
  function Harness({ initial, spy }: { initial: RegistrationConfig; spy: (r: RegistrationConfig) => void }) {
    const [r, setR] = useState(initial);
    return <RegistrationSetup registration={r} step="details" onStep={() => {}} onChange={(n) => { spy(n); setR(n); }} />;
  }
  it("an empty list offers a one-click fill, and the button goes away once there are choices", () => {
    const spy = vi.fn();
    render(<Harness initial={{ ...ppcConfig, discoveryOptions: [] }} spy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: /use the usual choices/i }));
    expect((spy.mock.calls.at(-1)![0] as RegistrationConfig).discoveryOptions).toEqual([...DEFAULT_DISCOVERY_OPTIONS]);
    expect(screen.queryByRole("button", { name: /use the usual choices/i })).toBeNull();
  });
  it("a page that already has choices shows no such button", () => {
    render(<Harness initial={{ ...ppcConfig, discoveryOptions: ["Friends"] }} spy={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /use the usual choices/i })).toBeNull();
  });
});
