// Fonts and logo for the podium share picture, read once from disk and kept in memory.
// A missing file never breaks the picture: it falls back to the renderer's own font / no logo.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type PodiumFont = { name: string; data: Buffer; weight: 600 | 800; style: "normal" };
export type PodiumAssets = { fonts: PodiumFont[]; logo: string | null };

const ASSETS = path.join(process.cwd(), "src", "assets");

async function load(): Promise<PodiumAssets> {
  const font = async (file: string, weight: 600 | 800): Promise<PodiumFont | null> => {
    try {
      return { name: "Montserrat", data: await readFile(path.join(ASSETS, "fonts", file)), weight, style: "normal" };
    } catch {
      return null;
    }
  };
  const [semi, extra, logo] = await Promise.all([
    font("Montserrat-SemiBold.ttf", 600),
    font("Montserrat-ExtraBold.ttf", 800),
    readFile(path.join(ASSETS, "pz-logo-240.png"))
      .then((b) => `data:image/png;base64,${b.toString("base64")}`)
      .catch(() => null),
  ]);
  return { fonts: [semi, extra].filter((f): f is PodiumFont => f !== null), logo };
}

let cached: Promise<PodiumAssets> | null = null;

export function podiumAssets(): Promise<PodiumAssets> {
  cached ??= load();
  return cached;
}
