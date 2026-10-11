import {
  normalizeSheetText,
  readTargetField,
  sheetTargets,
  writeTargetField,
  type SheetTarget,
} from "@/lib/price-sheet-key";
import type { Category, ChangeField, SheetKey } from "@/lib/price-types";
import { categorySchema } from "@/lib/validation/price";

// Cells editable in the CMS table: variants have prices, volume and weight;
// tiers have prices and the upper limit.
export type DraftField = ChangeField | "upTo";

export const VARIANT_FIELDS: DraftField[] = [
  "volume",
  "weight",
  "price.UK-LT",
  "price.LT-UK",
];
export const TIER_FIELDS: DraftField[] = ["upTo", "price.UK-LT", "price.LT-UK"];

// Unsaved cell texts of one category, by cellKey.
export type CategoryDrafts = Record<string, string>;

export function cellKey(sheet: SheetKey, field: DraftField) {
  return `${[sheet.type, sheet.size, sheet.spec].map(normalizeSheetText).join("|")}#${field}`;
}

export function fieldsOf(target: SheetTarget) {
  return target.kind === "variant" ? VARIANT_FIELDS : TIER_FIELDS;
}

export function readCell(target: SheetTarget, field: DraftField) {
  if (field === "upTo") {
    return target.kind === "tier" ? target.item.upTo : undefined;
  }
  return readTargetField(target, field);
}

export function cellText(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

// "1,65" and "1.65" both read as 1.65; an empty cell is null.
export function parseCellNumber(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  return /^\d+(?:[.,]\d+)?$/.test(trimmed)
    ? Number(trimmed.replace(",", "."))
    : "invalid";
}

// Stores what was typed, or drops the draft when it equals the saved value.
export function setDraft(
  drafts: CategoryDrafts,
  key: string,
  text: string,
  saved: number | null,
) {
  const next = { ...drafts };
  if (parseCellNumber(text) === saved) {
    delete next[key];
  } else {
    next[key] = text;
  }
  return next;
}

// Errors are message keys or Zod's own messages: the table translates them.
export type AppliedDrafts = {
  category: Category;
  cellErrors: Record<string, string>;
  formErrors: string[];
};

function writeCell(
  target: SheetTarget,
  field: DraftField,
  value: number | null,
) {
  if (field === "upTo") {
    if (target.kind === "tier") {
      target.item.upTo = value;
    }
    return;
  }
  writeTargetField(target, field, value);
}

/** The category with the drafts applied, checked like the API checks it. */
export function applyDrafts(
  category: Category,
  drafts: CategoryDrafts,
): AppliedDrafts {
  const copy = structuredClone(category);
  const cellErrors: Record<string, string> = {};

  for (const target of sheetTargets(copy)) {
    for (const field of fieldsOf(target)) {
      const key = cellKey(target.item.sheet, field);
      if (!(key in drafts)) {
        continue;
      }
      const value = parseCellNumber(drafts[key]);
      if (value === "invalid") {
        cellErrors[key] = "validation.notANumber";
      } else if (field.startsWith("price.") && (value === null || value <= 0)) {
        cellErrors[key] = "validation.positive";
      } else if (field === "upTo" && value === 0) {
        cellErrors[key] = "validation.positive";
      } else {
        writeCell(target, field, value);
      }
    }
  }

  if (Object.keys(cellErrors).length > 0) {
    return { category: copy, cellErrors, formErrors: [] };
  }

  const result = categorySchema.safeParse(copy);
  return {
    category: copy,
    cellErrors,
    formErrors: result.success
      ? []
      : [...new Set(result.error.issues.map((issue) => issue.message))],
  };
}

// Drops drafts that equal the saved category (after a save, or after a reload).
export function pruneDrafts(category: Category, drafts: CategoryDrafts) {
  const next: CategoryDrafts = {};
  for (const target of sheetTargets(category)) {
    for (const field of fieldsOf(target)) {
      const key = cellKey(target.item.sheet, field);
      if (
        key in drafts &&
        parseCellNumber(drafts[key]) !== readCell(target, field)
      ) {
        next[key] = drafts[key];
      }
    }
  }
  return next;
}
