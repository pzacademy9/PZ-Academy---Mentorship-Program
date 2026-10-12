import { fitWithin } from "./image-size";

const MAX_SIDE = 1600;

function loadImage(file: File, timeoutMs: number): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // A picture the browser can neither decode nor reject would otherwise hang the upload forever.
    const timer = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error("timeout")); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve({ img, url }); };
    img.onerror = () => { clearTimeout(timer); URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

/**
 * Downscales a picture to at most 1600 px on its longest side and re-encodes it as WebP before
 * upload. Best effort: whenever canvas or toBlob is unavailable, throws, or does not make the
 * file smaller, the ORIGINAL file is returned unchanged so an upload is never blocked.
 */
export async function compressImage(file: File, { timeoutMs = 10_000 }: { timeoutMs?: number } = {}): Promise<File> {
  // GIFs may be animated and SVGs are already tiny; leave both alone.
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  let loaded: { img: HTMLImageElement; url: string } | null = null;
  try {
    loaded = await loadImage(file, timeoutMs);
    const { img } = loaded;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;
    const fitted = fitWithin(w, h, MAX_SIDE);
    // fitWithin can round an extreme aspect ratio down to 0; a 0-pixel canvas would be a blank image.
    const width = Math.max(1, fitted.width);
    const height = Math.max(1, fitted.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob || blob.type !== "image/webp") return file;
    const resized = width !== w || height !== h;
    if (!resized && blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  } finally {
    if (loaded) URL.revokeObjectURL(loaded.url);
  }
}
