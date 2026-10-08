import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toast } from "sonner";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { CampaignWizard } from "@/components/sales/CampaignWizard";
import type { AudienceRowJson } from "@/lib/crm/campaign-ui";
import { DEFAULT_MESSAGE, MAX_MESSAGE_LENGTH, type AgentBudgetJson, type TemplateJson } from "@/lib/crm/sales-ui";
import { VARIETY_MESSAGE } from "@/lib/crm/campaign-rules";
import { renderWhatsAppMessage } from "@/lib/crm/whatsapp-link";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const row = (id: string, fullName: string, over: Partial<AudienceRowJson> = {}): AudienceRowJson => ({
  id, fullName, phone: "+923001234567", lastOutcome: null, courses: [], ...over,
});

const ROWS: AudienceRowJson[] = [
  row("a", "Ayesha Tariq", { phone: "+923004589211", lastOutcome: "interested", courses: ["Clinical Pharmacy"] }),
  row("b", "Bilal Khan", { phone: "+923217843109", courses: ["Drug Design"] }),
  row("c", "Zainab Fatima", { phone: "+923135590123", lastOutcome: "replied", courses: ["Clinical Pharmacy"] }),
];

const numberBudget = (dailyUsed: number, dailyCap: number, id = "n1", label = "DMC number 2"): AgentBudgetJson => ({
  number: { id, label, phone_e164: "+923129988112" },
  budget: {
    dailyUsed, dailyCap, hourlyUsed: 0, hourlyCap: 10, hourlyWarning: false, quietHours: false,
    quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null,
  },
});

function budgetValue(budgets: AgentBudgetJson[] | null, over: Partial<SalesBudgetValue> = {}): SalesBudgetValue {
  return {
    budgets, loadError: false, selectedId: budgets?.[0]?.number.id ?? null, selected: budgets?.[0] ?? null,
    select: vi.fn(), refresh: vi.fn(async () => {}), applyBudget: vi.fn(), ...over,
  };
}

type PostReply = { status: number; body: unknown } | "hang";
function mockApi(
  rows: AudienceRowJson[],
  truncated = false,
  opts: { templates?: TemplateJson[]; post?: PostReply } = {},
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/sales/campaigns/audience")) return { ok: true, json: async () => ({ rows, truncated }) };
    if (url.startsWith("/api/sales/templates")) return { ok: true, json: async () => ({ templates: opts.templates ?? [] }) };
    if (url === "/api/sales/campaigns" && init?.method === "POST") {
      const post = opts.post ?? { status: 201, body: { campaignId: "camp-1", recipientCount: 1, droppedText: [] } };
      if (post === "hang") return new Promise(() => {});
      return { ok: post.status >= 200 && post.status < 300, status: post.status, json: async () => post.body };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderWizard = (budgets: AgentBudgetJson[] | null = [numberBudget(40, 50)], over: Partial<SalesBudgetValue> = {}) =>
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={budgetValue(budgets, over)}>
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

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

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

  it("Next stays enabled at exactly 2000 selected", async () => {
    const many = Array.from({ length: 2000 }, (_, i) => row(`r${i}`, `Person ${i}`, { phone: `+92300${String(i).padStart(7, "0")}` }));
    mockApi(many);
    renderWizard();
    await screen.findAllByText("Person 0");
    fireEvent.click(screen.getByRole("button", { name: "Select all 2000 shown" }));
    expect(screen.getByText("2000 selected")).toBeTruthy();
    expect(screen.queryByText("Pick 2000 people or fewer.")).toBeNull();
    expect((nextButton() as HTMLButtonElement).disabled).toBe(false);
  }, 30_000);

  it("says how many picked people the filters are hiding", async () => {
    mockApi(ROWS);
    renderWizard();
    await screen.findAllByText("Ayesha Tariq");
    check("Bilal Khan");
    expect(screen.queryByText(/hidden by filters/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "Clinical Pharmacy" } });
    expect(screen.getByText("1 hidden by filters")).toBeTruthy();
  });

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

const FOUR: AudienceRowJson[] = [...ROWS, row("d", "Hamza Ali", { phone: "+923331112223" })];
const TEMPLATES: TemplateJson[] = [
  { id: "t1", name: "Course reminder", body: "Salam {{first_name}}, the new batch starts Monday." },
  { id: "t2", name: "Fee update", body: "Hi {{full_name}}, fees are now lower." },
];

/** Picks the named people (in this order) on step 1 and moves to step 2. */
async function toStep2(names: string[]) {
  await screen.findAllByText(names[0]);
  for (const n of names) check(n);
  fireEvent.click(nextButton());
}
async function toStep3(names: string[]) {
  await toStep2(names);
  fireEvent.click(nextButton());
}
const messageBox = () => screen.getByLabelText("Message") as HTMLTextAreaElement;
const startButton = () => screen.getByRole("button", { name: /Start sending/ }) as HTMLButtonElement;
const campaignPosts = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([u, i]) => u === "/api/sales/campaigns" && i?.method === "POST");

describe("CampaignWizard step 2", () => {
  it("starts with the default message", async () => {
    mockApi(ROWS);
    renderWizard();
    await toStep2(["Bilal Khan"]);
    expect(currentStep()?.textContent).toContain("Write message");
    expect(messageBox().value).toBe(DEFAULT_MESSAGE);
  });

  it("the saved-message picker lists templates and fills the box", async () => {
    const fetchMock = mockApi(ROWS, false, { templates: TEMPLATES });
    renderWizard();
    await toStep2(["Bilal Khan"]);
    const picker = screen.getByLabelText("Saved message") as HTMLSelectElement;
    await waitFor(() => expect(Array.from(picker.options).map((o) => o.textContent)).toContain("Course reminder"));
    expect(Array.from(picker.options).map((o) => o.textContent)).toContain("Fee update");
    fireEvent.change(picker, { target: { value: "t2" } });
    expect(messageBox().value).toBe("Hi {{full_name}}, fees are now lower.");
    expect(fetchMock).toHaveBeenCalledWith("/api/sales/templates", { cache: "no-store" });
  });

  it("tag chips add {{first_name}} and {{full_name}} at the end", async () => {
    mockApi(ROWS);
    renderWizard();
    await toStep2(["Bilal Khan"]);
    fireEvent.change(messageBox(), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "First name" }));
    expect(messageBox().value).toBe("Hello {{first_name}}");
    fireEvent.click(screen.getByRole("button", { name: "Full name" }));
    expect(messageBox().value).toBe("Hello {{first_name}} {{full_name}}");
  });

  it("the preview shows what the first picked person will see", async () => {
    mockApi(ROWS);
    renderWizard();
    await toStep2(["Bilal Khan", "Ayesha Tariq"]);
    const preview = screen.getByRole("region", { name: "What they will see" });
    expect(preview.textContent).toContain(renderWhatsAppMessage(DEFAULT_MESSAGE, "Bilal Khan"));
    fireEvent.change(messageBox(), { target: { value: "Dear {{full_name}}" } });
    expect(preview.textContent).toContain("Dear Bilal Khan");
  });

  it("shows the calm note, and the wizard copy never promises safety", async () => {
    mockApi(ROWS);
    renderWizard();
    await toStep2(["Bilal Khan"]);
    expect(screen.getByText("Messages go out one at a time from your own WhatsApp, with pauses.")).toBeTruthy();
    const src = readFileSync(join(process.cwd(), "src", "components", "sales", "CampaignWizard.tsx"), "utf8");
    expect(src).not.toMatch(/\bsafe\b|guarantee/i);
  });

  it("a message without a name tag is refused for more than 3 people", async () => {
    mockApi(FOUR);
    renderWizard();
    await toStep2(["Ayesha Tariq", "Bilal Khan", "Zainab Fatima", "Hamza Ali"]);
    fireEvent.change(messageBox(), { target: { value: "Hello, the new batch starts Monday." } });
    expect(screen.getByText(VARIETY_MESSAGE)).toBeTruthy();
    expect((nextButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(messageBox(), { target: { value: "Hello {{first_name}}, the new batch starts Monday." } });
    expect(screen.queryByText(VARIETY_MESSAGE)).toBeNull();
    expect((nextButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("a message without a name tag is fine for 3 people", async () => {
    mockApi(ROWS);
    renderWizard();
    await toStep2(["Ayesha Tariq", "Bilal Khan", "Zainab Fatima"]);
    fireEvent.change(messageBox(), { target: { value: "Hello, the new batch starts Monday." } });
    expect(screen.queryByText(VARIETY_MESSAGE)).toBeNull();
    expect((nextButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("an empty message disables Next", async () => {
    mockApi(ROWS);
    renderWizard();
    await toStep2(["Bilal Khan"]);
    fireEvent.change(messageBox(), { target: { value: "   " } });
    expect((nextButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("the box is capped at the longest message we can send", async () => {
    mockApi(ROWS);
    renderWizard();
    await toStep2(["Bilal Khan"]);
    expect(messageBox().maxLength).toBe(MAX_MESSAGE_LENGTH);
  });

  it("Back returns to step 1 keeping the selection", async () => {
    mockApi(ROWS);
    renderWizard();
    await toStep2(["Bilal Khan", "Ayesha Tariq"]);
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(currentStep()?.textContent).toContain("Choose who");
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect((screen.getAllByLabelText("Select Bilal Khan")[0] as HTMLInputElement).checked).toBe(true);
  });
});

describe("CampaignWizard step 3", () => {
  it("summarises people, today and tomorrow, number, and the follow-up choice", async () => {
    mockApi(ROWS);
    renderWizard([numberBudget(49, 60)]);
    await toStep3(["Ayesha Tariq", "Bilal Khan", "Zainab Fatima"]);
    expect(currentStep()?.textContent).toContain("Check and send");
    expect(screen.getByText("3 people")).toBeTruthy();
    expect(screen.getByText("Today: 3")).toBeTruthy();
    expect(screen.getByText("Tomorrow: 0")).toBeTruthy();
    expect(screen.getByText("DMC number 2")).toBeTruthy();
    expect(screen.queryByLabelText("WhatsApp number")).toBeNull();
    const group = screen.getByRole("group", { name: "Bring them back in" });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["8 hours", "1 day", "2 days", "3 days"]);
    expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false"]);
    fireEvent.click(chips[3]);
    expect(chips[3].getAttribute("aria-pressed")).toBe("true");
    expect(chips[1].getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(/is warming up/)).toBeNull();
    expect(startButton().disabled).toBe(false);
  });

  it("splits today and tomorrow from what is left today", async () => {
    mockApi(ROWS);
    renderWizard([numberBudget(59, 60)]);
    await toStep3(["Ayesha Tariq", "Bilal Khan", "Zainab Fatima"]);
    expect(screen.getByText("Today: 1")).toBeTruthy();
    expect(screen.getByText("Tomorrow: 2")).toBeTruthy();
  });

  it("several numbers show a picker that switches the number", async () => {
    mockApi(ROWS);
    const select = vi.fn();
    renderWizard([numberBudget(0, 60), numberBudget(0, 60, "n2", "DMC number 3")], { select });
    await toStep3(["Bilal Khan"]);
    const picker = screen.getByLabelText("WhatsApp number") as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.textContent)).toEqual(["DMC number 2", "DMC number 3"]);
    fireEvent.change(picker, { target: { value: "n2" } });
    expect(select).toHaveBeenCalledWith("n2");
  });

  it("a warming-up number says so", async () => {
    mockApi(ROWS);
    renderWizard([numberBudget(0, 30)]);
    await toStep3(["Bilal Khan"]);
    expect(screen.getByText("This number is warming up: 30 new chats a day.")).toBeTruthy();
  });

  it("Start sending is off with no number", async () => {
    mockApi(ROWS);
    renderWizard([]);
    await toStep3(["Bilal Khan"]);
    expect(screen.getByText("No WhatsApp number yet. Ask your admin to give you one before you can start.")).toBeTruthy();
    expect(startButton().disabled).toBe(true);
  });

  it("Start sending is off while limits are loading", async () => {
    mockApi(ROWS);
    renderWizard(null);
    await toStep3(["Bilal Khan"]);
    expect(screen.getByRole("status", { name: /Checking your limits/ })).toBeTruthy();
    expect(startButton().disabled).toBe(true);
  });

  it("posts exactly the draft, toasts skipped people and opens the campaign", async () => {
    const fetchMock = mockApi(ROWS, false, {
      post: { status: 201, body: { campaignId: "camp-9", recipientCount: 1, droppedText: ["1 skipped: no phone number"] } },
    });
    renderWizard([numberBudget(0, 60)]);
    await toStep2(["Bilal Khan", "Ayesha Tariq"]);
    fireEvent.change(messageBox(), { target: { value: "Hi {{first_name}}" } });
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole("button", { name: "2 days" }));
    fireEvent.click(startButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/sales/campaigns/camp-9"));
    const posts = campaignPosts(fetchMock);
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]!.body))).toEqual({
      messageTemplate: "Hi {{first_name}}", contactIds: ["b", "a"], numberId: "n1", followupInHours: 48,
    });
    expect(toast.warning).toHaveBeenCalledWith("1 skipped: no phone number");
  });

  it("a refused start shows the server message and stays on step 3", async () => {
    mockApi(ROWS, false, { post: { status: 400, body: { error: "None of the selected people can be messaged." } } });
    renderWizard([numberBudget(0, 60)]);
    await toStep3(["Bilal Khan"]);
    fireEvent.click(startButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("None of the selected people can be messaged."));
    expect(push).not.toHaveBeenCalled();
    expect(currentStep()?.textContent).toContain("Check and send");
    await waitFor(() => expect(startButton().disabled).toBe(false));
  });

  it("a double click starts once and the button waits while pending", async () => {
    const fetchMock = mockApi(ROWS, false, { post: "hang" });
    renderWizard([numberBudget(0, 60)]);
    await toStep3(["Bilal Khan"]);
    const btn = startButton();
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(campaignPosts(fetchMock)).toHaveLength(1);
    await waitFor(() => expect(startButton().disabled).toBe(true));
  });

  it("Back returns to step 2 keeping the message", async () => {
    mockApi(ROWS);
    renderWizard();
    await toStep2(["Bilal Khan"]);
    fireEvent.change(messageBox(), { target: { value: "Hi {{first_name}}!" } });
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(messageBox().value).toBe("Hi {{first_name}}!");
  });
});
