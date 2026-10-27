import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FindMyId } from "@/components/marketing/FindMyId";

type Result = Awaited<ReturnType<React.ComponentProps<typeof FindMyId>["search"]>>;

function setup(result: Result) {
  const search = vi.fn(async () => result);
  render(<FindMyId slug="batch-1" search={search} />);
  const input = screen.getByLabelText("Your name");
  return { search, input };
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: "Find my ID" }));

describe("FindMyId", () => {
  it("asks for at least 3 letters and does not search", () => {
    const { search, input } = setup({ status: "too_short" });
    fireEvent.change(input, { target: { value: "ab" } });
    submit();
    expect(screen.getByText("Type at least 3 letters of your name")).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
  });

  it("shows name, ID, masked email and a copy button", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const { search, input } = setup({
      status: "ok",
      rows: [{ name: "Ali Khan", pzId: "Ali-1111", emailMasked: "al***@gmail.com" }],
    });
    fireEvent.change(input, { target: { value: "Ali" } });
    submit();
    await waitFor(() => expect(screen.getByText("Ali-1111")).toBeTruthy());
    expect(search).toHaveBeenCalledWith("batch-1", "Ali");
    expect(screen.getByText("Ali Khan")).toBeTruthy();
    expect(screen.getByText("al***@gmail.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("Ali-1111");
  });

  it("shows the no match message", async () => {
    const { input } = setup({ status: "not_found" });
    fireEvent.change(input, { target: { value: "Zzz" } });
    submit();
    await waitFor(() =>
      expect(screen.getByText("No match. Check the spelling of your name, or ask the team.")).toBeTruthy(),
    );
  });

  it("shows plain messages for rate limit and errors", async () => {
    const { input } = setup({ status: "rate_limited" });
    fireEvent.change(input, { target: { value: "Ali" } });
    submit();
    await waitFor(() => expect(screen.getByText(/Too many tries/)).toBeTruthy());
  });

  it("shows the error message from the server", async () => {
    const { input } = setup({ status: "error", message: "Could not search IDs. Please try again." });
    fireEvent.change(input, { target: { value: "Ali" } });
    submit();
    await waitFor(() => expect(screen.getByText("Could not search IDs. Please try again.")).toBeTruthy());
  });
});
