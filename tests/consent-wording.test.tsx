import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConsentField } from "@/components/landing/registration/Field";

const WORDING =
  "I have read the registration details, payment terms and schedule. I agree that PharmaCozyme Academy may keep in touch with me about this course, future courses and updates, by email, WhatsApp and relevant messages.";

describe("ConsentField wording", () => {
  it("shows the exact consent text", () => {
    render(<ConsentField checked={false} onChange={() => {}} />);
    expect(screen.getByText(WORDING)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: WORDING })).toBeTruthy();
  });

  it("toggles via onChange", () => {
    const onChange = vi.fn();
    render(<ConsentField checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("sets aria-invalid only when an error is provided", () => {
    const { rerender } = render(<ConsentField checked={false} onChange={() => {}} />);
    expect(screen.getByRole("checkbox").getAttribute("aria-invalid")).toBeNull();
    rerender(<ConsentField checked={false} onChange={() => {}} error="Please tick to continue" />);
    expect(screen.getByRole("checkbox").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Please tick to continue");
  });
});
