// tests/campaign-toolbar.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CampaignToolbar } from "@/components/admin/registrations/CampaignToolbar";

const counts = { all: 9, pending: 2, reserved: 1, underpaid: 1, paid: 4, free: 1 };
const BASE = "/dashboard/admin/enrollments/registrations/abc";
const options = { regions: ["Pakistan", "UAE"], optionLabels: ["Full course", "Module 1"] };

afterEach(cleanup);

function setup(filters = {}, extra: { toolsSlot?: React.ReactNode } = {}) {
  return render(<CampaignToolbar basePath={BASE} filters={filters} counts={counts} options={options} {...extra} />);
}
const searchForm = () => screen.getByRole("search") as HTMLFormElement;
const hidden = (form: HTMLFormElement, name: string) =>
  (form.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement | null)?.value;

describe("CampaignToolbar", () => {
  it("shows the count badge for set filters and hides it at zero", () => {
    setup({ mode: "live", optionScopes: "full" });
    expect(screen.getByTestId("filters-badge").textContent).toBe("2");
    cleanup();
    setup({});
    expect(screen.queryByTestId("filters-badge")).toBeNull();
  });

  it("search keeps every set filter in hidden inputs", () => {
    setup({ status: "paid", mode: "live", region: "UAE", optionLabel: "Module 1", optionScopes: "full,1", q: "ali" });
    const f = searchForm();
    expect((f.querySelector('input[name="q"]') as HTMLInputElement).value).toBe("ali");
    expect(f.getAttribute("action")).toBe(BASE);
    expect(hidden(f, "status")).toBe("paid");
    expect(hidden(f, "mode")).toBe("live");
    expect(hidden(f, "region")).toBe("UAE");
    expect(hidden(f, "optionLabel")).toBe("Module 1");
    expect(hidden(f, "optionScopes")).toBe("full,1");
  });

  it("search carries no hidden inputs when nothing is set", () => {
    setup({});
    expect(searchForm().querySelectorAll('input[type="hidden"]')).toHaveLength(0);
  });

  it("keeps the panel closed until Filters is pressed, then shows the sections", () => {
    setup({});
    expect(screen.queryByText("Registration Filter Criteria")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByText("Registration Filter Criteria")).toBeTruthy();
    for (const t of ["Country", "Delivery mode", "What they bought", "Quick presets"]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    expect(screen.getByText("Live full course")).toBeTruthy();
    expect(screen.getByText("Live + Module 1")).toBeTruthy();
    expect(screen.getByText("All live")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Show people/ })).toBeTruthy();
  });

  it("checks the country chip from filters.region", () => {
    setup({ region: "UAE" });
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const radios = Array.from(document.querySelectorAll('input[type="radio"][name="region"]')) as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(["", "Pakistan", "UAE"]);
    expect(radios.find((r) => r.checked)?.value).toBe("UAE");
    const mode = Array.from(document.querySelectorAll('input[name="mode"]')) as HTMLInputElement[];
    expect(mode.find((r) => r.checked)?.value).toBe("");
  });

  it("Reset keeps only the status and the panel form carries q, status and scopes", () => {
    setup({ status: "paid", q: "ali", mode: "live", optionScopes: "full" });
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByRole("link", { name: "Reset" }).getAttribute("href")).toBe(`${BASE}?status=paid`);
    const form = document.querySelector('form[data-panel-form]') as HTMLFormElement;
    expect(form.getAttribute("action")).toBe(BASE);
    expect(hidden(form, "q")).toBe("ali");
    expect(hidden(form, "status")).toBe("paid");
    expect(hidden(form, "optionScopes")).toBe("full");
  });

  it("closes on Escape", () => {
    setup({});
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Registration Filter Criteria")).toBeNull();
  });

  it("disables empty fields when the panel form is submitted", () => {
    setup({ mode: "live" });
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const form = document.querySelector("form[data-panel-form]") as HTMLFormElement;
    fireEvent.submit(form);
    const region = document.querySelector('input[name="region"][value=""]') as HTMLInputElement;
    const optionLabel = document.querySelector('input[name="optionLabel"][value=""]') as HTMLInputElement;
    const liveMode = document.querySelector('input[name="mode"][value="live"]') as HTMLInputElement;
    expect(region.disabled).toBe(true);
    expect(optionLabel.disabled).toBe(true);
    expect(liveMode.disabled).toBe(false);
  });

  it("renders the tools slot and the scrolling status tabs", () => {
    setup({}, { toolsSlot: <button type="button">Batch tools</button> });
    expect(screen.getByRole("button", { name: "Batch tools" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^All/ }).parentElement?.className).toContain("max-md:overflow-x-auto");
  });

  it("closes the panel when Reset or a quick preset is pressed", () => {
    setup({ mode: "live" });
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByRole("link", { name: "Reset" }));
    expect(screen.queryByText("Registration Filter Criteria")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByText("All live"));
    expect(screen.queryByText("Registration Filter Criteria")).toBeNull();
  });

  it("makes the checked chips follow new filters after a rerender", () => {
    const { rerender } = setup({ region: "UAE", mode: "live" });
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    rerender(<CampaignToolbar basePath={BASE} filters={{}} counts={counts} options={options} />);
    const checked = (n: string) =>
      (Array.from(document.querySelectorAll(`input[type="radio"][name="${n}"]`)) as HTMLInputElement[]).find((r) => r.checked)?.value;
    expect(checked("region")).toBe("");
    expect(checked("mode")).toBe("");
  });

  it("gives the search a fixed width on md and up so the tabs get the rest", () => {
    setup({});
    const cls = searchForm().className.split(/\s+/);
    expect(cls).toContain("md:flex-none");
    expect(cls).toContain("md:w-72");
    expect(cls).toContain("lg:w-80");
    expect(cls).not.toContain("md:flex-1");
  });

  it("does not send an empty q when the search is submitted blank", () => {
    setup({});
    const f = searchForm();
    fireEvent.submit(f);
    expect((f.querySelector('input[name="q"]') as HTMLInputElement).disabled).toBe(true);
    cleanup();
    setup({ q: "ali" });
    const f2 = searchForm();
    fireEvent.submit(f2);
    expect((f2.querySelector('input[name="q"]') as HTMLInputElement).disabled).toBe(false);
  });

  it("wires the Filters button to the panel and returns focus to it on close", () => {
    setup({});
    const btn = screen.getByRole("button", { name: /Filters/ });
    expect(btn.getAttribute("aria-controls")).toBeNull();
    fireEvent.click(btn);
    const panelId = btn.getAttribute("aria-controls")!;
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId)).toBeTruthy();
    expect(document.getElementById(panelId)!.querySelector("form[data-panel-form]")).toBeTruthy();
    // Escape
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(btn);
    // backdrop
    fireEvent.click(btn);
    const backdrop = screen.getByRole("button", { name: "Close filters" });
    expect(backdrop.getAttribute("tabindex")).toBe("-1");
    fireEvent.click(backdrop);
    expect(document.activeElement).toBe(btn);
    // Reset
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole("link", { name: "Reset" }));
    expect(document.activeElement).toBe(btn);
  });

  it("names the phone sheet as a dialog", () => {
    setup({});
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelId)?.textContent).toBe("Registration Filter Criteria");
  });

  it("hides Country and What they bought when there are no options", () => {
    render(<CampaignToolbar basePath={BASE} filters={{}} counts={counts} options={{ regions: [], optionLabels: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.queryByText("Country")).toBeNull();
    expect(screen.queryByText("What they bought")).toBeNull();
    expect(screen.getByText("Delivery mode")).toBeTruthy();
  });

  it("lets a long chip label wrap inside its chip", () => {
    const long = "Live - Full course with every module and the recorded bundle and extras";
    render(<CampaignToolbar basePath={BASE} filters={{}} counts={counts} options={{ regions: ["PK"], optionLabels: [long] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const chip = screen.getByText(long);
    expect(chip.className).toContain("break-words");
    expect(chip.className).toContain("max-w-full");
    expect(chip.parentElement!.className).toContain("max-w-full");
  });
});
