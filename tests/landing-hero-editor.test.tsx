// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useState } from "react";
import { SectionForm } from "@/components/admin/landing/SectionForm";
import { FieldInput } from "@/components/admin/landing/FieldInput";
import { WhatsappNumberField } from "@/components/admin/landing/WhatsappNumberField";
import { SECTION_DEFS } from "@/lib/landing/sections";

vi.mock("@/components/admin/program/ImageUploadField", () => ({
  ImageUploadField: () => <button type="button">Fake pick file</button>,
}));

afterEach(() => cleanup());

const SECTIONS = [{ id: "s2", label: "About" }, { id: "s3", label: "FAQ" }];

function Hero({ initial }: { initial: Record<string, unknown> }) {
  const [data, setData] = useState(initial);
  return <SectionForm type="hero" data={data} onChange={setData} sections={SECTIONS} />;
}

describe("hero form showWhen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ numbers: [] }) })));
  });
  it("photo style hides the old picture control, classic shows it", () => {
    const { unmount } = render(<Hero initial={{ heroStyle: "photo" }} />);
    expect(screen.queryByText("Picture")).toBeNull();
    unmount();
    render(<Hero initial={{ heroStyle: "classic" }} />);
    expect(screen.getByText("Picture")).toBeTruthy();
  });
  it("hero style is a native select with plain labels", () => {
    render(<Hero initial={{ heroStyle: "photo" }} />);
    const sel = screen.getByLabelText("Hero style") as HTMLSelectElement;
    expect(sel.tagName).toBe("SELECT");
    expect(Array.from(sel.options).map((o) => o.text)).toEqual(["Photo with text on top", "Finished poster", "Picture beside text (old style)"]);
  });
  it("second button type 'section' shows only the section dropdown", () => {
    render(<Hero initial={{ secondaryCtaType: "section" }} />);
    const sel = screen.getByLabelText("Section to go to") as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.text)).toEqual(expect.arrayContaining(["About", "FAQ"]));
    expect(screen.queryByLabelText("Second button link (optional)")).toBeNull();
    expect(screen.queryByLabelText("WhatsApp number")).toBeNull();
  });
  it("second button type 'whatsapp' shows the number dropdown", async () => {
    render(<Hero initial={{ secondaryCtaType: "whatsapp" }} />);
    expect(await screen.findByLabelText("WhatsApp number")).toBeTruthy();
    expect(screen.queryByLabelText("Section to go to")).toBeNull();
  });
  it("switching the type swaps the control", () => {
    render(<Hero initial={{ secondaryCtaType: "link" }} />);
    expect(screen.getByLabelText("Second button link (optional)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Second button does"), { target: { value: "section" } });
    expect(screen.getByLabelText("Section to go to")).toBeTruthy();
    expect(screen.queryByLabelText("Second button link (optional)")).toBeNull();
  });
});

describe("length hint", () => {
  const field = SECTION_DEFS.hero.fields.find((f) => f.key === "headline")!;
  it("shows a gentle target and a soft note past it, never an alert", () => {
    const { rerender } = render(<FieldInput field={field} value="short" onChange={() => {}} />);
    expect(screen.getByText("Best under 70 characters")).toBeTruthy();
    rerender(<FieldInput field={field} value={"x".repeat(80)} onChange={() => {}} />);
    expect(screen.getByText(/a bit long/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("never blocks typing", () => {
    const onChange = vi.fn();
    render(<FieldInput field={field} value={"x".repeat(80)} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "x".repeat(81) } });
    expect(onChange).toHaveBeenCalledWith("x".repeat(81));
  });
});

describe("WhatsappNumberField", () => {
  const OFFICIAL = [
    { label: "PZ Academy main", number: "923700199429", official: true },
    { label: "PZ Academy second", number: "923242167718", official: true },
  ];
  const SAVED = { id: "n1", label: "Sales", number: "923001112222", official: false };
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, json: async () => ({ number: { id: "n2", label: "Alice", number: "923335556666", official: false } }) };
      if (init?.method === "DELETE") return { ok: true, json: async () => ({ ok: true }) };
      return { ok: true, json: async () => ({ numbers: [...OFFICIAL, SAVED] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  function Harness({ initial = "" }: { initial?: string }) {
    const [v, setV] = useState(initial);
    return <WhatsappNumberField label="WhatsApp number" value={v} onChange={setV} />;
  }

  it("lists official numbers first and defaults to the first", async () => {
    const onChange = vi.fn();
    render(<WhatsappNumberField label="WhatsApp number" value="" onChange={onChange} />);
    const sel = (await screen.findByLabelText("WhatsApp number")) as HTMLSelectElement;
    await waitFor(() => expect(sel.options.length).toBeGreaterThanOrEqual(3));
    const texts = Array.from(sel.options).map((o) => o.text);
    expect(texts[1]).toContain("PZ Academy main");
    expect(texts[2]).toContain("PZ Academy second");
    expect(sel.value).toBe("");
    expect(sel.options[0].text).toBe("Choose a number");
    fireEvent.change(sel, { target: { value: "923700199429" } });
    expect(onChange).toHaveBeenCalledWith("923700199429");
  });
  it("shows a loading state instead of not in list while the list loads", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<Harness initial="923001112222" />);
    expect(screen.getByText(/loading numbers/i)).toBeTruthy();
    expect(screen.queryByText(/not in list/i)).toBeNull();
  });
  it("falls back to the official numbers when the list cannot load", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }));
    render(<Harness />);
    await screen.findByText(/couldn.t load your saved numbers/i);
    const sel = screen.getByLabelText("WhatsApp number") as HTMLSelectElement;
    const texts = Array.from(sel.options).map((o) => o.text);
    expect(texts.some((t) => t.includes("PZ Academy main"))).toBe(true);
    expect(texts.some((t) => t.includes("PZ Academy second"))).toBe(true);
    fireEvent.change(sel, { target: { value: "923242167718" } });
    expect(sel.value).toBe("923242167718");
  });
  it("adds a number and selects it", async () => {
    render(<Harness />);
    await screen.findByLabelText("WhatsApp number");
    fireEvent.click(screen.getByRole("button", { name: /add a number/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Number"), { target: { value: "+92 333 5556666" } });
    fireEvent.click(screen.getByRole("button", { name: /^save number$/i }));
    await waitFor(() => expect((screen.getByLabelText("WhatsApp number") as HTMLSelectElement).value).toBe("923335556666"));
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(String(post[0])).toBe("/api/admin/landing-whatsapp");
    expect(JSON.parse(post[1].body).number).toBe("923335556666");
  });
  it("shows a stored number missing from the list as not in list", async () => {
    render(<Harness initial="923999000111" />);
    const sel = (await screen.findByLabelText("WhatsApp number")) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(sel.options).some((o) => o.text === "923999000111 (not in list)")).toBe(true));
    expect(sel.value).toBe("923999000111");
  });
  it("delete is offered only for saved numbers and asks first in plain words", async () => {
    render(<Harness initial="923001112222" />);
    await screen.findByLabelText("WhatsApp number");
    const del = await screen.findByRole("button", { name: /remove this number/i });
    fireEvent.click(del);
    expect(screen.getByText(/remove this number from the list/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /yes, remove/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === "DELETE" && String(c[0]).endsWith("/n1"))).toBe(true));
  });
  it("official numbers have no delete button", async () => {
    render(<Harness initial="923700199429" />);
    await screen.findByLabelText("WhatsApp number");
    expect(screen.queryByRole("button", { name: /remove this number/i })).toBeNull();
  });
  it("shows plain error text when the list cannot load", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }));
    render(<Harness />);
    expect(await screen.findByText(/couldn.t load your saved numbers/i)).toBeTruthy();
  });
});
