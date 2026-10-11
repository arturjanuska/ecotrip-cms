import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePriceSheet, parseSheetNumber } from "@/lib/price-sheet";

const fixture = readFileSync(
  new URL("./__fixtures__/pricelist-2026-09-17.csv", import.meta.url),
  "utf8",
);

const HEADER =
  ",Siuntos kategorija,Siuntos tipas,Dydis,Dydžio patikslinimas,Tūris (m3),Svoris (kg),Kaina iš UK  į  LT (GBP),Kaina iš LT į UK (EUR),Kaina LT-LT";

describe("parsePriceSheet on the 2026-09-17 spreadsheet", () => {
  const { rows, error } = parsePriceSheet(fixture);

  it("reads every price row", () => {
    expect(error).toBeNull();
    expect(rows).toHaveLength(175);
  });

  it("puts the rows above the first category into Siuntos", () => {
    expect(rows[0]).toEqual({
      line: 3,
      category: "Siuntos",
      type: "",
      size: "< 1kg",
      spec: "",
      cells: { volume: "", weight: "", gbp: "35", eur: "35" },
    });
  });

  it("repeats category and type from the rows above", () => {
    expect(rows.find((row) => row.line === 14)).toEqual({
      line: 14,
      category: "Automobilių dalys ir priedai",
      type: "Ratų komplektas",
      size: "<R18",
      spec: "Be padangų",
      cells: { volume: "0.1", weight: "32", gbp: "88", eur: "88" },
    });
    expect(rows.find((row) => row.line === 172)?.type).toBe("");
  });

  it("skips rows the site does not use", () => {
    const sizes = rows.map((row) => row.size.toLowerCase());
    expect(sizes).not.toContain("arba");
    expect(sizes).not.toContain("susisiekti su vadybininku");
    expect(rows.some((row) => row.category === "Kita")).toBe(false);
    expect(rows.some((row) => row.category === "Paletės")).toBe(false);
    expect(
      rows
        .filter((row) => row.category === "Prekės vaikams")
        .map((row) => row.type),
    ).not.toContain("Vaikiška dviračio priekaba");
    expect(Math.max(...rows.map((row) => row.line))).toBe(202);
  });
});

describe("parsePriceSheet edge cases", () => {
  it("reads semicolon-separated files and strips the BOM", () => {
    const csv = `﻿${HEADER.replaceAll(",", ";")}\n;Paletės;Kita tipas;<1 m3;;0,5;10;1,5;2;\n`;
    const { rows, error } = parsePriceSheet(csv);
    expect(error).toBeNull();
    expect(rows[0].cells).toEqual({
      volume: "0,5",
      weight: "10",
      gbp: "1,5",
      eur: "2",
    });
  });

  it("finds price columns whatever the spacing of the header", () => {
    const header = HEADER.replace(
      "Kaina iš UK  į  LT (GBP)",
      "kaina iš UK į LT (gbp)",
    );
    const { rows, error } = parsePriceSheet(`${header}\n,,,<1kg,,,,35,36,15\n`);
    expect(error).toBeNull();
    expect(rows[0].cells.gbp).toBe("35");
    expect(rows[0].cells.eur).toBe("36");
  });

  it("explains files it cannot read", () => {
    expect(parsePriceSheet("a,b\n1,2\n").error).toBe(
      'Header row with "Siuntos kategorija" not found.',
    );
    expect(parsePriceSheet(`${HEADER.replace("Dydis", "Size")}\n`).error).toBe(
      'Column "Dydis" not found in the header row.',
    );
    expect(parsePriceSheet(`${HEADER}\n,Siuntos kategorija �\n`).error).toMatch(
      /not UTF-8/,
    );
    expect(parsePriceSheet(`${HEADER}\n,,,,,,,,,\n`).error).toBe(
      "The file has no price rows.",
    );
  });
});

describe("parseSheetNumber", () => {
  it.each([
    ["35", 35],
    ["0.035", 0.035],
    ["1,65 gbp/kg", 1.65],
    ["230 m3", 230],
    [" 90 ", 90],
    ["", null],
    ["pagal kg", "invalid"],
    ["skaičiuojama pagal m3", "invalid"],
    ["1,65 eur/kg", 1.65],
    ["12 KG", 12],
    ["1 234", "invalid"],
    ["12-15", "invalid"],
    ["35abc", "invalid"],
    ["1.234,50", "invalid"],
  ])("reads %j as %j", (cell, expected) => {
    expect(parseSheetNumber(cell)).toBe(expected);
  });
});
