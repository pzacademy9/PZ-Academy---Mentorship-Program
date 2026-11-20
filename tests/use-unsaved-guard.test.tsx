import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

function Harness({ failSave = false, anchors }: { failSave?: boolean; anchors?: React.ReactNode }) {
  const [dirty, setDirty] = useState(true);
  const { confirmLeaveDialog } = useUnsavedGuard(dirty);
  // A save that fails leaves the page dirty; a good one clears it.
  const save = () => { if (!failSave) setDirty(false); };
  return (
    <div>
      <button onClick={save}>save</button>
      <button onClick={() => setDirty(true)}>edit</button>
      <a href="/dashboard/admin/courses">inside</a>
      <a href="https://example.com/x">outside</a>
      <a href="#top">hash</a>
      <a href="/dashboard/x" target="_blank">blank</a>
      <a href="/dashboard/y" data-allow-leave>allowed</a>
      {anchors}
      {confirmLeaveDialog}
    </div>
  );
}

function setup(props?: { failSave?: boolean }) {
  return render(<ConfirmProvider><Harness {...props} /></ConfirmProvider>);
}

function unload() {
  const ev = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
}

// Reports whether the guard stopped the click. A click the guard leaves alone reaches the window,
// where its link default is swallowed (jsdom cannot navigate); a click it stops never gets there.
function click(el: Element, init: MouseEventInit = {}) {
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  let reached = false;
  let preventedBefore = false;
  const record = (e: Event) => { reached = true; preventedBefore = e.defaultPrevented; e.preventDefault(); };
  window.addEventListener("click", record);
  el.dispatchEvent(ev);
  window.removeEventListener("click", record);
  return { defaultPrevented: reached ? preventedBefore : ev.defaultPrevented };
}

beforeEach(() => push.mockClear());

describe("useUnsavedGuard", () => {
  it("prevents beforeunload while dirty and not otherwise", () => {
    setup();
    expect(unload()).toBe(true);
    fireEvent.click(screen.getByText("save"));
    expect(unload()).toBe(false);
  });

  it("asks before following an internal link and does not navigate", async () => {
    setup();
    const ev = click(screen.getByText("inside"));
    expect(ev.defaultPrevented).toBe(true);
    expect(await screen.findByText("You have changes that are not saved. Leave anyway?")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("Stay keeps the page", async () => {
    setup();
    click(screen.getByText("inside"));
    fireEvent.click(await screen.findByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByText("Leave without saving?")).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  it("Leave anyway pushes the link href", async () => {
    setup();
    click(screen.getByText("inside"));
    fireEvent.click(await screen.findByRole("button", { name: "Leave anyway" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/admin/courses"));
  });

  it("ignores modified clicks, new tabs, hash links, outside links and opt-outs", () => {
    setup();
    for (const [name, init] of [
      ["inside", { ctrlKey: true }], ["inside", { metaKey: true }], ["inside", { shiftKey: true }],
      ["blank", {}], ["hash", {}], ["outside", {}], ["allowed", {}],
    ] as [string, MouseEventInit][]) {
      expect(click(screen.getByText(name), init).defaultPrevented).toBe(false);
    }
    expect(screen.queryByText("Leave without saving?")).toBeNull();
  });

  it("removes handlers once not dirty", () => {
    setup();
    fireEvent.click(screen.getByText("save"));
    expect(click(screen.getByText("inside")).defaultPrevented).toBe(false);
    expect(unload()).toBe(false);
  });

  it("stays dirty after a failed save", () => {
    setup({ failSave: true });
    fireEvent.click(screen.getByText("save"));
    expect(unload()).toBe(true);
  });

  it("removes handlers on unmount", () => {
    const { unmount } = setup();
    unmount();
    expect(unload()).toBe(false);
  });
});
