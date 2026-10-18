/** Browser-side helpers for the shared picture library. Nothing here throws. */

export async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(file);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return size.width > 0 && size.height > 0 ? size : null;
    }
    if (typeof Image === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return null;
    const href = URL.createObjectURL(file);
    try {
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () =>
          resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null);
        img.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 5000); // never hold up an upload on a picture that will not decode
        img.src = href;
      });
    } finally {
      URL.revokeObjectURL(href);
    }
  } catch {
    return null;
  }
}

export async function registerUpload(args: {
  url: string; name: string; width: number | null; height: number | null; sizeBytes: number | null;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/landing-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    return !!res.ok;
  } catch {
    return false;
  }
}
