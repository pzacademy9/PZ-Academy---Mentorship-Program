import type { MetadataRoute } from "next";

// The home-screen icon opens /resume, which sends the person to the last portal page they viewed.
// pz-logo.png is 1080x1080; no separate 192/512 icons exist yet.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PZ Academy",
    short_name: "PZ Academy",
    start_url: "/resume",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1b4b33",
    icons: [{ src: "/pz-logo.png", sizes: "1080x1080", type: "image/png", purpose: "any" }],
  };
}
