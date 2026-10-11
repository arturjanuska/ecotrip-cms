import type { FeeSettings, StoredFeeSettings } from "@/lib/fee-types";
import { cellText, parseCellNumber } from "@/lib/price-drafts";
import { feeSettingsSchema } from "@/lib/validation/fees";

// The Fees form keeps every number as the text typed, so a half-typed or wrong
// value stays on screen with its error. Rows mirror the arrays of FeeSettings.
type FormOf<T> = T extends number | null
  ? string
  : T extends (infer Item)[]
    ? FormOf<Item>[]
    : T extends object
      ? { [Key in keyof T]: FormOf<T[Key]> }
      : T;

export type FeeForm = FormOf<FeeSettings>;

// A field's place in the form, as Zod reports it: "salesService.min",
// "quantityDiscounts.2.percent".
export type FieldPath = (string | number)[];

export function pathKey(path: readonly PropertyKey[]) {
  return path.map(String).join(".");
}

// Text fields that are not numbers (the zone names) and numbers that may be
// empty (bounds of a percent fee: empty = no limit).
const TEXT_FIELDS = new Set(["zone"]);
const NULLABLE_FIELDS = new Set(["min", "max"]);

// Arrays whose own errors (no rows, zones out of order) the form shows under
// the rows.
export const LIST_PATHS = [
  "parcelForce.medium.tiers",
  "parcelForce.zones",
  "quantityDiscounts",
];

function mapLeaves(
  value: unknown,
  map: (leaf: unknown, path: FieldPath) => unknown,
  path: FieldPath = [],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => mapLeaves(item, map, [...path, index]));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        mapLeaves(item, map, [...path, key]),
      ]),
    );
  }
  return map(value, path);
}

function fieldName(path: FieldPath) {
  return String(path[path.length - 1]);
}

export function toForm(settings: FeeSettings | StoredFeeSettings): FeeForm {
  // Only the settings: _id and the timestamps are not part of the form.
  const {
    addressService,
    purchaseService,
    salesService,
    parcelForce,
    quantityDiscounts,
  } = settings;
  return mapLeaves(
    {
      addressService,
      purchaseService,
      salesService,
      parcelForce,
      quantityDiscounts,
    },
    (leaf, path) =>
      TEXT_FIELDS.has(fieldName(path)) ? leaf : cellText(leaf as number | null),
  ) as FeeForm;
}

// Every field of the form by its path key.
export function formFields(form: FeeForm) {
  const fields: Record<string, string> = {};
  mapLeaves(form, (leaf, path) => {
    fields[pathKey(path)] = leaf as string;
  });
  return fields;
}

// A copy of the form with one field replaced.
export function setField(form: FeeForm, path: FieldPath, text: string) {
  const key = pathKey(path);
  return mapLeaves(form, (leaf, leafPath) =>
    pathKey(leafPath) === key ? text : leaf,
  ) as FeeForm;
}

function sameText(a: string, b: string) {
  return parseCellNumber(a) === parseCellNumber(b) || a.trim() === b.trim();
}

/**
 * Fields that differ from the saved settings: changed values, added rows and
 * removed rows. Removing a row moves the rows below it up, so they count too.
 */
export function changedFields(saved: FeeForm, form: FeeForm) {
  const before = formFields(saved);
  const after = formFields(form);
  const changed = new Set<string>();

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (
      !(key in before) ||
      !(key in after) ||
      !sameText(before[key], after[key])
    ) {
      changed.add(key);
    }
  }
  return changed;
}

// Errors are message keys or Zod's own messages: the form translates them.
export type AppliedForm = {
  settings: FeeSettings;
  // The first error of each field or list, by path key.
  fieldErrors: Record<string, string>;
  // Errors that belong to no field or list on the form.
  formErrors: string[];
};

/** The settings the form describes, checked like the API checks them. */
export function applyForm(form: FeeForm): AppliedForm {
  const fieldErrors: Record<string, string> = {};

  const settings = mapLeaves(form, (leaf, path) => {
    const name = fieldName(path);
    if (TEXT_FIELDS.has(name)) {
      return leaf;
    }
    const value = parseCellNumber(leaf as string);
    if (value === "invalid") {
      fieldErrors[pathKey(path)] = "validation.notANumber";
      return Number.NaN;
    }
    if (value === null && !NULLABLE_FIELDS.has(name)) {
      fieldErrors[pathKey(path)] = "validation.required";
    }
    return value;
  }) as FeeSettings;

  // Zod runs on the rest too, so every wrong field shows at once; a field
  // that already failed to read keeps that error.
  const formErrors = new Set<string>();
  const fields = formFields(form);
  const result = feeSettingsSchema.safeParse(settings);
  for (const issue of result.success ? [] : result.error.issues) {
    const key = pathKey(issue.path);
    if (key in fields || LIST_PATHS.includes(key)) {
      fieldErrors[key] ??= issue.message;
    } else {
      formErrors.add(issue.message);
    }
  }

  return { settings, fieldErrors, formErrors: [...formErrors] };
}
