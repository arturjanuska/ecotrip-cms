import {
  indexSheetTargets,
  readTargetField,
  sheetKeyId,
  writeTargetField,
} from "@/lib/price-sheet-key";
import type { Category, PriceChange } from "@/lib/price-types";

export type ImportConflict = {
  change: PriceChange;
  reason: "not-found" | "stale" | "invalid-field";
};

// Response of POST /api/prices/import: how many changes were applied.
export type PriceImportResult = { updated: number };

export type ImportOutcome = {
  // Changed copies of the categories (empty when there are conflicts).
  updated: Category[];
  conflicts: ImportConflict[];
};

/**
 * Applies import changes to copies of the categories. Each change must still
 * find the value the preview showed (`from`); if any change does not, nothing
 * is applied, so an import never mixes with edits made after the preview.
 */
export function applyImportChanges(
  categories: Category[],
  changes: PriceChange[],
): ImportOutcome {
  const copies = structuredClone(categories);
  const byValue = new Map(copies.map((category) => [category.value, category]));
  const index = indexSheetTargets(copies);
  const conflicts: ImportConflict[] = [];
  const touched = new Set<string>();

  for (const change of changes) {
    const category = byValue.get(change.category);
    const target = category
      ? index.get(sheetKeyId(category.sheet, change.sheet))
      : undefined;
    if (!category || !target) {
      conflicts.push({ change, reason: "not-found" });
      continue;
    }

    const current = readTargetField(target, change.field);
    if (current === undefined) {
      conflicts.push({ change, reason: "invalid-field" });
      continue;
    }
    if (current !== change.from) {
      conflicts.push({ change, reason: "stale" });
      continue;
    }
    if (!writeTargetField(target, change.field, change.to)) {
      conflicts.push({ change, reason: "invalid-field" });
      continue;
    }
    touched.add(category.value);
  }

  return conflicts.length > 0
    ? { updated: [], conflicts }
    : {
        updated: copies.filter((category) => touched.has(category.value)),
        conflicts,
      };
}
