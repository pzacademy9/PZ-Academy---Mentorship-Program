import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PageCheckPanel } from "@/components/admin/landing/PageCheckPanel";
import { PageSettingsPanel } from "@/components/admin/landing/PageSettingsPanel";
import { emptyContent } from "@/lib/landing/content";
import type { PageCheck } from "@/lib/landing/page-check";

const fail: PageCheck = {
  id: "live-groups", title: "Every paid option needs a WhatsApp group", status: "fail",
  detail: "No valid WhatsApp group link for: Module 1.", step: "whatsapp",
};
const pass: PageCheck = { id: "recorded-no-group", title: "Recorded students get the portal, not a group link", status: "pass" };
const warn: PageCheck = {
  id: "shared-groups", title: "Some options share one WhatsApp group", status: "warn",
  detail: "Full Course and Module 1 use the same WhatsApp group", step: "whatsapp",
};

describe("PageCheckPanel", () => {
  it("a failing check renders its message and a Fix this button that calls onGoto", () => {
    const onGoto = vi.fn();
    render(<PageCheckPanel checks={[fail]} onGoto={onGoto} />);
    expect(screen.getByText("No valid WhatsApp group link for: Module 1.")).toBeTruthy();
    expect(screen.getByText("1 thing must be fixed before this page can be published.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fix this" }));
    expect(onGoto).toHaveBeenCalledWith("registration:whatsapp");
  });
  it("passing checks render ticks", () => {
    render(<PageCheckPanel checks={[pass]} onGoto={vi.fn()} />);
    expect(screen.getByText(pass.title)).toBeTruthy();
    expect(screen.getByLabelText("Passed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fix this" })).toBeNull();
  });
  it("a warning shows a note without blocking", () => {
    render(<PageCheckPanel checks={[warn, pass]} onGoto={vi.fn()} />);
    expect(screen.getByLabelText("Warning")).toBeTruthy();
    expect(screen.getByText("Everything that must be fixed is fixed. 1 thing to look at.")).toBeTruthy();
  });
});

function settingsPanel(opts: { modes: ("live" | "recorded")[]; hasCourse: boolean; onSettings?: (p: object) => void }) {
  const c = emptyContent("course");
  c.registration = { ...c.registration, enabled: true, modes: opts.modes };
  return render(
    <PageSettingsPanel
      settings={c.settings}
      seo={c.seo}
      slug="demo"
      pageTitle="Demo"
      onSettings={opts.onSettings ?? (() => {})}
      onSeo={() => {}}
      registration={c.registration}
      hasCourse={opts.hasCourse}
      courseTitle={opts.hasCourse ? "Demo Course" : null}
    />,
  );
}

describe("PageSettingsPanel portal card", () => {
  it("shows the portal field only when recorded is offered and the page has no course", () => {
    const { unmount } = settingsPanel({ modes: ["recorded"], hasCourse: false });
    expect(screen.getByText("Which portal they get")).toBeTruthy();
    expect(screen.getByLabelText("Portal link")).toBeTruthy();
    unmount();
    const b = settingsPanel({ modes: ["live"], hasCourse: false });
    expect(screen.queryByText("Which portal they get")).toBeNull();
    b.unmount();
    settingsPanel({ modes: ["recorded"], hasCourse: true });
    expect(screen.getByText("Recorded students get the portal for Demo Course.")).toBeTruthy();
    expect(screen.queryByLabelText("Portal link")).toBeNull();
  });
  it("typing a portal link updates settings.portalLink", () => {
    const onSettings = vi.fn();
    settingsPanel({ modes: ["recorded"], hasCourse: false, onSettings });
    fireEvent.change(screen.getByLabelText("Portal link"), { target: { value: "https://portal.example.com/x" } });
    expect(onSettings).toHaveBeenCalledWith({ portalLink: "https://portal.example.com/x" });
  });
});
