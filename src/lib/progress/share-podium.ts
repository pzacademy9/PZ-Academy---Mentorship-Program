// Share the podium picture: on phones that can share files, open the share sheet with the PNG;
// otherwise (or if sharing fails) download it. Everything the browser gives is passed in, so it is testable.

export type ShareEnv = {
  fetch: (url: string) => Promise<Response>;
  navigator: Navigator | undefined;
  download: (url: string, fileName: string) => void;
};

export function canShareFiles(nav: Navigator | undefined): boolean {
  return !!nav && typeof nav.share === "function" && typeof nav.canShare === "function";
}

export async function sharePodiumImage(
  url: string,
  fileName: string,
  title: string,
  env: ShareEnv,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const nav = env.navigator;
  if (nav && canShareFiles(nav)) {
    try {
      const res = await env.fetch(url);
      if (!res.ok) throw new Error("image request failed");
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "image/png" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title });
        return "shared";
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
    }
  }
  env.download(url, fileName);
  return "downloaded";
}

/** Browser download through a temporary link (works after an await, unlike opening a new window). */
export function downloadViaLink(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
