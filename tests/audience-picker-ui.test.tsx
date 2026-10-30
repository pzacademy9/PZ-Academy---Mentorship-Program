import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const h = vi.hoisted(() => ({
  admin: true,
  getSessionById: vi.fn(),
  setSessionAudience: vi.fn(),
  previewRecipients: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (h.admin ? { ok: true, user: { id: "admin-1" } } : { ok: false, response: {} }),
}));
vi.mock("@/lib/data/attendance", () => ({
  getSessionById: h.getSessionById,
  setSessionAudience: h.setSessionAudience,
}));
vi.mock("@/lib/data/session-emails", () => ({ createSessionSend: vi.fn(), listSessionSendState: vi.fn() }));
vi.mock("@/lib/data/participant-sends", () => ({ runEmailSend: vi.fn() }));
vi.mock("@/lib/data/batch-feedback", () => ({ getBatchProgramId: vi.fn() }));
vi.mock("@/lib/data/feedback-share", () => ({ generateFeedbackShareToken: vi.fn() }));
vi.mock("@/lib/data/audience-preview", () => ({ previewRecipients: h.previewRecipients }));

import * as actions from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";
import { AudiencePicker } from "@/components/admin/classes/AudiencePicker";
import { RecipientPreviewLists } from "@/components/admin/shared/RecipientPreviewLists";
import { EditClassDialog } from "@/components/admin/classes/EditClassDialog";
import type { SessionRow } from "@/lib/data/attendance";

const PAGE = "00000000-0000-4000-8000-000000000001";
const SESS = "00000000-0000-4000-8000-000000000002";

const PREVIEW = {
  receiving: [{ name: "Ayesha", email: "a@x.test", optionLabel: "Live Full Course" }],
  notReceiving: [
    { name: "Bilal", email: "b@x.test", optionLabel: "Recorded Full Course", reason: "recorded" as const },
    { name: "Cara", email: "", optionLabel: "Live", reason: "no_email" as const },
  ],
};

beforeEach(() => {
  h.admin = true;
  for (const v of Object.values(h)) if (typeof v === "function") v.mockReset();
  h.getSessionById.mockResolvedValue({ id: SESS, page_id: PAGE });
  h.previewRecipients.mockResolvedValue(PREVIEW);
});

describe("AudiencePicker", () => {
  function renderPicker(saved: unknown = null) {
    return render(<AudiencePicker pageId={PAGE} sessionId={SESS} saved={saved} />);
  }

  it("shows the three choices with none selected when the class has no audience", () => {
    renderPicker();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Live full course + Module N", "All live students", "Everyone with an ID"]);
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    expect((screen.getByRole("button", { name: "Save who gets this" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts from the saved audience", () => {
    renderPicker({ mode: "any", modules: "all" });
    expect(screen.getByRole("radio", { name: "Everyone with an ID" }).getAttribute("aria-checked")).toBe("true");
  });

  it("choosing a preset loads both lists with counts, collapsed", async () => {
    renderPicker();
    fireEvent.click(screen.getByRole("radio", { name: "All live students" }));
    await waitFor(() => expect(screen.getByText("Will get this email (1)")).toBeTruthy());
    expect(screen.getByText("Will not get this email (2)")).toBeTruthy();
    expect(h.previewRecipients).toHaveBeenCalledWith({ pageId: PAGE, audience: { mode: "live", modules: "all" } });
  });

  it("Save calls the save action with the chosen audience", async () => {
    renderPicker();
    fireEvent.click(screen.getByRole("radio", { name: "Everyone with an ID" }));
    fireEvent.click(screen.getByRole("button", { name: "Save who gets this" }));
    await waitFor(() => expect(h.setSessionAudience).toHaveBeenCalledWith(SESS, { mode: "any", modules: "all" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Saved/));
  });

  it("the module choice cannot be saved until a module from 1 to 12 is entered", async () => {
    renderPicker();
    fireEvent.click(screen.getByRole("radio", { name: "Live full course + Module N" }));
    const saveBtn = screen.getByRole("button", { name: "Save who gets this" }) as HTMLButtonElement;
    const field = screen.getByLabelText(/Module number/) as HTMLInputElement;
    expect(field.value).toBe("");
    expect(saveBtn.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "13" } });
    expect(saveBtn.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "0" } });
    expect(saveBtn.disabled).toBe(true);
    expect(h.previewRecipients).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "3" } });
    expect(saveBtn.disabled).toBe(false);
    await waitFor(() => expect(h.previewRecipients).toHaveBeenCalledWith({ pageId: PAGE, audience: { mode: "live", modules: [3] } }));
    fireEvent.click(saveBtn);
    await waitFor(() => expect(h.setSessionAudience).toHaveBeenCalledWith(SESS, { mode: "live", modules: [3] }));
  });
});

describe("RecipientPreviewLists", () => {
  it("shows a plain reason for each excluded person", () => {
    const { container } = render(
      <RecipientPreviewLists preview={PREVIEW} receivingTitle="Will get" notReceivingTitle="Will not get" />,
    );
    expect(screen.getByText("Will get (1)")).toBeTruthy();
    expect(screen.getByText("Will not get (2)")).toBeTruthy();
    expect(screen.getByText("Recorded student")).toBeTruthy();
    expect(screen.getByText("No email")).toBeTruthy();
    expect(screen.getByText("b@x.test")).toBeTruthy();
    expect(container.querySelectorAll("details[open]").length).toBe(0);
  });

  it("has wording for every reason", () => {
    const reasons = ["no_id", "no_email", "unsubscribed", "recorded", "wrong_module", "unrecognised"] as const;
    render(
      <RecipientPreviewLists
        preview={{ receiving: [], notReceiving: reasons.map((reason) => ({ name: reason, email: "", optionLabel: "", reason })) }}
        receivingTitle="a" notReceivingTitle="b"
      />,
    );
    for (const t of ["No ID yet", "No email", "Unsubscribed", "Recorded student", "Other module", "Option not recognised"]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
  });
});

describe("EditClassDialog email switch", () => {
  const session = (over: Partial<SessionRow> = {}) =>
    ({
      id: SESS, page_id: PAGE, number: 1, title: "Intro", speaker: "", starts_at: "2026-11-10T14:00:00.000Z",
      ends_at: "2026-11-10T16:00:00.000Z", zoom_url: "", kahoot_url: "", include_kahoot: false,
      include_attendance_link: true, email_enabled: true, email_lead_minutes: 60, audience: null, ...over,
    }) as unknown as SessionRow;

  it("is disabled with a hint while the class has no audience", () => {
    render(<EditClassDialog pageId={PAGE} session={session()} nextNumber={1} onClose={vi.fn()} />);
    const sw = screen.getByLabelText("Send a reminder email") as HTMLInputElement;
    expect(sw.disabled).toBe(true);
    expect(sw.checked).toBe(false);
    expect(screen.getByText("Choose who gets this email first")).toBeTruthy();
  });

  it("is also disabled for a brand-new class", () => {
    render(<EditClassDialog pageId={PAGE} nextNumber={1} onClose={vi.fn()} />);
    expect((screen.getByLabelText("Send a reminder email") as HTMLInputElement).disabled).toBe(true);
  });

  it("can be used once an audience is saved", () => {
    render(<EditClassDialog pageId={PAGE} session={session({ audience: { mode: "live", modules: "all" } } as never)} nextNumber={1} onClose={vi.fn()} />);
    const sw = screen.getByLabelText("Send a reminder email") as HTMLInputElement;
    expect(sw.disabled).toBe(false);
    expect(sw.checked).toBe(true);
    expect(screen.queryByText("Choose who gets this email first")).toBeNull();
  });
});

describe("class audience actions", () => {
  const OK = { mode: "live" as const, modules: [2] };

  it("refuse a non-admin and write nothing", async () => {
    h.admin = false;
    const res = await actions.saveClassAudience(PAGE, SESS, OK);
    expect(res.ok).toBe(false);
    await expect(actions.previewClassAudience(PAGE, SESS, OK)).rejects.toThrow();
    expect(h.setSessionAudience).not.toHaveBeenCalled();
    expect(h.previewRecipients).not.toHaveBeenCalled();
  });

  it("save stores a valid audience", async () => {
    expect(await actions.saveClassAudience(PAGE, SESS, OK)).toEqual({ ok: true });
    expect(h.setSessionAudience).toHaveBeenCalledWith(SESS, OK);
  });

  it("reject a malformed audience, a module outside 1 to 12, or a class from another batch", async () => {
    for (const bad of [{ mode: "x", modules: "all" }, { mode: "live", modules: [13] }, { mode: "live", modules: [0] }, { mode: "live", modules: [1.5] }, { mode: "live", modules: [] }, null]) {
      const res = await actions.saveClassAudience(PAGE, SESS, bad as never);
      expect(res.ok).toBe(false);
    }
    h.getSessionById.mockResolvedValue({ id: SESS, page_id: "00000000-0000-4000-8000-0000000000ff" });
    expect((await actions.saveClassAudience(PAGE, SESS, OK)).ok).toBe(false);
    expect(h.setSessionAudience).not.toHaveBeenCalled();
  });

  it("preview returns the recipients for a valid audience", async () => {
    expect(await actions.previewClassAudience(PAGE, SESS, OK)).toEqual(PREVIEW);
    expect(h.previewRecipients).toHaveBeenCalledWith({ pageId: PAGE, audience: OK });
  });
});
