import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green:       "#1A4D2E",
          "green-mid": "#2E7D52",
          gold:        "#C9A84C",
          "gold-light":"#E8C97A",
          black:       "#0D0D0D",
          "near-black":"#0D0D0D",
          "off-white": "#F8F6F1",
          "gray-text": "#6B7280",
          "card-border":"#E5E1D8",
        },
        whatsapp: "#25D366",
      },
      fontFamily: {
        montserrat: ["var(--font-montserrat)", "Montserrat", "sans-serif"],
        poppins:    ["var(--font-poppins)",    "Poppins",    "sans-serif"],
        allura:     ["var(--font-allura)",     "Allura",     "cursive"],
      },
      fontSize: {
        "display": ["72px", { lineHeight: "1.05", fontWeight: "900", letterSpacing: "-0.02em" }],
        "display-sm": ["44px", { lineHeight: "1.1", fontWeight: "900" }],
        "h2-xl":   ["52px", { lineHeight: "1.15", fontWeight: "800" }],
        "h2-sm":   ["34px", { lineHeight: "1.2",  fontWeight: "800" }],
      },
      boxShadow: {
        "gold-sm": "0 0 12px rgba(201,168,76,0.25)",
        "gold-md": "0 0 20px 4px rgba(201,168,76,0.35)",
        "gold-lg": "0 0 30px 8px rgba(201,168,76,0.45)",
        "card":    "0 4px 24px rgba(0,0,0,0.06)",
        "card-hover":"0 16px 48px rgba(0,0,0,0.12)",
        "green":   "0 4px 30px rgba(26,77,46,0.25)",
        "nav-scroll":"0 4px 30px rgba(0,0,0,0.3)",
      },
      backgroundImage: {
        "diamond-texture": "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cpolygon points='30,0 60,30 30,60 0,30' fill='none' stroke='rgba(201,168,76,0.07)' stroke-width='1'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};

export default config;
