import type { ChangeValue, FieldChange } from "@/lib/change-log-types";
import type { FeeSettings } from "@/lib/fee-types";
import { msg, type Message } from "@/lib/i18n/translate";
import { CSV_COLUMNS } from "@/lib/postcode-csv";
import { fieldsOf, readCell, type DraftField } from "@/lib/price-drafts";
import { sheetKeyId, sheetTargets } from "@/lib/price-sheet-key";
import type { Category, SheetKey } from "@/lib/price-types";

// Field changes for the change log: what a write changed, as "record, field,
// before, after". Pure, so the API routes stay thin and this is tested.
// Labels are message keys, shown in the reader's language.

type PostcodeFields = Partial<Record<(typeof CSV_COLUMNS)[number], unknown>>;

function asValue(value: unknown): ChangeValue {
  return value === undefined ? null : (value as ChangeValue);
}

// before null: a new postcode, every filled field is a change.
export function diffPostcode(
  before: PostcodeFields | null,
  after: PostcodeFields,
): FieldChange[] {
  const record = String(after.postcode ?? before?.postcode ?? "");
  return CSV_COLUMNS.flatMap((field) => {
    const from = before ? asValue(before[field]) : null;
    const to = asValue(after[field]);
    if (from === to || (before === null && (to === "" || to === null))) {
      return [];
    }
    return [{ record, field: `postcode.${field}`, from, to }];
  });
}

// Message keys of the price fields (messages: price.*).
const PRICE_FIELD_LABELS: Record<DraftField, string> = {
  "price.UK-LT": "price.UK-LT",
  "price.LT-UK": "price.LT-UK",
  volume: "price.volume",
  weight: "price.weight",
  upTo: "price.upTo",
};

export function sheetText(key: SheetKey) {
  return [key.type, key.size, key.spec].filter(Boolean).join(" / ") || "—";
}

// The numbers of one category, matched by spreadsheet row.
export function diffPriceCategory(
  before: Category,
  after: Category,
): FieldChange[] {
  const old = new Map(
    sheetTargets(before).map((target) => [
      sheetKeyId(before.sheet, target.item.sheet),
      target,
    ]),
  );
  return sheetTargets(after).flatMap((target) => {
    const previous = old.get(sheetKeyId(after.sheet, target.item.sheet));
    return fieldsOf(target).flatMap((field) => {
      const from = previous ? (readCell(previous, field) ?? null) : null;
      const to = readCell(target, field) ?? null;
      return from === to
        ? []
        : [
            {
              record: sheetText(target.item.sheet),
              field: PRICE_FIELD_LABELS[field],
              from,
              to,
            },
          ];
    });
  });
}

export function priceFieldLabel(field: DraftField) {
  return PRICE_FIELD_LABELS[field];
}

// Settings keys with a label (messages: fees.*); other path parts are data
// (zone names) or row numbers.
const FEE_LABELS = new Set([
  "addressService",
  "purchaseService",
  "salesService",
  "parcelForce",
  "quantityDiscounts",
  "ownMoney",
  "clientMoney",
  "small",
  "medium",
  "tiers",
  "zones",
  "fee",
  "threshold",
  "percent",
  "min",
  "max",
  "maxSide",
  "maxWeight",
  "upToWeight",
  "fromParcels",
]);

type Leaves = Map<string, ChangeValue>;

// Leaf values by path; array rows are numbered from 1 (a msg() string), zones
// go by name.
function leaves(value: unknown, path: string[], out: Leaves) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const zone = (item as { zone?: string }).zone;
      leaves(item, [...path, zone ?? msg("fees.row", { n: index + 1 })], out);
    });
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key !== "zone") {
        leaves(child, [...path, key], out);
      }
    }
  } else {
    out.set(path.join("\u0000"), value as ChangeValue);
  }
  return out;
}

const label = (key: string) => (FEE_LABELS.has(key) ? `fees.${key}` : key);

// record: the group (["fees.purchaseService", "fees.clientMoney"]), field:
// the leaf ("fees.max").
export function diffFees(
  before: FeeSettings,
  after: FeeSettings,
): FieldChange[] {
  // Only the settings: a stored document also has _id and timestamps.
  const pick = ({
    addressService,
    purchaseService,
    salesService,
    parcelForce,
    quantityDiscounts,
  }: FeeSettings) => ({
    addressService,
    purchaseService,
    salesService,
    parcelForce,
    quantityDiscounts,
  });
  const old = leaves(pick(before), [], new Map());
  const now = leaves(pick(after), [], new Map());
  const paths = [...new Set([...now.keys(), ...old.keys()])];
  return paths.flatMap((path) => {
    const from = old.has(path) ? old.get(path)! : null;
    const to = now.has(path) ? now.get(path)! : null;
    if (from === to) {
      return [];
    }
    const parts = path.split("\u0000").map(label);
    return [
      {
        record: parts.slice(0, -1),
        field: parts[parts.length - 1],
        from,
        to,
      },
    ];
  });
}

// A value in a summary: "" and booleans as message keys, the rest as data.
function summaryValue(value: ChangeValue | undefined): Message | string {
  if (value === "" || value === null || value === undefined) {
    return { key: "log.empty" };
  }
  if (typeof value === "boolean") {
    return { key: value ? "log.true" : "log.false" };
  }
  return String(value);
}

// "Bulk change of 3 postcodes: Calendar → Even, Discount % → (empty)", with
// the fields and values as params so the text follows the language.
export function bulkSummary(
  count: number,
  changes: Record<string, ChangeValue | undefined>,
): Message {
  return {
    key: "log.bulkEditedPostcodes",
    params: {
      count,
      changes: Object.entries(changes).map(([field, value]) => ({
        key: "log.setTo",
        params: {
          field: { key: `postcode.${field}` },
          value: summaryValue(value),
        },
      })),
    },
  };
}
