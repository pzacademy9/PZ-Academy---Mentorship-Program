// scripts/import-old-affiliates.mjs
// Reads the old affiliate sheet and writes SQL for the owner to paste. Never touches the database.
//
//   node scripts/import-old-affiliates.mjs            prints the summary only (writes nothing)
//   node scripts/import-old-affiliates.mjs --write    after the owner approves: writes .local/old-affiliates-import.sql
//
// The SQL has real people in it, so .local/ is git-ignored and the file is never committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readSheet } from "./lib/xlsx-read.mjs";
import { buildInsertSql, parseOldAffiliates, summarize } from "./lib/old-affiliates.mjs";

const SOURCE = process.env.OLD_AFFILIATES_XLSX || "../../Miscellaneous/V2.0-Affiliate Marketing Team Recruitment Form .xlsx";
const OUT_DIR = ".local";
const OUT = `${OUT_DIR}/old-affiliates-import.sql`;

const sheet = readSheet(SOURCE, "Affiliate Marketers");
const { rows, skipped } = parseOldAffiliates(sheet);
console.log(summarize(rows, skipped));
console.log("Skipped row numbers by reason (sheet row numbers, no names):");
const byReason = {};
for (const s of skipped) (byReason[s.reason] ??= []).push(s.rowNumber);
for (const [reason, nums] of Object.entries(byReason)) console.log(`  ${reason}: ${nums.slice(0, 60).join(", ")}${nums.length > 60 ? ", ..." : ""}`);

if (process.argv.includes("--write")) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, buildInsertSql(rows, () => randomBytes(24).toString("base64url")), "utf8");
  console.log(`\nWrote ${OUT}. Paste it into the Supabase SQL editor by hand. It is git-ignored; never commit it.`);
} else {
  console.log("\nNothing written. Run again with --write after the owner approves this summary.");
}
