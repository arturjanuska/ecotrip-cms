import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyLegacySizes,
  LEGACY_SIZE_LABELS,
  legacySizeOption,
} from "@/lib/price-legacy-sizes";
import type { Category, FixedPricing } from "@/lib/price-types";
import { catalogSchema } from "@/lib/validation/price";

const catalog = JSON.parse(
  readFileSync(
    new URL("../scripts/data/price-catalog.json", import.meta.url),
    "utf8",
  ),
) as Category[];

// The catalog as generated before the legacy sizes: spreadsheet texts.
const withSheetSizes = (categories: Category[]) =>
  categories.map((category) => {
    const copy = structuredClone(category);
    for (const pricing of [
      copy.pricing,
      ...copy.subCategories.map((sub) => sub.pricing),
    ]) {
      if (pricing?.type !== "fixed") continue;
      for (const variant of pricing.variants) {
        const sub = copy.subCategories.find((s) => s.pricing === pricing);
        if (
          legacySizeOption(copy.value, sub?.value ?? null, variant.sheet.size)
        ) {
          variant.size = {
            value: variant.sheet.size,
            label: variant.sheet.size,
          };
        }
      }
    }
    return copy;
  });

describe("legacySizeOption", () => {
  it("gives the old site's text as value and label", () => {
    expect(legacySizeOption("automotiveGoods", "setOfWheels", "<R18")).toEqual({
      value: "R16 - R18",
      label: "R16 - R18",
    });
    expect(legacySizeOption("flatScreenTv", null, "<24 coliai")).toEqual({
      value: "<23 inch",
      label: "<23 inch",
    });
  });

  it("leaves sizes that already match alone", () => {
    expect(
      legacySizeOption("automotiveGoods", "setOfWheels", ">R22"),
    ).toBeUndefined();
  });

  it("never gives two sizes of one subcategory the same text", () => {
    for (const sizes of Object.values(LEGACY_SIZE_LABELS)) {
      const texts = Object.values(sizes);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });
});

describe("applyLegacySizes", () => {
  it("the generated catalog already has the old texts", () => {
    expect(applyLegacySizes(catalog).changes).toEqual([]);
  });

  it("updates a catalog with spreadsheet texts, once", () => {
    const stored = withSheetSizes(catalog);
    const first = applyLegacySizes(stored);

    expect(first.categories).toEqual(catalog);
    expect(first.changes).toHaveLength(69);
    expect(applyLegacySizes(first.categories).changes).toEqual([]);
    expect(catalogSchema.safeParse(first.categories).success).toBe(true);
  });

  it("does not change the input", () => {
    const stored = withSheetSizes(catalog);
    const before = structuredClone(stored);
    applyLegacySizes(stored);
    expect(stored).toEqual(before);
  });

  it("changes only the size of a variant", () => {
    const stored = withSheetSizes(catalog);
    const tv = (categories: Category[]) =>
      categories.find((c) => c.value === "flatScreenTv")!
        .pricing as FixedPricing;
    const after = tv(applyLegacySizes(stored).categories).variants[0];
    const before = tv(stored).variants[0];
    expect({ ...after, size: null }).toEqual({ ...before, size: null });
  });
});
