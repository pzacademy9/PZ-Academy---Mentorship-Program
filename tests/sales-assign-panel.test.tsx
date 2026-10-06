import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { toast } from "sonner";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { AssignListsPanel } from "@/components/admin/sales/AssignListsPanel";
import { ASSIGN_CONTACTS_STORAGE_KEY } from "@/lib/crm/assignment";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const BATCH_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";
const cohorts = [{ id: BATCH_ID, sheetName: "PPC", tabName: "batch 2", purchaseCount: 239 }];
const agents = [{ id: AGENT_ID, fullName: "Ayesha" }];

const previewCounts = { toAssign: 212, alreadyYours: 0, skippedOwned: 18, skippedDnc: 9, reassigning: 0, total: 239 };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(toast.success).mockClear();
  refresh.mockClear();
  sessionStorage.clear();
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/admin/sales/assignments/preview") {
      return { ok: true, json: async () => ({ preview: { agentName: "Ayesha", counts: previewCounts } }) };
    }
    if (url === "/api/admin/sales/assignments/commit") {
      return { ok: true, json: async () => ({ result: { assigned: 212, reassigned: 0 } }) };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

const renderPanel = (counts: { agentId: string; fullName: string; contactCount: number }[] = []) =>
  render(
    <ConfirmProvider>
      <AssignListsPanel cohorts={cohorts} agents={agents} counts={counts} />
    </ConfirmProvider>,
  );

const previewBodies = () =>
  fetchMock.mock.calls
    .filter(([u]) => u === "/api/admin/sales/assignments/preview")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));

function chooseCohortAndAgent() {
  fireEvent.change(screen.getByLabelText("Cohort"), { target: { value: BATCH_ID } });
  fireEvent.change(screen.getByLabelText("Sales agent"), { target: { value: AGENT_ID } });
}

describe("AssignListsPanel", () => {
  it("shows the preview counts after choosing a cohort and an agent", async () => {
    renderPanel();
    chooseCohortAndAgent();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("212 will be assigned to Ayesha")).toBeTruthy();
    expect(screen.getByText("18 already owned by other agents will be skipped")).toBeTruthy();
    expect(screen.getByText("9 do-not-contact will be skipped")).toBeTruthy();
    expect(screen.queryByText(/already belong to Ayesha/)).toBeNull();
    expect(previewBodies()[0]).toEqual({
      source: { kind: "cohort", batchId: BATCH_ID },
      agentId: AGENT_ID,
      includeOwned: false,
    });
  });

  it("override checkbox is off by default and sends includeOwned when ticked", async () => {
    renderPanel();
    chooseCohortAndAgent();
    const box = screen.getByLabelText("Also reassign contacts that already belong to another agent") as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("212 will be assigned to Ayesha");
    expect(previewBodies()[0].includeOwned).toBe(false);

    fireEvent.click(box);
    // Changing the override clears the old preview.
    expect(screen.queryByText("212 will be assigned to Ayesha")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(previewBodies()).toHaveLength(2));
    expect(previewBodies()[1].includeOwned).toBe(true);
  });

  it("commit button stays disabled until a preview exists, and the result toast reports counts", async () => {
    renderPanel();
    chooseCohortAndAgent();
    expect(screen.queryByRole("button", { name: /^Assign \d+ contacts$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const commit = (await screen.findByRole("button", { name: "Assign 212 contacts" })) as HTMLButtonElement;
    expect(commit.disabled).toBe(false);
    fireEvent.click(commit);
    fireEvent.click(await screen.findByRole("button", { name: "Assign" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Assigned 212 contacts to Ayesha."));
    const commitCall = fetchMock.mock.calls.find(([u]) => u === "/api/admin/sales/assignments/commit");
    expect(commitCall && JSON.parse((commitCall[1] as RequestInit).body as string)).toEqual({
      source: { kind: "cohort", batchId: BATCH_ID },
      agentId: AGENT_ID,
      includeOwned: false,
    });
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("212 will be assigned to Ayesha")).toBeNull());
  });

  it("disables the commit button when nothing would be assigned", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ preview: { agentName: "Ayesha", counts: { ...previewCounts, toAssign: 0, alreadyYours: 212 } } }),
    }));
    renderPanel();
    chooseCohortAndAgent();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("212 already belong to Ayesha")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Assign 0 contacts" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("hand-picked mode reads ids from sessionStorage and offers them as the source", async () => {
    sessionStorage.setItem(ASSIGN_CONTACTS_STORAGE_KEY, JSON.stringify(["id1", "id2"]));
    renderPanel();
    expect(await screen.findByText(/2 hand-picked contacts/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Sales agent"), { target: { value: AGENT_ID } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(previewBodies()).toHaveLength(1));
    expect(previewBodies()[0].source).toEqual({ kind: "contacts", contactIds: ["id1", "id2"] });

    fireEvent.click(await screen.findByRole("button", { name: "Assign 212 contacts" }));
    fireEvent.click(await screen.findByRole("button", { name: "Assign" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(sessionStorage.getItem(ASSIGN_CONTACTS_STORAGE_KEY)).toBeNull();
  });

  it("disables the hand-picked source when there is no selection", () => {
    renderPanel();
    expect((screen.getByRole("button", { name: "Hand-picked contacts (0)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists current assignment counts", () => {
    renderPanel([{ agentId: AGENT_ID, fullName: "Ayesha", contactCount: 40 }]);
    expect(screen.getByText("Current assignments")).toBeTruthy();
    expect(screen.getByText("40 contacts")).toBeTruthy();
  });
});
