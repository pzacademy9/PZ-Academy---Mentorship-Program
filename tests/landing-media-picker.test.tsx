// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useState } from "react";
import { MediaPicker } from "@/components/admin/landing/MediaPicker";
import { LandingImageField } from "@/components/admin/landing/LandingImageField";

const gate = vi.hoisted(() => ({ p: Promise.resolve() as Promise<void>, up: Promise.resolve() as Promise<void> }));
vi.mock("@/lib/landing/compress-image", () => ({ compressImage: async (f: File) => f }));
vi.mock("@/components/admin/landing/media-client", async (orig) => ({ ...(await orig<typeof import("@/components/admin/landing/media-client")>()), readImageSize: async () => { await gate.p; return { width: 1600, height: 900 }; } }));
vi.mock("@/components/admin/program/ImageUploadField", () => ({
  ImageUploadField: ({ value, onChange, uploadLabel = "Upload" }: { value: string; onChange: (u: string) => void; uploadLabel?: string }) => (
    <div>
      <input aria-label="link" value={value} onChange={(e) => onChange(e.target.value)} />
      <input
        aria-label="file"
        type="file"
        onChange={(e) => {
          if (e.target.files?.[0]?.name === "fail.png") return; // a failed upload never calls onChange
          void gate.up.then(() => onChange("https://drive.google.com/thumbnail?id=ABCDEFGHIJKL&sz=w1600"));
        }}
      />
      <button type="button">{uploadLabel}</button>
    </div>
  ),
}));

const item = (id: string, name: string, w: number, h: number, orientation: string) => ({
  id, driveFileId: "F" + id + "XXXXXXXXXX", url: `https://drive.google.com/thumbnail?id=F${id}XXXXXXXXXX`,
  name, folder: "heroes", width: w, height: h, orientation, sizeBytes: 1000, createdAt: "2026-01-01",
});
const ITEMS = [item("1", "Tall one", 600, 1000, "tall"), item("2", "Wide one", 1600, 900, "wide")];

function okFetch(items = ITEMS) {
  return vi.fn(async () => ({ ok: true, json: async () => ({ items }) }));
}

afterEach(() => cleanup());
beforeEach(() => { vi.unstubAllGlobals(); gate.p = Promise.resolve(); gate.up = Promise.resolve(); });

describe("MediaPicker", () => {
  it("lists pictures and filters by typed search", async () => {
    const f = okFetch();
    vi.stubGlobal("fetch", f);
    render(<MediaPicker open onClose={() => {}} onPick={() => {}} />);
    await screen.findByText("Tall one");
    expect(screen.getByText("Wide one")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "wide" } });
    expect(screen.queryByText("Tall one")).toBeNull();
    expect(screen.getByText("Wide one")).toBeTruthy();
  });
  it("folder tab refetches with folder=heroes", async () => {
    const f = okFetch();
    vi.stubGlobal("fetch", f);
    render(<MediaPicker open onClose={() => {}} onPick={() => {}} />);
    await screen.findByText("Tall one");
    fireEvent.click(screen.getByRole("button", { name: "Heroes" }));
    await waitFor(() => expect((f.mock.calls as unknown[][]).some((c) => String(c[0]).includes("folder=heroes"))).toBe(true));
  });
  it("want=wide sorts the wide picture first and tags only it", async () => {
    vi.stubGlobal("fetch", okFetch());
    render(<MediaPicker open onClose={() => {}} onPick={() => {}} want="wide" />);
    await screen.findByText("Wide one");
    const names = screen.getAllByTestId("media-name").map((n) => n.textContent);
    expect(names).toEqual(["Wide one", "Tall one"]);
    expect(screen.getAllByText("Fits computers")).toHaveLength(1);
    expect(screen.queryByText("Fits phones")).toBeNull();
  });
  it("picking calls onPick with the url and closes", async () => {
    vi.stubGlobal("fetch", okFetch());
    const onPick = vi.fn(); const onClose = vi.fn();
    render(<MediaPicker open onClose={onClose} onPick={onPick} />);
    fireEvent.click(await screen.findByText("Wide one"));
    expect(onPick).toHaveBeenCalledWith(ITEMS[1].url);
    expect(onClose).toHaveBeenCalled();
  });
  it("shows the empty text", async () => {
    vi.stubGlobal("fetch", okFetch([]));
    render(<MediaPicker open onClose={() => {}} onPick={() => {}} />);
    await screen.findByText("No pictures yet. Use Upload new to add one.");
  });
  it("shows an error and retry on fetch failure", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue({ ok: true, json: async () => ({ items: ITEMS }) });
    vi.stubGlobal("fetch", f);
    render(<MediaPicker open onClose={() => {}} onPick={() => {}} />);
    await screen.findByText("Could not load the pictures");
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    await screen.findByText("Tall one");
  });
});

describe("LandingImageField", () => {
  it("still renders upload and text box when the library fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    render(<LandingImageField value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Upload new" })).toBeTruthy();
    expect(screen.getByLabelText("link")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose from library" }));
    await screen.findByText("Could not load the pictures");
  });
  it("a hand-typed link calls onChange and never registers", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const onChange = vi.fn();
    render(<LandingImageField value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("link"), { target: { value: "https://drive.google.com/thumbnail?id=ABCDEFGHIJKL" } });
    expect(onChange).toHaveBeenCalledWith("https://drive.google.com/thumbnail?id=ABCDEFGHIJKL");
    expect(f).not.toHaveBeenCalled();
  });
  it("registers an uploaded picture once and notes failure", async () => {
    const f = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    vi.stubGlobal("fetch", f);
    function Host() {
      const [v, setV] = useState("");
      return <LandingImageField value={v} onChange={setV} />;
    }
    render(<Host />);
    const file = new File(["x"], "My Hero.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("file"), { target: { files: [file] } });
    await screen.findByText("Added to the page, but not saved to the library.");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = (f.mock.calls as unknown[][])[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/admin/landing-media");
    expect(JSON.parse(init.body)).toMatchObject({ name: "My Hero", sizeBytes: 1, width: 1600, height: 900 });
  });
  function Host2() {
    const [v, setV] = useState("");
    return <LandingImageField value={v} onChange={setV} />;
  }
  const posts = (f: { mock: { calls: unknown[][] } }) =>
    f.mock.calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
  async function failedUpload() {
    fireEvent.change(screen.getByLabelText("file"), { target: { files: [new File(["x"], "fail.png", { type: "image/png" })] } });
    await new Promise((r) => setTimeout(r, 20));
  }
  it("a hand-pasted link after a failed upload does not register", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) }));
    vi.stubGlobal("fetch", f);
    render(<Host2 />);
    await failedUpload();
    fireEvent.change(screen.getByLabelText("link"), { target: { value: "https://drive.google.com/thumbnail?id=ZZZZZZZZZZZZ" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(posts(f)).toHaveLength(0);
  });
  it("a library pick after a failed upload does not register", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ items: ITEMS }) }));
    vi.stubGlobal("fetch", f);
    render(<Host2 />);
    await failedUpload();
    fireEvent.click(screen.getByRole("button", { name: "Choose from library" }));
    fireEvent.click(await screen.findByText("Wide one"));
    await new Promise((r) => setTimeout(r, 20));
    expect(posts(f)).toHaveLength(0);
    expect((screen.getByLabelText("link") as HTMLInputElement).value).toBe(ITEMS[1].url);
  });
  it("typing in the picker search while an upload is in flight still registers it", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ items: ITEMS }) }));
    vi.stubGlobal("fetch", f);
    let release!: () => void;
    gate.up = new Promise<void>((r) => { release = r; });
    render(<Host2 />);
    fireEvent.change(screen.getByLabelText("file"), { target: { files: [new File(["x"], "My Hero.png", { type: "image/png" })] } });
    await new Promise((r) => setTimeout(r, 20)); // details captured, upload still running
    fireEvent.click(screen.getByRole("button", { name: "Choose from library" }));
    await screen.findByText("Wide one");
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "wide" } });
    release();
    await waitFor(() => expect(posts(f)).toHaveLength(1));
  });
  it("the landing upload button reads Upload new", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<LandingImageField value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Upload new" })).toBeTruthy();
  });
});

describe("MediaPicker races", () => {
  it("an older reply does not overwrite a newer one", async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => resolvers.push(r))));
    render(<MediaPicker open onClose={() => {}} onPick={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Heroes" }));
    await waitFor(() => expect(resolvers).toHaveLength(2));
    const reply = (items: unknown[]) => ({ ok: true, json: async () => ({ items }) });
    resolvers[1](reply([ITEMS[1]]));
    await screen.findByText("Wide one");
    resolvers[0](reply([ITEMS[0]]));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Tall one")).toBeNull();
    expect(screen.getByText("Wide one")).toBeTruthy();
  });
});

describe("shared ImageUploadField", () => {
  it("keeps Upload as its default button label", async () => {
    const real = await vi.importActual<typeof import("@/components/admin/program/ImageUploadField")>("@/components/admin/program/ImageUploadField");
    const F = real.ImageUploadField;
    render(<F value="" onChange={() => {}} courseSlug="x" kind="k" inputClassName="" />);
    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
    cleanup();
    render(<F value="" onChange={() => {}} courseSlug="x" kind="k" inputClassName="" uploadLabel="Upload new" />);
    expect(screen.getByRole("button", { name: "Upload new" })).toBeTruthy();
  });
});
