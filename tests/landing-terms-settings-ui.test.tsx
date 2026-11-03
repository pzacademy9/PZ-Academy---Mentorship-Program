import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PageSettingsPanel } from "@/components/admin/landing/PageSettingsPanel";
import { emptyContent, computeReadiness } from "@/lib/landing/content";
import { runPageChecks } from "@/lib/landing/page-check";
import { settingsCardStatus, readyCount } from "@/lib/landing/settings-cards";
import type { SettingsCardId, CardStatus } from "@/lib/landing/settings-cards";

const READY: Record<SettingsCardId, CardStatus> = { who: "ready", button: "ready", after: "ready", links: "ready", dates: "ready" };

function panel(terms: string | undefined) {
  const c = emptyContent("course");
  const onSettings = vi.fn();
  render(<PageSettingsPanel settings={{ ...c.settings, terms }} seo={c.seo} slug="demo" pageTitle="Demo" onSettings={onSettings} onSeo={vi.fn()} statuses={READY} />);
  return { onSettings };
}

describe("Terms and Conditions card in Page settings", () => {
  it("shows the stored text and typing updates settings.terms", () => {
    const { onSettings } = panel("1. Saved fake rule");
    const card = screen.getByRole("region", { name: "Terms and Conditions" });
    const box = within(card).getByLabelText("Terms and Conditions for this page") as HTMLTextAreaElement;
    expect(box.value).toBe("1. Saved fake rule");
    fireEvent.change(box, { target: { value: "1. New fake rule" } });
    expect(onSettings).toHaveBeenCalledWith({ terms: "1. New fake rule" });
  });

  it("an empty box is fine: no problem is added to readiness or the page check", () => {
    const withTerms = emptyContent("course");
    const without = { ...withTerms, settings: { ...withTerms.settings, terms: "" } };
    const filled = { ...withTerms, settings: { ...withTerms.settings, terms: "1. A fake rule" } };
    const ctx = { slug: "demo", title: "Demo" };
    expect(computeReadiness(without, ctx).problems.length).toBe(computeReadiness(filled, ctx).problems.length);
    expect(runPageChecks(without, { hasCourse: false }).map((k) => k.status)).toEqual(runPageChecks(filled, { hasCourse: false }).map((k) => k.status));
  });

  it("the card explains the general Terms and links to their screen", () => {
    panel("");
    const card = screen.getByRole("region", { name: "Terms and Conditions" });
    expect(within(card).getByText(/leave it empty, the general Terms are used/i)).toBeTruthy();
    const link = within(card).getByRole("link", { name: /edit the general terms/i });
    expect(link.getAttribute("href")).toBe("/dashboard/admin/terms");
  });

  it("the five existing cards keep their statuses and the ready count", () => {
    const c = emptyContent("course");
    const a = settingsCardStatus(c, { hasCourse: false });
    const b = settingsCardStatus({ ...c, settings: { ...c.settings, terms: "1. A fake rule" } }, { hasCourse: false });
    expect(Object.keys(a)).toEqual(["who", "button", "after", "links", "dates"]);
    expect(b).toEqual(a);
    expect(readyCount(a)).toBeLessThanOrEqual(5);
  });
});
