import { describe, it, expect } from "vitest";
import { filterAttendanceRows } from "@/lib/classes/attendance-search";

const rows = [
  { name: "Hamid Khan", pzId: "Hamid-4821" },
  { name: "José Álvarez", pzId: "Jose-1002" },
  { name: "احمد علی", pzId: "Ahmad-3333" },
];

describe("filterAttendanceRows", () => {
  it("empty or blank returns all", () => {
    expect(filterAttendanceRows(rows, "")).toEqual(rows);
    expect(filterAttendanceRows(rows, "   ")).toEqual(rows);
  });
  it("name, case-insensitive", () => expect(filterAttendanceRows(rows, "hAMId")).toEqual([rows[0]]));
  it("pz id, case-insensitive", () => expect(filterAttendanceRows(rows, "jose-10")).toEqual([rows[1]]));
  it("trims", () => expect(filterAttendanceRows(rows, "  khan ")).toEqual([rows[0]]));
  it("no match", () => expect(filterAttendanceRows(rows, "zzz")).toEqual([]));
  it("accented and Urdu", () => {
    expect(filterAttendanceRows(rows, "álvarez")).toEqual([rows[1]]);
    expect(filterAttendanceRows(rows, "علی")).toEqual([rows[2]]);
  });
  it("does not mutate", () => {
    const copy = [...rows];
    filterAttendanceRows(rows, "hamid");
    expect(rows).toEqual(copy);
  });
});
