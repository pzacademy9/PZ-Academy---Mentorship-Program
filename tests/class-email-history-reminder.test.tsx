import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({
  loadClassEmailHistory: vi.fn(async () => ({ ok: true, rounds: [] })),
}));

import { ClassEmailHistory } from "@/components/admin/classes/ClassEmailHistory";

async function open(note?: string | null) {
  const { container } = render(<ClassEmailHistory pageId="p" sessionId="s" kinds={["reminder", "update"]} refreshKey="" reminderNote={note} />);
  const details = container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

describe("ClassEmailHistory empty box", () => {
  it("shows the reminder note when no rounds and a note is given", async () => {
    await open("Reminder set for Sat 21 Nov, 6:45 pm PKT. Nothing sent yet.");
    await waitFor(() => expect(screen.getByText("Reminder set for Sat 21 Nov, 6:45 pm PKT. Nothing sent yet.")).toBeTruthy());
    expect(screen.queryByText("No email has been sent for this class yet.")).toBeNull();
  });
  it("shows the old sentence without a note", async () => {
    await open(null);
    await waitFor(() => expect(screen.getByText("No email has been sent for this class yet.")).toBeTruthy());
  });
});
