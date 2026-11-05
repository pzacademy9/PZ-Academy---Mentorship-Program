// Share the podium picture. The PNG is fetched BEFORE the tap (when the menu opens), so the tap can
// call navigator.share straight away: browsers (Safari above all) refuse a share that starts after a wait.
// Without file sharing, or if sharing fails, the same blob is saved; the picture is never fetched twice.

export function canShareFiles(nav: Navigator | undefined): boolean {
  return !!nav && typeof nav.share === "function" && typeof nav.canShare === "function";
}

/** The picture as a PNG blob, or null when the answer is an error, not a PNG, or the network failed. */
export async function fetchPodiumBlob(url: string, fetchFn: (url: string) => Promise<Response>): Promise<Blob | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "image/png") return null;
    const blob = await res.blob();
    return blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
  } catch {
    return null;
  }
}

export type ShareEnv = {
  navigator: Navigator | undefined;
  save: (blob: Blob, fileName: string) => void;
};

/** Call from the tap itself: navigator.share runs before any await. */
export function sharePodiumBlob(blob: Blob, fileName: string, title: string, env: ShareEnv): Promise<"shared" | "downloaded" | "cancelled"> {
  const nav = env.navigator;
  if (nav && canShareFiles(nav)) {
    const file = new File([blob], fileName, { type: "image/png" });
    if (nav.canShare({ files: [file] })) {
      return nav.share({ files: [file], title }).then(
        () => "shared" as const,
        (e: unknown) => {
          if (e instanceof Error && e.name === "AbortError") return "cancelled" as const;
          env.save(blob, fileName);
          return "downloaded" as const;
        },
      );
    }
  }
  env.save(blob, fileName);
  return Promise.resolve("downloaded");
}

/** Save a blob through a temporary object URL and link: no second request. */
export function saveBlobViaLink(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
