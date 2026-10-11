import Papa from "papaparse";
import { msg } from "@/lib/i18n/translate";
import { normalizeSheetText } from "@/lib/price-sheet-key";

export const SHEET_MAX_BYTES = 1024 * 1024;

// Category of the rows above the first named category: parcels.
export const SHIPMENTS_SHEET = "Siuntos";

export type SheetCells = {
  volume: string;
  weight: string;
  gbp: string;
  eur: string;
};

export type SheetRow = {
  // Row number in the spreadsheet (the same as the line in the CSV file).
  line: number;
  category: string;
  type: string;
  size: string;
  spec: string;
  cells: SheetCells;
};

// `error`: a msg() string (lib/i18n/translate.ts).
export type ParsedSheet = { rows: SheetRow[]; error: string | null };

type Column = "category" | "type" | "size" | "spec" | keyof SheetCells;

// How each column is found in the header row (texts are normalized).
const COLUMNS: {
  column: Column;
  name: string;
  matches: (header: string) => boolean;
}[] = [
  {
    column: "category",
    name: "Siuntos kategorija",
    matches: (h) => h === "siuntos kategorija",
  },
  {
    column: "type",
    name: "Siuntos tipas",
    matches: (h) => h === "siuntos tipas",
  },
  { column: "size", name: "Dydis", matches: (h) => h === "dydis" },
  {
    column: "spec",
    name: "Dydžio patikslinimas",
    matches: (h) => h === "dydžio patikslinimas",
  },
  {
    column: "volume",
    name: "Tūris (m3)",
    matches: (h) => h.startsWith("tūris"),
  },
  {
    column: "weight",
    name: "Svoris (kg)",
    matches: (h) => h.startsWith("svoris"),
  },
  {
    column: "gbp",
    name: "Kaina iš UK į LT (GBP)",
    matches: (h) => h.includes("gbp"),
  },
  {
    column: "eur",
    name: "Kaina iš LT į UK (EUR)",
    matches: (h) => h.includes("eur"),
  },
];

// Everything from this category down (service fees, discounts) is not prices.
const STOP_CATEGORY = "paslaugų įkainiai";
const CONTACT_MANAGER = "susisiekti su vadybininku";
const OR_ROW = "arba";

// Spreadsheet rows the site does not use.
const IGNORED_ROWS: { category: string; type?: string }[] = [
  { category: "kita" },
  { category: "prekės vaikams", type: "vaikiška dviračio priekaba" },
];

function isSkipped(row: SheetRow) {
  if (
    [row.size, row.spec, ...Object.values(row.cells)].every((cell) => !cell)
  ) {
    return true;
  }

  const category = normalizeSheetText(row.category);
  const type = normalizeSheetText(row.type);
  const size = normalizeSheetText(row.size);

  return (
    type === CONTACT_MANAGER ||
    size === CONTACT_MANAGER ||
    size === OR_ROW ||
    IGNORED_ROWS.some(
      (rule) =>
        rule.category === category &&
        (rule.type === undefined || rule.type === type),
    )
  );
}

/**
 * Reads the price list exported from Google Sheets as CSV. Empty category and
 * type cells repeat the value above them, the way the spreadsheet is laid out.
 */
export function parsePriceSheet(text: string): ParsedSheet {
  const fail = (error: string): ParsedSheet => ({ rows: [], error });

  if (text.includes("�")) {
    return fail("file.pricesNotUtf8");
  }

  // The delimiter (comma or semicolon) is detected automatically.
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""));

  const quoteError = result.errors.find((error) => error.type === "Quotes");
  if (quoteError) {
    return fail(
      msg("file.brokenQuotesRow", {
        row: String((quoteError.row ?? 0) + 1),
        message: quoteError.message,
      }),
    );
  }

  const lines = result.data;
  const headerIndex = lines.findIndex((cells) =>
    cells.some((cell) => normalizeSheetText(cell) === "siuntos kategorija"),
  );
  if (headerIndex === -1) {
    return fail("file.headerNotFound");
  }

  const header = lines[headerIndex].map(normalizeSheetText);
  const positions = {} as Record<Column, number>;
  for (const { column, name, matches } of COLUMNS) {
    const position = header.findIndex(matches);
    if (position === -1) {
      return fail(msg("file.columnNotFound", { name }));
    }
    positions[column] = position;
  }

  const rows: SheetRow[] = [];
  let category = SHIPMENTS_SHEET;
  let type = "";

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cell = (column: Column) =>
      (lines[index][positions[column]] ?? "").trim();

    if (normalizeSheetText(cell("category")).startsWith(STOP_CATEGORY)) {
      break;
    }
    if (cell("category")) {
      category = cell("category");
      type = "";
    }
    if (cell("type")) {
      type = cell("type");
    }

    const row: SheetRow = {
      line: index + 1,
      category,
      type,
      size: cell("size"),
      spec: cell("spec"),
      cells: {
        volume: cell("volume"),
        weight: cell("weight"),
        gbp: cell("gbp"),
        eur: cell("eur"),
      },
    };
    if (!isSkipped(row)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    return fail("file.noPriceRows");
  }

  return { rows, error: null };
}

export type SheetNumber = number | null | "invalid";

// Unit texts the spreadsheet writes after a number ("230 m3", "1,65 gbp/kg").
const NUMBER_UNITS = ["m3", "kg", "gbp/kg", "eur/kg", "gbp", "eur"];

// "35" → 35, "1,65 gbp/kg" → 1.65, "230 m3" → 230, "" → null. Anything else
// after the number ("1 234", "12-15", "35abc") is "invalid", never a guess.
export function parseSheetNumber(cell: string): SheetNumber {
  const text = cell.trim();
  if (!text) {
    return null;
  }
  const match = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(text);
  if (!match) {
    return "invalid";
  }
  const unit = match[2].toLowerCase().replace(/\s+/g, "");
  if (unit && !NUMBER_UNITS.includes(unit)) {
    return "invalid";
  }
  return Number(match[1].replace(",", "."));
}
