import { describe, it, expect, vi } from "vitest";
import { canShareFiles, fetchPodiumBlob, saveBlobViaLink, sharePodiumBlob } from "@/lib/progress/share-podium";

const pngBlob = () => new Blob(["png"], { type: "image/png" });

describe("canShareFiles", () => {
  it("is true only when both share and canShare exist", () => {
    expect(canShareFiles(undefined)).toBe(false);
    expect(canShareFiles({} as Navigator)).toBe(false);
    expect(canShareFiles({ share: vi.fn(), canShare: vi.fn() } as unknown as Navigator)).toBe(true);
  });
});

describe("fetchPodiumBlob", () => {
  it("returns the PNG blob for a good response", async () => {
    const f = vi.fn(async () => new Response(pngBlob(), { status: 200, headers: { "Content-Type": "image/png" } }));
    const blob = await fetchPodiumBlob("/api/x", f);
    expect(blob?.type).toBe("image/png");
    expect(f).toHaveBeenCalledWith("/api/x");
  });

  it("returns null for an error status, a non-PNG answer or a network failure", async () => {
    expect(await fetchPodiumBlob("/x", async () => new Response("no", { status: 404 }))).toBeNull();
    expect(await fetchPodiumBlob("/x", async () => new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } }))).toBeNull();
    expect(await fetchPodiumBlob("/x", async () => { throw new Error("offline"); })).toBeNull();
  });
});

describe("sharePodiumBlob", () => {
  it("calls share straight away (no wait before it) with the picture as a file", async () => {
    const share = vi.fn(async () => undefined);
    const nav = { share, canShare: vi.fn(() => true) } as unknown as Navigator;
    const save = vi.fn();
    const pending = sharePodiumBlob(pngBlob(), "pod.png", "Sample", { navigator: nav, save });
    expect(share).toHaveBeenCalledTimes(1);
    expect(await pending).toBe("shared");
    const arg = (share.mock.calls[0] as unknown as [{ files: File[]; title: string }])[0];
    expect(arg.files[0].name).toBe("pod.png");
    expect(arg.files[0].type).toBe("image/png");
    expect(arg.title).toBe("Sample");
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the same blob when file sharing is not possible", async () => {
    const blob = pngBlob();
    const save = vi.fn();
    expect(await sharePodiumBlob(blob, "pod.png", "S", { navigator: undefined, save })).toBe("downloaded");
    expect(save).toHaveBeenCalledWith(blob, "pod.png");
    const nav = { share: vi.fn(), canShare: vi.fn(() => false) } as unknown as Navigator;
    expect(await sharePodiumBlob(blob, "pod.png", "S", { navigator: nav, save })).toBe("downloaded");
    expect(nav.share).not.toHaveBeenCalled();
  });

  it("saves the blob when share throws, but not when the person cancels", async () => {
    const save = vi.fn();
    const failing = { share: vi.fn(async () => { throw new Error("NotAllowed"); }), canShare: vi.fn(() => true) } as unknown as Navigator;
    expect(await sharePodiumBlob(pngBlob(), "p.png", "S", { navigator: failing, save })).toBe("downloaded");
    expect(save).toHaveBeenCalledTimes(1);
    const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
    const cancelling = { share: vi.fn(async () => { throw abort; }), canShare: vi.fn(() => true) } as unknown as Navigator;
    expect(await sharePodiumBlob(pngBlob(), "p.png", "S", { navigator: cancelling, save })).toBe("cancelled");
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("saveBlobViaLink", () => {
  it("downloads through an object URL of the blob, no network", () => {
    const blob = pngBlob();
    URL.createObjectURL = vi.fn(() => "blob:fake") as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    saveBlobViaLink(blob, "pod.png");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    const a = click.mock.contexts[0] as HTMLAnchorElement;
    expect(a.download).toBe("pod.png");
    expect(a.getAttribute("href")).toBe("blob:fake");
    click.mockRestore();
  });
});
