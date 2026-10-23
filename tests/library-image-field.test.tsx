// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useState } from "react";
import { readFileSync } from "node:fs";
import { LibraryImageField } from "@/components/admin/landing/LibraryImageField";

vi.mock("@/lib/landing/compress-image", () => ({ compressImage: async (f: File) => f }));
vi.mock("@/components/admin/landing/media-client", async (orig) => ({ ...(await orig<typeof import("@/components/admin/landing/media-client")>()), readImageSize: async () => ({ width: 600, height: 600 }) }));
vi.mock("@/components/admin/program/ImageUploadField", () => ({
  ImageUploadField: ({ value, onChange, uploadLabel = "Upload" }: { value: string; onChange: (u: string) => void; uploadLabel?: string }) => (
    <div>
      <input aria-label="link" value={value} onChange={(e) => onChange(e.target.value)} />
      <input aria-label="file" type="file" onChange={() => onChange("https://drive.google.com/thumbnail?id=ABCDEFGHIJKL&sz=w1600")} />
      <button type="button">{uploadLabel}</button>
    </div>
  ),
}));

const ITEMS = [{
  id: "1", driveFileId: "F1XXXXXXXXXXX", url: "https://drive.google.com/thumbnail?id=F1XXXXXXXXXXX",
  name: "Dr Ali", folder: "instructors", width: 600, height: 600, orientation: "square", sizeBytes: 1000, createdAt: "2026-01-01",
}];
const posts = (f: { mock: { calls: unknown[][] } }) =>
  f.mock.calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === "POST");

afterEach(() => cleanup());
beforeEach(() => vi.unstubAllGlobals());

function Host({ onChange }: { onChange?: (u: string) => void }) {
  const [v, setV] = useState("");
  return <LibraryImageField value={v} onChange={(u) => { setV(u); onChange?.(u); }} courseSlug="c" kind="mentor-avatar" folder="instructors" shape="circle" inputClassName="x" />;
}

describe("LibraryImageField", () => {
  it("shows Choose from library and picking calls onChange with the url", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ items: ITEMS }) })));
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose from library" }));
    fireEvent.click(await screen.findByText("Dr Ali"));
    expect(onChange).toHaveBeenCalledWith(ITEMS[0].url);
  });
  it("registers a real upload in the given folder", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", f);
    render(<Host />);
    fireEvent.change(screen.getByLabelText("file"), { target: { files: [new File(["x"], "Dr Ali.png", { type: "image/png" })] } });
    await waitFor(() => expect(posts(f)).toHaveLength(1));
    const [url, init] = posts(f)[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/admin/landing-media");
    expect(JSON.parse(init.body)).toMatchObject({ name: "Dr Ali", folder: "instructors" });
  });
  it("a hand-typed link is not registered", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(<Host />);
    fireEvent.change(screen.getByLabelText("link"), { target: { value: "https://drive.google.com/thumbnail?id=ABCDEFGHIJKL" } });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("call sites", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("ProgramConfigForm uses the library field with the right folders", () => {
    const s = read("src/components/admin/program/ProgramConfigForm.tsx");
    expect(s).not.toMatch(/<ImageUploadField/);
    expect((s.match(/<LibraryImageField/g) ?? []).length).toBe(3);
    expect((s.match(/folder="heroes"/g) ?? []).length).toBe(2);
    expect((s.match(/folder="instructors"/g) ?? []).length).toBe(1);
    expect((s.match(/want="wide"/g) ?? []).length).toBe(1);
  });
  it("MentorConfigForm uses instructors", () => {
    const s = read("src/components/admin/mentors/MentorConfigForm.tsx");
    expect(s).not.toMatch(/<ImageUploadField/);
    expect(s).toMatch(/<LibraryImageField[\s\S]*?folder="instructors"/);
  });
  it("BannersPanel uses heroes, wide", () => {
    const s = read("src/components/admin/marketing/BannersPanel.tsx");
    expect(s).not.toMatch(/<ImageUploadField/);
    expect(s).toMatch(/<LibraryImageField[\s\S]*?folder="heroes"[\s\S]*?want="wide"/);
  });
});
