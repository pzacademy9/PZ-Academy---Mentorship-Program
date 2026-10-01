import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ConfirmProvider, useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";

let result: boolean | undefined;
function Trigger(props: { opts: ConfirmOptions }) {
  const confirm = useConfirm();
  return <button onClick={async () => { result = await confirm(props.opts); }}>open</button>;
}
function setup(opts: ConfirmOptions) {
  result = undefined;
  render(<ConfirmProvider><Trigger opts={opts} /></ConfirmProvider>);
  fireEvent.click(screen.getByText("open"));
}

it("resolves true on confirm", async () => {
  setup({ title: "Delete it?", confirmLabel: "Delete" });
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  await waitFor(() => expect(result).toBe(true));
});

it("resolves false on cancel", async () => {
  setup({ title: "Delete it?" });
  fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(result).toBe(false));
});

it("resolves false on Escape", async () => {
  setup({ title: "Delete it?" });
  const dialog = await screen.findByRole("dialog");
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(result).toBe(false));
});

it("runs onConfirm with a busy button, then resolves true", async () => {
  let finish!: () => void;
  const onConfirm = vi.fn(() => new Promise<void>((r) => { finish = r; }));
  setup({ title: "Send?", confirmLabel: "Send", onConfirm });
  const send = await screen.findByRole("button", { name: "Send" });
  fireEvent.click(send);
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(send.getAttribute("aria-busy")).toBe("true");
  fireEvent.click(send); // ignored while busy
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  await waitFor(() => expect(result).toBe(true));
});

it("throws a clear error when used outside the provider", () => {
  function Bad() { useConfirm(); return null; }
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Bad />)).toThrow(/ConfirmProvider/);
  spy.mockRestore();
});
