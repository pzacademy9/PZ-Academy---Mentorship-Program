import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckinForm } from "@/components/attendance/CheckinForm";

function setup(openMinutes?: number) {
  const shared = vi.fn().mockResolvedValue({ status: "before" });
  render(<CheckinForm code="abc" personal={vi.fn()} shared={shared} openMinutes={openMinutes} />);
  fireEvent.change(screen.getByLabelText("Your registered email"), { target: { value: "a@b.co" } });
  fireEvent.click(screen.getByRole("button", { name: "Mark me present" }));
}

describe("CheckinForm before-window message", () => {
  it("uses the batch's open minutes", async () => {
    setup(30);
    await waitFor(() => expect(screen.getByText("Check-in is not open yet. It opens 30 minutes before the class.")).toBeTruthy());
  });
  it("says 1 minute in the singular", async () => {
    setup(1);
    await waitFor(() => expect(screen.getByText("Check-in is not open yet. It opens 1 minute before the class.")).toBeTruthy());
  });
});
