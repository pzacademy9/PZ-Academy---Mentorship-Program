// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, renderHook, act } from "@testing-library/react";
import { useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { RegistrationSetup } from "@/components/admin/landing/registration/RegistrationSetup";
import { DEFAULT_REGISTRATION, type RegistrationConfig } from "@/lib/landing/registration/config";

vi.mock("next/link", () => ({ default: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a> }));
afterEach(() => cleanup());

const reg = (moduleIds: string[] = []): RegistrationConfig => ({
  ...DEFAULT_REGISTRATION,
  enabled: true,
  modes: ["live"],
  options: [{ key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: "", moduleIds }],
});
const mods = [
  { id: "b", title: "Module 2: ICU", order_index: 2 },
  { id: "a", title: "Module 1: Clinical", order_index: 1 },
];

function setup(r: RegistrationConfig, extra: { courseModules?: typeof mods | null; saveMessage?: string | null } = { courseModules: mods }) {
  const onChange = vi.fn();
  render(<RegistrationSetup registration={r} accounts={[]} step="buy" onStep={() => {}} onChange={onChange} {...extra} />);
  return onChange;
}

describe("Modules this option gives", () => {
  it("lists the course modules in course order", () => {
    setup(reg());
    const row = screen.getByRole("group", { name: "Modules Module 1 gives" });
    expect(within(row).getAllByRole("checkbox").map((c) => c.parentElement?.textContent)).toEqual(["Module 1: Clinical", "Module 2: ICU"]);
    expect(screen.getByText("Modules this option gives")).toBeTruthy();
  });
  it("ticking adds the module id to that option", () => {
    const onChange = setup(reg(["a"]));
    fireEvent.click(screen.getByLabelText("Module 1: Module 2: ICU"));
    expect(onChange.mock.calls[0][0].options[0].moduleIds).toEqual(["a", "b"]);
  });
  it("unticking removes it", () => {
    const onChange = setup(reg(["a", "b"]));
    fireEvent.click(screen.getByLabelText("Module 1: Module 1: Clinical"));
    expect(onChange.mock.calls[0][0].options[0].moduleIds).toEqual(["b"]);
  });
  it("shows the whole course line when nothing is ticked", () => {
    setup(reg());
    expect(screen.getByText("Nothing ticked = the whole course")).toBeTruthy();
  });
  it("hides the row when the page has no course", () => {
    setup(reg(), { courseModules: null });
    expect(screen.queryByText("Modules this option gives")).toBeNull();
  });
  it("names the option in each module checkbox", () => {
    setup(reg());
    expect(screen.getByLabelText("Module 1: Module 1: Clinical")).toBeTruthy();
  });
  it("shows the server's message on every step, not only the buy step", () => {
    const onChange = vi.fn();
    render(<RegistrationSetup registration={reg()} accounts={[]} step="groups" onStep={() => {}} onChange={onChange} courseModules={mods} saveMessage="Nope." />);
    expect(screen.getByRole("alert").textContent).toBe("Nope.");
  });
  it("shows the server's message", () => {
    setup(reg(["zzz"]), { courseModules: mods, saveMessage: "Pick modules from this page's course." });
    expect(screen.getByRole("alert").textContent).toBe("Pick modules from this page's course.");
  });
});

describe("autosave keeps the server's refusal message", () => {
  it("exposes the 400 message and clears it on the next edit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Pick modules from this page's course." }), { status: 400 })));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p", initialRevision: 1 }));
    act(() => result.current.schedule({} as never));
    await act(async () => { await result.current.saveNow(); });
    expect(result.current.message).toBe("Pick modules from this page's course.");
    act(() => result.current.schedule({} as never));
    expect(result.current.message).toBeNull();
    vi.unstubAllGlobals();
  });
});
