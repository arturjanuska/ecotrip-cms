import type {
  Category,
  ChangeField,
  Pricing,
  SheetKey,
  Tier,
  Variant,
} from "@/lib/price-types";

// Spreadsheet texts are compared without regard to case and extra spaces.
export function normalizeSheetText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sheetKeyId(categorySheet: string, key: SheetKey) {
  return [categorySheet, key.type, key.size, key.spec]
    .map(normalizeSheetText)
    .join("|");
}

// A spreadsheet row stored in the catalog: a variant or a tier.
export type SheetTarget =
  | { kind: "variant"; category: string; item: Variant }
  | { kind: "tier"; category: string; item: Tier };

export function categoryPricings(category: Category): Pricing[] {
  return category.pricing
    ? [category.pricing]
    : category.subCategories.map((sub) => sub.pricing);
}

// Every variant and tier of a category, in table order.
export function sheetTargets(category: Category): SheetTarget[] {
  const targets: SheetTarget[] = [];
  for (const pricing of categoryPricings(category)) {
    if (pricing.type === "fixed") {
      for (const item of pricing.variants) {
        targets.push({ kind: "variant", category: category.value, item });
      }
    } else if (pricing.type === "measured") {
      for (const item of [
        ...(pricing.byWeight ?? []),
        ...(pricing.byVolume ?? []),
      ]) {
        targets.push({ kind: "tier", category: category.value, item });
      }
    }
  }
  return targets;
}

// Targets of all categories by sheetKeyId (unique: the schema checks it).
// The items are the catalog's own objects, so writes through them stick.
export function indexSheetTargets(categories: Category[]) {
  const index = new Map<string, SheetTarget>();
  for (const category of categories) {
    for (const target of sheetTargets(category)) {
      index.set(sheetKeyId(category.sheet, target.item.sheet), target);
    }
  }
  return index;
}

export function readTargetField(
  target: SheetTarget,
  field: ChangeField,
): number | null | undefined {
  switch (field) {
    case "price.UK-LT":
      return target.item.price["UK-LT"];
    case "price.LT-UK":
      return target.item.price["LT-UK"];
    case "volume":
      return target.kind === "variant" ? target.item.volume : undefined;
    case "weight":
      return target.kind === "variant" ? target.item.weight : undefined;
  }
}

// Returns false when the field does not exist on the target (volume or weight
// of a tier, or a null price).
export function writeTargetField(
  target: SheetTarget,
  field: ChangeField,
  value: number | null,
) {
  if (field === "price.UK-LT" || field === "price.LT-UK") {
    if (value === null) {
      return false;
    }
    target.item.price[field === "price.UK-LT" ? "UK-LT" : "LT-UK"] = value;
    return true;
  }
  if (target.kind !== "variant") {
    return false;
  }
  target.item[field] = value;
  return true;
}
