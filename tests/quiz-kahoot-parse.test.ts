import { strToU8, zipSync } from "fflate";
import { parseCsv, parseKahootGrid, readKahootFile } from "@/lib/quiz/kahoot-parse";

const HEADER = ["Rank", "Player", "Total Score (points)", "Correct Answers", "Incorrect Answers"];

function finalScores(rows: unknown[][]): unknown[][] {
  return [["Anti mycobacterial Drugs"], ["Final Scores"], HEADER, ...rows];
}

describe("parseKahootGrid", () => {
  it("finds the header under title rows and reads 17.0 style numbers", () => {
    const r = parseKahootGrid(finalScores([[1, "Rafi-SCPS194", 15090, 17, 3], ["2.0", "Sidra-KU42 ", "14759.0", "16.0", "4.0"]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ rank: 1, player: "Rafi-SCPS194", score: 15090, correct: 17, incorrect: 3, line: 4 });
    expect(r.rows[1].player).toBe("Sidra-KU42 "); // raw text kept; trimming happens in matching
    expect(r.rows[1].score).toBe(14759);
    expect(r.hasCounts && r.hasRank).toBe(true);
  });

  it("handles shuffled columns, blank columns and thousands separators", () => {
    const r = parseKahootGrid([["", "Incorrect", "", "Player", "Score", "Correct"], ["", 2, "", "Ali", "1,250", 8]]);
    expect(r.ok && r.rows[0]).toMatchObject({ player: "Ali", score: 1250, correct: 8, incorrect: 2, rank: null });
  });

  it("skips blank players and bad scores and counts them; ignores fully blank lines", () => {
    const r = parseKahootGrid(finalScores([[1, "A", 10, 1, 0], [2, "", 5, 0, 0], [3, "B", "abc", 0, 0], [], [4, "C", 1.5, 0, 0]]));
    expect(r.ok && r.rows.map((x) => x.player)).toEqual(["A"]);
    expect(r.ok && r.skipped).toBe(3);
  });

  it("fails clearly with no header or no players", () => {
    const none = parseKahootGrid([["a", "b"], [1, 2]]);
    expect(none.ok).toBe(false);
    const empty = parseKahootGrid(finalScores([]));
    expect(empty).toEqual({ ok: false, message: "The report has no players." });
  });

  it("uses a second text column called Identifier as the hint", () => {
    const r = parseKahootGrid([["Rank", "Player", "Identifier", "Total Score"], [1, "Hamid-4821", "Hamid Khan", 100]]);
    expect(r.ok && r.rows[0].hint).toBe("Hamid Khan");
  });

  it("refuses more than 5,000 rows", () => {
    const rows = Array.from({ length: 5001 }, (_, i) => [i + 1, `P${i}`, 1, 1, 0]);
    const r = parseKahootGrid(finalScores(rows));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/too many rows/i);
  });

  it("does not treat the per-answer raw data sheet as the final table", () => {
    const raw = parseKahootGrid([["Question Number", "Question", "Player", "Correct", "Incorrect", "Current Total Score (points)"], [1, "Q", "A", 1, 0, 900]]);
    expect(raw.ok).toBe(false);
  });
});

describe("parseCsv", () => {
  it("reads quoted fields, doubled quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,"b,1","c""d"\r\n1,2,3\r\n')).toEqual([["a", "b,1", 'c"d'], ["1", "2", "3"]]);
  });
});

// ---- minimal .xlsx builder so the reader is covered without a binary fixture
function cellRef(c: number, r: number): string {
  return `${String.fromCharCode(65 + c)}${r + 1}`;
}
function sheetXml(grid: unknown[][]): string {
  const rows = grid
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v === "" || v === null || v === undefined) return "";
          if (typeof v === "number") return `<c r="${cellRef(c, r)}"><v>${v}</v></c>`;
          const esc = String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
          return `<c r="${cellRef(c, r)}" t="inlineStr"><is><t xml:space="preserve">${esc}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}
function buildXlsx(sheets: { name: string; grid: unknown[][] }[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}</Relationships>`,
    ),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.grid)); });
  return zipSync(files);
}

describe("readKahootFile", () => {
  const summaryHeader = ["Rank", "Player", "Total Score (points)", "Q1", "Which Mycobacterium causes leprosy?", "Q2", "Next?"];
  const bytes = buildXlsx([
    { name: "Overview", grid: [["Anti mycobacterial Drugs"], ["Played on", "26 Jul 2025"], ["Played", "20 of 20"]] },
    { name: "Final Scores", grid: finalScores([[1, "Rafi-SCPS194", 15090, 17, 3], [2, "Sidra-KU42 ", 14759, 16, 4]]) },
    { name: "Kahoot! Summary", grid: [["x"], ["Kahoot! Summary"], summaryHeader, [1, "Rafi-SCPS194", 15090, 913, "M. leprae", 939, "a"]] },
  ]);

  it("picks the Final Scores tab over the Summary tab and reads the question count", async () => {
    const r = await readKahootFile("report.xlsx", bytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sheetName).toBe("Final Scores");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ player: "Rafi-SCPS194", score: 15090, correct: 17, incorrect: 3 });
    expect(r.rows[1].player.trim()).toBe("Sidra-KU42"); // the xlsx reader may trim; matching trims anyway
    expect(r.questionCount).toBe(20);
  });

  it("reads a csv", async () => {
    const csv = "Rank,Player,Total Score,Correct,Incorrect\r\n1,Ali,900,9,1\r\n";
    const r = await readKahootFile("r.csv", new TextEncoder().encode(csv));
    expect(r.ok && r.rows[0]).toMatchObject({ player: "Ali", score: 900 });
  });

  it("refuses other types, empty files, big files and unreadable xlsx without throwing", async () => {
    expect((await readKahootFile("r.pdf", new Uint8Array([1]))).ok).toBe(false);
    expect((await readKahootFile("r.xlsx", new Uint8Array())).ok).toBe(false);
    const big = await readKahootFile("r.csv", new Uint8Array(5 * 1024 * 1024 + 1));
    expect(!big.ok && big.message).toMatch(/too big/i);
    const junk = await readKahootFile("r.xlsx", new Uint8Array([1, 2, 3, 4]));
    expect(junk.ok).toBe(false);
  });
});
