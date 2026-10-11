import {
  indexSheetTargets,
  readTargetField,
  sheetKeyId,
  sheetTargets,
} from "@/lib/price-sheet-key";
import {
  parseSheetNumber,
  type SheetCells,
  type SheetRow,
} from "@/lib/price-sheet";
import type {
  Category,
  ChangeField,
  PriceChange,
  SheetKey,
} from "@/lib/price-types";

export type SheetChange = PriceChange & { line: number };

export type MissingRow = {
  category: string;
  categorySheet: string;
  sheet: SheetKey;
};

export type SheetDiff = {
  changes: SheetChange[];
  // Spreadsheet rows with no match in the CMS.
  unknown: SheetRow[];
  // CMS rows with no match in the spreadsheet.
  missing: MissingRow[];
  errors: { line: number; message: string }[];
};

export const FIELD_LABELS: Record<ChangeField, string> = {
  "price.UK-LT": "UK→LT (£)",
  "price.LT-UK": "LT→UK (€)",
  volume: "Volume (m³)",
  weight: "Weight (kg)",
};

const FIELD_CELLS: {
  field: ChangeField;
  cell: keyof SheetCells;
  price: boolean;
}[] = [
  { field: "price.UK-LT", cell: "gbp", price: true },
  { field: "price.LT-UK", cell: "eur", price: true },
  { field: "volume", cell: "volume", price: false },
  { field: "weight", cell: "weight", price: false },
];

/**
 * Compares the spreadsheet with the catalog. Tiers compare prices only; their
 * volume and weight cells hold notes ("skaičiuojama pagal m3").
 */
export function diffPriceSheet(
  categories: Category[],
  rows: SheetRow[],
): SheetDiff {
  const index = indexSheetTargets(categories);
  const seen = new Map<string, number>();
  const diff: SheetDiff = { changes: [], unknown: [], missing: [], errors: [] };

  for (const row of rows) {
    const id = sheetKeyId(row.category, row);
    const target = index.get(id);
    if (!target) {
      diff.unknown.push(row);
      continue;
    }

    const firstLine = seen.get(id);
    if (firstLine !== undefined) {
      diff.errors.push({ line: row.line, message: `Repeats row ${firstLine}` });
      continue;
    }
    seen.set(id, row.line);

    for (const { field, cell, price } of FIELD_CELLS) {
      if (!price && target.kind !== "variant") {
        continue;
      }

      const raw = row.cells[cell];
      const value = parseSheetNumber(raw);
      const label = FIELD_LABELS[field];
      if (value === "invalid") {
        diff.errors.push({
          line: row.line,
          message: `${label}: "${raw}" is not a number`,
        });
        continue;
      }
      // Prices have at most 2 decimals: "1,088" is 1088 with a thousands
      // separator, not 1.088.
      if (price && /^\s*\d+[.,]\d{3,}/.test(raw)) {
        diff.errors.push({
          line: row.line,
          message: `${label}: "${raw}" has more than 2 decimals (thousands separator?)`,
        });
        continue;
      }
      if (price && (value === null || value <= 0)) {
        diff.errors.push({
          line: row.line,
          message: `${label}: price must be greater than 0`,
        });
        continue;
      }

      const current = readTargetField(target, field);
      if (current !== undefined && value !== current) {
        diff.changes.push({
          line: row.line,
          category: target.category,
          sheet: target.item.sheet,
          field,
          from: current,
          to: value,
        });
      }
    }
  }

  for (const category of categories) {
    for (const target of sheetTargets(category)) {
      if (!seen.has(sheetKeyId(category.sheet, target.item.sheet))) {
        diff.missing.push({
          category: category.value,
          categorySheet: category.sheet,
          sheet: target.item.sheet,
        });
      }
    }
  }

  return diff;
}

// Changes the preview leaves unticked: they clear a value, or their row has
// an error (applying the rest of that row could leave it half-updated).
export function riskyChanges(diff: SheetDiff): Set<number> {
  const errorLines = new Set(diff.errors.map((error) => error.line));
  const risky = new Set<number>();
  diff.changes.forEach((change, index) => {
    if (change.to === null || errorLines.has(change.line)) {
      risky.add(index);
    }
  });
  return risky;
}
