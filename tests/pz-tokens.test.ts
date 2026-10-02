import { PZ_TOKENS, hexToTriplet, buildPzCss, pzTailwindColors } from "@/lib/theme/pz-tokens";
import fs from "node:fs";
import path from "node:path";

// Tokens that are intentionally identical in both themes (brand colours and
// container/on-container pairs that stay readable by construction).
const CONSTANT = new Set([
  "bright", "lime", "gold", "gold-light", "maroon", "success", "warning", "danger",
  "solid-deep", "solid-forest", "solid-mid", "solid-pine", "solid-sage",
  "primary-container", "on-primary-container", "primary-fixed", "primary-fixed-dim",
  "on-primary-fixed", "on-primary-fixed-variant",
  "secondary-container", "on-secondary-container", "secondary-fixed", "secondary-fixed-dim",
  "on-secondary-fixed", "on-secondary-fixed-variant",
  "tertiary-container", "on-tertiary-container", "tertiary-fixed", "tertiary-fixed-dim",
  "on-tertiary-fixed", "on-tertiary-fixed-variant",
  "error-container", "on-error-container", "inverse-primary",
]);

it("every token has a valid 6-digit light hex", () => {
  for (const [name, t] of Object.entries(PZ_TOKENS)) {
    expect(t.light, name).toMatch(/^#[0-9a-fA-F]{6}$/);
    if (t.dark) expect(t.dark, name).toMatch(/^#[0-9a-fA-F]{6}$/);
  }
});

it("every non-constant token defines a dark value, constants define none", () => {
  for (const [name, t] of Object.entries(PZ_TOKENS)) {
    if (CONSTANT.has(name)) expect(t.dark, `${name} should be constant`).toBeUndefined();
    else expect(t.dark, `${name} needs a dark value`).toBeDefined();
  }
});

it("hexToTriplet converts to space-separated rgb", () => {
  expect(hexToTriplet("#0F3D22")).toBe("15 61 34");
  expect(hexToTriplet("#ffffff")).toBe("255 255 255");
});

it("buildPzCss emits :root for all tokens and .dark only for adaptive ones", () => {
  const { root, dark } = buildPzCss();
  expect(root["--pz-surface"]).toBe("249 249 249");
  expect(dark["--pz-surface"]).toBe("16 21 12");
  expect(dark["--pz-bright"]).toBeUndefined();
  expect(Object.keys(root).length).toBe(Object.keys(PZ_TOKENS).length);
});

it("tailwind colours use the alpha-value placeholder so /60 modifiers work", () => {
  const c = pzTailwindColors();
  expect(c["primary"]).toBe("rgb(var(--pz-primary) / <alpha-value>)");
  expect(Object.keys(c).length).toBe(Object.keys(PZ_TOKENS).length);
});

it("globals.css sets color-scheme dark and has no var(--pz-*, #hex) fallbacks", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  expect(css).toMatch(/\.dark\s*\{[^}]*color-scheme:\s*dark/s);
  expect(css).not.toMatch(/var\(--pz-[a-z-]+,\s*#/);
});
