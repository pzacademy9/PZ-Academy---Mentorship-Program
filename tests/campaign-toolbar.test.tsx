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
    expect(screen.getByRole("link", { name: /^All/ }).parentElement?.className).toContain("overflow-x-auto");
  });
});
