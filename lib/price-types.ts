// Price catalog shared by the CMS and ecotrip-react. ecotrip-react keeps a copy
// of these types in src/utils/priceCatalog.ts: change both together.

export const DIRECTIONS = ["UK-LT", "LT-UK"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// UK-LT is charged in GBP, LT-UK in EUR.
export type Money = Record<Direction, number>;

// A Select option on the site. `value` never changes once created (orders
// store it); `label` is an i18n key or a literal such as "<R18".
export type PriceOption = { value: string; label: string };

// Exact texts of one row of the price list spreadsheet. Rows are matched by
// them on import, and the CMS table shows them.
export type SheetKey = { type: string; size: string; spec: string };

export type Variant = {
  sheet: SheetKey;
  size: PriceOption | null;
  specification: PriceOption | null;
  // One item, for logistics only: they do not change the price.
  volume: number | null;
  weight: number | null;
  price: Money;
};

export type Tier = {
  sheet: SheetKey;
  // Inclusive upper limit (kg or m3); null only on the last tier.
  upTo: number | null;
  price: Money;
  // true: price per kg or m3; false: price per parcel.
  perUnit: boolean;
};

export type FixedPricing = { type: "fixed"; variants: Variant[] };

// The price is the larger of the weight price and the volume price.
export type MeasuredPricing = {
  type: "measured";
  byWeight: Tier[] | null;
  byVolume: Tier[] | null;
};

export type Pricing = FixedPricing | MeasuredPricing | { type: "callManager" };

export type SubCategory = PriceOption & { pricing: Pricing };

export type Category = PriceOption & {
  // "Siuntos kategorija" text in the spreadsheet.
  sheet: string;
  order: number;
  // Array order is the Select order. Empty: the site hides Sub Category.
  subCategories: SubCategory[];
  // Set only when subCategories is empty.
  pricing: Pricing | null;
};

// A category as GET /api/prices returns it.
export type StoredCategory = Category & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export type PriceCatalog = { categories: StoredCategory[] };

// Fields an import can change. Variants have all four, tiers only prices.
export const CHANGE_FIELDS = [
  "price.UK-LT",
  "price.LT-UK",
  "volume",
  "weight",
] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export type PriceChange = {
  category: string;
  sheet: SheetKey;
  field: ChangeField;
  from: number | null;
  to: number | null;
};
