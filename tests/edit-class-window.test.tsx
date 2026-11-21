import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  addSession: vi.fn(),
  saveSession: vi.fn(),
  createMissing: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: h.success, error: h.error, message: vi.fn() } }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({
  addSession: h.addSession,
  saveSession: h.saveSession,
}));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions", () => ({
  createMissingFeedbackAction: h.createMissing,
}));

import { EditClassDialog } from "@/components/admin/classes/EditClassDialog";
import type { SessionRow } from "@/lib/data/attendance";

const session = (over: Record<string, unknown> = {}) =>
  ({
    id: "s1", page_id: "p", number: 1, title: "Intro", speaker: "Dr A",
    starts_at: "2026-11-10T14:00:00.000Z", ends_at: "2026-11-10T16:00:00.000Z",
    zoom_url: "https://zoom.us/j/1", kahoot_url: "", include_kahoot: false, include_attendance_link: true,
    email_enabled: true, email_lead_minutes: 60, public_code: "c", window_override: "auto",
    custom_time: false, custom_zoom: false, audience: null, ...over,
  }) as unknown as SessionRow;

function open(s: SessionRow = session()) {
  return render(<EditClassDialog pageId="p" session={s} nextNumber={1} batchWindow={{ open: 20, close: 25 }} onClose={vi.fn()} />);
}
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
const lastForm = () => h.saveSession.mock.calls[h.saveSession.mock.calls.length - 1][1];

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.saveSession.mockResolvedValue({ ok: true, message: "Class saved" });
});

describe("Edit class: check-in window", () => {
  it("starts on Same as the batch, hides the number fields and sends null for both", async () => {
    open();
    expect(screen.queryByLabelText("Opens (minutes before)")).toBeNull();
    save();
    await waitFor(() => expect(h.saveSession).toHaveBeenCalled());
    expect(lastForm()).toMatchObject({ checkinOpenMinutes: null, checkinCloseMinutes: null });
  });

  it("prefills own numbers from the class and shows them", () => {
    open(session({ checkin_open_minutes: 30, checkin_close_minutes: 10 }));
    expect((screen.getByLabelText("Opens (minutes before)") as HTMLInputElement).value).toBe("30");
    expect((screen.getByLabelText("Closes (minutes after)") as HTMLInputElement).value).toBe("10");
  });

  it("prefills from the batch default when choosing Set for this class", () => {
    open();
    fireEvent.click(screen.getByLabelText("Set for this class"));
    expect((screen.getByLabelText("Opens (minutes before)") as HTMLInputElement).value).toBe("20");
    expect((screen.getByLabelText("Closes (minutes after)") as HTMLInputElement).value).toBe("25");
  });

  it("sends 0 and 0 when those are typed", async () => {
    open();
    fireEvent.click(screen.getByLabelText("Set for this class"));
    fireEvent.change(screen.getByLabelText("Opens (minutes before)"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Closes (minutes after)"), { target: { value: "0" } });
    save();
    await waitFor(() => expect(h.saveSession).toHaveBeenCalled());
    expect(lastForm()).toMatchObject({ checkinOpenMinutes: 0, checkinCloseMinutes: 0 });
  });

  it("shows an error for 200 and does not save", async () => {
    open();
    fireEvent.click(screen.getByLabelText("Set for this class"));
    fireEvent.change(screen.getByLabelText("Opens (minutes before)"), { target: { value: "200" } });
    save();
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Check-in minutes must be a whole number from 0 to 180"));
    expect(h.saveSession).not.toHaveBeenCalled();
  });
});
