import { describe, expect, it } from "vitest";
import { msg } from "@/lib/i18n/translate";
import { diffPriceSheet, riskyChanges, type SheetDiff } from "@/lib/price-diff";
import type { SheetRow } from "@/lib/price-sheet";
import { sampleCatalog } from "@/lib/price-test-data";

const notANumber = (field: string, raw: string) =>
  msg("priceDiff.notANumber", { field: { key: field }, raw });
const notPositive = (field: string) =>
  msg("priceDiff.priceNotPositive", { field: { key: field } });

function wheelsRow(
  patch: Partial<SheetRow> = {},
  cells: Partial<SheetRow["cells"]> = {},
): SheetRow {
  return {
    line: 13,
    category: "Automobilių dalys ir priedai",
    type: "Ratų komplektas",
    size: "<R16",
    spec: "Be padangų",
    ...patch,
    cells: { volume: "0.08", weight: "28", gbp: "66", eur: "66", ...cells },
  };
}

function tierRow(size: string, gbp: string, line: number): SheetRow {
  return {
    line,
    category: "Siuntos",
    type: "",
    size,
    spec: "",
    cells: { volume: "", weight: "skaičiuojama pagal m3", gbp, eur: gbp },
  };
}

const allRows = () => [
  tierRow("<15 kg", "45", 3),
  tierRow(">15 kg", "1,65 gbp/kg", 4),
  wheelsRow(),
  wheelsRow(
    { line: 14, spec: "Su padangomis" },
    { volume: "0.24", weight: "40", gbp: "77", eur: "77" },
  ),
];

describe("diffPriceSheet", () => {
  it("finds nothing when the spreadsheet matches", () => {
    expect(diffPriceSheet(sampleCatalog(), allRows())).toEqual({
      changes: [],
      unknown: [],
      missing: [],
      errors: [],
    });
  });

  it("lists changed cells with the stored row texts", () => {
    const rows = allRows();
    rows[2] = wheelsRow(
      { type: " ratų  KOMPLEKTAS " },
      { gbp: "70", weight: "" },
    );
    const diff = diffPriceSheet(sampleCatalog(), rows);
    const sheet = { type: "Ratų komplektas", size: "<R16", spec: "Be padangų" };
    expect(diff.changes).toEqual([
      {
        line: 13,
        category: "automotiveGoods",
        sheet,
        field: "price.UK-LT",
        from: 66,
        to: 70,
      },
      {
        line: 13,
        category: "automotiveGoods",
        sheet,
        field: "weight",
        from: 28,
        to: null,
      },
    ]);
    expect(diff.errors).toEqual([]);
  });

  it("splits unknown and missing rows", () => {
    const rows = allRows().slice(0, 3);
    rows.push(wheelsRow({ line: 20, size: "<R18" }));
    const diff = diffPriceSheet(sampleCatalog(), rows);
    expect(diff.unknown.map((row) => row.line)).toEqual([20]);
    expect(diff.missing).toEqual([
      {
        category: "automotiveGoods",
        categorySheet: "Automobilių dalys ir priedai",
        sheet: { type: "Ratų komplektas", size: "<R16", spec: "Su padangomis" },
      },
    ]);
  });

  it("reports unreadable, empty and zero prices instead of changing them", () => {
    const rows = allRows();
    rows[2] = wheelsRow({}, { gbp: "abc", eur: "" });
    rows[3] = wheelsRow(
      { line: 14, spec: "Su padangomis" },
      { volume: "0.24", weight: "40", gbp: "0", eur: "77" },
    );
    const diff = diffPriceSheet(sampleCatalog(), rows);
    expect(diff.changes).toEqual([]);
    expect(diff.errors).toEqual([
      { line: 13, message: notANumber("price.UK-LT", "abc") },
      { line: 13, message: notPositive("price.LT-UK") },
      { line: 14, message: notPositive("price.UK-LT") },
    ]);
  });

  it("reports a row that appears twice", () => {
    const rows = [...allRows(), wheelsRow({ line: 30 })];
    expect(diffPriceSheet(sampleCatalog(), rows).errors).toEqual([
      { line: 30, message: 'priceDiff.repeatsRow {"line":"13"}' },
    ]);
  });

  it("does not read a thousands separator in a price as decimals", () => {
    const rows = allRows();
    rows[2] = wheelsRow({}, { gbp: "1,088", eur: "1.088" });
    const diff = diffPriceSheet(sampleCatalog(), rows);
    expect(diff.changes).toEqual([]);
    expect(diff.errors).toEqual([
      {
        line: 13,
        message: msg("priceDiff.tooManyDecimals", {
          field: { key: "price.UK-LT" },
          raw: "1,088",
        }),
      },
      {
        line: 13,
        message: msg("priceDiff.tooManyDecimals", {
          field: { key: "price.LT-UK" },
          raw: "1.088",
        }),
      },
    ]);
  });
});

describe("riskyChanges", () => {
  const sheet = { type: "Ratų komplektas", size: "<R16", spec: "Be padangų" };
  const change = (
    line: number,
    from: number,
    to: number | null,
  ): SheetDiff["changes"][number] => ({
    line,
    category: "automotiveGoods",
    sheet,
    field: "price.UK-LT",
    from,
    to,
  });

  it("flags changes that clear a value or sit on a row with an error", () => {
    const diff: SheetDiff = {
      changes: [change(13, 66, 70), change(14, 28, null), change(15, 66, 70)],
      unknown: [],
      missing: [],
      errors: [{ line: 15, message: notPositive("price.LT-UK") }],
    };
    expect(riskyChanges(diff)).toEqual(new Set([1, 2]));
  });

  it("flags nothing in a clean diff", () => {
    const diff: SheetDiff = {
      changes: [change(13, 66, 70), change(14, 66, 71)],
      unknown: [],
      missing: [],
      errors: [],
    };
    expect(riskyChanges(diff)).toEqual(new Set());
  });
});
