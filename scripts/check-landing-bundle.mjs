// Production-build checks for the public landing pages.
//   node scripts/check-landing-bundle.mjs                       after `next build`
//   node scripts/check-landing-bundle.mjs --url <page url>      also checks caching, with `next start` running
// Exit codes: 0 PASS, 1 FAIL, 2 no usable build.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const nextDir = join(process.cwd(), ".next");
// Text that exists only inside the lazily loaded registration modal (StepPay, StepUpload, SuccessScreen).
const MARKERS = ["Choose how you pay", "Upload your payment receipt", "Check your registration status"];
// What a visitor downloads before touching Register: the page plus the layouts around it.
const ENTRIES = ["/e/[slug]/page", "/e/layout", "/layout"];

let failed = false;
const fail = (message) => { console.error(`FAIL: ${message}`); failed = true; };

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const manifestPath = join(nextDir, "app-build-manifest.json");
if (!existsSync(manifestPath)) {
  console.error("No production build in .next. Stop the dev server, then run: node node_modules/next/dist/bin/next build");
  process.exit(2);
}
const pages = JSON.parse(readFileSync(manifestPath, "utf8")).pages ?? {};
if (!pages["/e/[slug]/page"]) {
  console.error('"/e/[slug]/page" is missing from .next/app-build-manifest.json');
  process.exit(2);
}

const files = [...new Set(ENTRIES.flatMap((k) => pages[k] ?? []))].filter((f) => f.endsWith(".js"));
let raw = 0;
let gz = 0;
for (const f of files) {
  const buf = readFileSync(join(nextDir, f));
  raw += buf.length;
  gz += gzipSync(buf).length;
  const text = buf.toString("utf8");
  for (const m of MARKERS) if (text.includes(m)) fail(`first-load file ${f} contains registration modal text "${m}"`);
}
console.log(`/e/[slug] first-load JS: ${files.length} files, ${(raw / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzipped`);

const lazy = walk(join(nextDir, "static", "chunks")).filter((p) => readFileSync(p, "utf8").includes(MARKERS[0]));
if (lazy.length === 0) fail(`no chunk contains "${MARKERS[0]}": the modal text changed, update MARKERS in this script`);
else console.log(`Registration modal lives in ${lazy.length} lazily loaded chunk(s).`);

const at = process.argv.indexOf("--url");
if (at > 0 && process.argv[at + 1]) {
  const page = process.argv[at + 1].replace(/\/$/, "");
  for (const url of [page, `${page}/status`]) {
    for (let n = 0; n < 2; n++) {
      const res = await fetch(url, { redirect: "manual" });
      const cc = res.headers.get("cache-control") ?? "";
      console.log(`${url} -> ${res.status}; cache-control: ${cc}; x-nextjs-cache: ${res.headers.get("x-nextjs-cache") ?? "-"}`);
      if (res.status !== 200) fail(`${url} answered ${res.status}`);
      if (/no-store|private/.test(cc) || !/s-maxage=/.test(cc)) fail(`${url} is not served as a cached static page`);
    }
  }
}

if (failed) process.exit(1);
console.log("PASS");
