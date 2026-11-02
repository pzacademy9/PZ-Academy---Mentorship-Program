import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuccessScreen, type SuccessScreenProps } from "@/components/landing/registration/SuccessScreen";
import { emptyContent, normalizeContent } from "@/lib/landing/content";
import type { RegisterSuccess } from "@/components/landing/registration/types";
import { ppcConfig } from "./fixtures/registration-fixtures";

const paid: RegisterSuccess = {
  refId: "PZA-PPC-042", total: 4800, currency: "PKR",
  waGroups: [], verifyMessage: "",
};
const base: SuccessScreenProps = {
  slug: "ppc", config: ppcConfig, result: paid, lead: { name: "Sara Ali", email: "sara@mail.com" },
  mode: "live", isFree: false, testMode: false, isGuest: true, onClose: () => {},
};

describe("showCreateAccount setting", () => {
  it("default settings have showCreateAccount true", () => {
    expect(emptyContent("course").settings.showCreateAccount).toBe(true);
  });
  it("normalizeContent keeps false and treats a missing or odd value as true", () => {
    expect(normalizeContent({ settings: {} }).settings.showCreateAccount).toBe(true);
    expect(normalizeContent({ settings: { showCreateAccount: false } }).settings.showCreateAccount).toBe(false);
    expect(normalizeContent({ settings: { showCreateAccount: "no" } }).settings.showCreateAccount).toBe(true);
  });
});

describe("SuccessScreen account card", () => {
  it("shows the account card for a guest by default", () => {
    render(<SuccessScreen {...base} />);
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Log in" })).toBeTruthy();
  });
  it("hides the account card when showCreateAccount is false but keeps status link and Done", () => {
    render(<SuccessScreen {...base} showCreateAccount={false} />);
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    expect(screen.getByText("Check your registration status")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });
});
