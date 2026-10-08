import { render, screen, fireEvent, within } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { CampaignWizard } from "@/components/sales/CampaignWizard";
import type { AudienceRowJson } from "@/lib/crm/campaign-ui";
import type { AgentBudgetJson } from "@/lib/crm/sales-ui";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const row = (id: string, fullName: string, over: Partial<AudienceRowJson> = {}): AudienceRowJson => ({
  id, fullName, phone: "+923001234567", lastOutcome: null, courses: [], ...over,
});

const ROWS: AudienceRowJson[] = [
  row("a", "Ayesha Tariq", { phone: "+923004589211", lastOutcome: "interested", courses: ["Clinical Pharmacy"] }),
  row("b", "Bilal Khan", { phone: "+923217843109", courses: ["Drug Design"] }),
  row("c", "Zainab Fatima", { phone: "+923135590123", lastOutcome: "replied", courses: ["Clinical Pharmacy"] }),
];

const numberBudget = (dailyUsed: number, dailyCap: number): AgentBudgetJson => ({
  number: { id: "n1", label: "DMC number 2", phone_e164: "+923129988112" },
  budget: {
    dailyUsed, dailyCap, hourlyUsed: 0, hourlyCap: 10, hourlyWarning: false, quietHours: false,
    quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null,
  },
});

function budgetValue(budgets: AgentBudgetJson[] | null): SalesBudgetValue {
  return {
    budgets, loadError: false, selectedId: budgets?.[0]?.number.id ?? null, selected: budgets?.[0] ?? null,
    select: vi.fn(), refresh: vi.fn(async () => {}), applyBudget: vi.fn(),
  };
}

function mockApi(rows: AudienceRowJson[], truncated = false) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/sales/campaigns/audience")) return { ok: true, json: async () => ({ rows, truncated }) };
    if (url.startsWith("/api/sales/templates")) return { ok: true, json: async () => ({ templates: [] }) };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderWizard = (budgets: AgentBudgetJson[] | null = [numberBudget(40, 50)]) =>
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={budgetValue(budgets)}>
        <CampaignWizard />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );

// ResponsiveList renders the phone cards and the desktop list together in jsdom; act on the first copy.
const check = (name: string) => fireEvent.click(screen.getAllByLabelText(`Select ${name}`)[0]);
const nextButton = () => screen.getByRole("button", { name: /^Next/ });
const currentStep = () =>
  within(screen.getByRole("navigation", { name: "Campaign steps" }))
    .getAllByRole("listitem")
    .find((li) => li.getAttribute("aria-current") === "step");

beforeEach(() => vi.unstubAllGlobals());

describe("CampaignWizard step 1", () => {
  it("shows the three steps with step 1 current", async () => {
    mockApi(ROWS);
    renderWizard();
    const steps = within(screen.getByRole("navigation", { name: "Campaign steps" })).getAllByRole("listitem");
    expect(steps.map((s) => s.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "1 Choose who", "2 Write message", "3 Check and send",
    ]);
    expect(currentStep()?.textContent).toContain("Choose who");
    await screen.findAllByText("Ayesha Tariq");
  });

  it("announces loading, then lists name and phone, fetching the audience without cache", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { unmount } = renderWizard();
    expect(screen.getByRole("status", { name: /loading/i })).toBeTruthy();
    unmount();

    const fetchMock = mockApi(ROWS);
    renderWizard();
    expect((await screen.findAllByText("Ayesha Tariq")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("+923004589211").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith("/api/sales/campaigns/audience", { cache: "no-store" });
  });

  it("search narrows the rows", async () => {
    mockApi(ROWS);
    renderWizard();
    await screen.findAllByText("Ayesha Tariq");
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "bilal" } });
    expect(screen.queryAllByText("Ayesha Tariq")).toHaveLength(0);
    expect(screen.getAllByText("Bilal Khan").length).toBeGreaterThan(0);
  });

  it("course and outcome selects narrow rows, with options from the data", async () => {
    mockApi(ROWS);
    renderWizard();
    await screen.findAllByText("Ayesha Tariq");
    const course = screen.getByLabelText("Course") as HTMLSelectElement;
    expect(Array.from(course.options).map((o) => o.textContent)).toEqual(["All courses", "Clinical Pharmacy", "Drug Design"]);
    fireEvent.change(course, { target: { value: "Clinical Pharmacy" } });
    expect(screen.queryAllByText("Bilal Khan")).toHaveLength(0);
    expect(screen.getAllByText("Zainab Fatima").length).toBeGreaterThan(0);

    const outcome = screen.getByLabelText("Last outcome") as HTMLSelectElement;
    expect(Array.from(outcome.options).map((o) => o.textContent)).toEqual(["Anyone", "New", "Interested", "Replied"]);
    fireEvent.change(outcome, { target: { value: "replied" } });
    expect(screen.queryAllByText("Ayesha Tariq")).toHaveLength(0);
    expect(screen.getAllByText("Zainab Fatima").length).toBeGreaterThan(0);
  });

  it("checking rows counts them; Select all N shown respects filters; Clear empties", async () => {
    mockApi(ROWS);
    renderWizard();
    await screen.findAllByText("Ayesha Tariq");
    expect(screen.getByText("0 selected")).toBeTruthy();
    check("Ayesha Tariq");
    expect(screen.getByText("1 selected")).toBeTruthy();
    check("Ayesha Tariq");
    expect(screen.getByText("0 selected")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "Clinical Pharmacy" } });
    fireEvent.click(screen.getByRole("button", { name: "Select all 2 shown" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "" } });
    expect((screen.getAllByLabelText("Select Bilal Khan")[0] as HTMLInputElement).checked).toBe(false);
    expect((screen.getAllByLabelText("Select Ayesha Tariq")[0] as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("0 selected")).toBeTruthy();
  });

  it("budget line uses the selected number's remaining daily chats", async () => {
    mockApi(ROWS);
    renderWizard([numberBudget(40, 50)]);
    await screen.findAllByText("Ayesha Tariq");
    expect(screen.getByText("You can send 10 more today; the rest wait for tomorrow")).toBeTruthy();
  });

  it("hides the budget line while no budget is loaded", async () => {
    mockApi(ROWS);
    renderWizard(null);
    await screen.findAllByText("Ayesha Tariq");
    expect(screen.queryByText(/more today; the rest wait for tomorrow/)).toBeNull();
    expect(screen.queryByText(/No WhatsApp number yet/)).toBeNull();
  });

  it("with no number explains what to do", async () => {
    mockApi(ROWS);
    renderWizard([]);
    await screen.findAllByText("Ayesha Tariq");
    expect(screen.getByText("No WhatsApp number yet. Ask your admin to give you one before you can start.")).toBeTruthy();
    expect(screen.queryByText(/more today; the rest wait for tomorrow/)).toBeNull();
  });

  it("Next is disabled at 0 selected, enabled after picking, and moves to step 2", async () => {
    mockApi(ROWS);
    renderWizard();
    await screen.findAllByText("Ayesha Tariq");
    expect((nextButton() as HTMLButtonElement).disabled).toBe(true);
    check("Bilal Khan");
    expect((nextButton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(nextButton());
    expect(currentStep()?.textContent).toContain("Write message");
  });

  it("Next is disabled above 2000 selected", async () => {
    const many = Array.from({ length: 2001 }, (_, i) => row(`r${i}`, `Person ${i}`, { phone: `+92300${String(i).padStart(7, "0")}` }));
    mockApi(many);
    renderWizard();
    await screen.findAllByText("Person 0");
    fireEvent.click(screen.getByRole("button", { name: "Select all 2001 shown" }));
    expect(screen.getByText("2001 selected")).toBeTruthy();
    expect(screen.getByText("Pick 2000 people or fewer.")).toBeTruthy();
    expect((nextButton() as HTMLButtonElement).disabled).toBe(true);
  }, 30_000);

  it("an empty audience shows the empty state with an add-lead link", async () => {
    mockApi([]);
    renderWizard();
    expect(await screen.findByText("You don't own any contacts yet. Ask your admin to assign a list, or add a lead.")).toBeTruthy();
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/dashboard/sales/add-lead");
    expect(links.length).toBeGreaterThan(0);
  });

  it("a truncated audience says so", async () => {
    mockApi(ROWS, true);
    renderWizard();
    expect(await screen.findByText("Showing your 3000 most recent contacts.")).toBeTruthy();
  });
});
