import type { ChangeValue, FieldChange } from "@/lib/change-log-types";
import type { FeeSettings } from "@/lib/fee-types";
import { CSV_COLUMNS } from "@/lib/postcode-csv";
import { fieldsOf, readCell, type DraftField } from "@/lib/price-drafts";
import { sheetKeyId, sheetTargets } from "@/lib/price-sheet-key";
import type { Category, SheetKey } from "@/lib/price-types";

// Field changes for the change log: what a write changed, as "record, field,
// before, after". Pure, so the API routes stay thin and this is tested.

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
    return [{ record, field, from, to }];
  });
}

const PRICE_FIELD_LABELS: Record<DraftField, string> = {
  "price.UK-LT": "UK→LT (£)",
  "price.LT-UK": "LT→UK (€)",
  volume: "Volume (m³)",
  weight: "Weight (kg)",
  upTo: "Up to",
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

const FEE_LABELS: Record<string, string> = {
  addressService: "Address service",
  purchaseService: "Purchase service",
  salesService: "Sales service",
  parcelForce: "ParcelForce",
  quantityDiscounts: "Quantity discounts",
  ownMoney: "Our money",
  clientMoney: "Client's money",
  small: "Small parcel",
  medium: "Medium parcel",
  tiers: "Tier",
  zones: "Zones",
  fee: "Fee",
  threshold: "Threshold",
  percent: "Percent",
  min: "Min",
  max: "Max",
  maxSide: "Max side",
  maxWeight: "Max weight",
  upToWeight: "Up to (kg)",
  fromParcels: "From parcels",
};

type Leaves = Map<string, ChangeValue>;

// Leaf values by path; array rows are numbered from 1, zones go by name.
function leaves(value: unknown, path: string[], out: Leaves) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const zone = (item as { zone?: string }).zone;
      leaves(item, [...path, zone ?? `row ${index + 1}`], out);
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

const label = (key: string) => FEE_LABELS[key] ?? key;

// record: the group ("Purchase service · Client's money"), field: the leaf.
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
        record: parts.slice(0, -1).join(" · "),
        field: parts[parts.length - 1],
        from,
        to,
      },
    ];
  });
}
