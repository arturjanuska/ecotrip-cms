import { describe, expect, it } from "vitest";
import { applyImportChanges } from "@/lib/price-import";
import { sampleCatalog } from "@/lib/price-test-data";
import type { FixedPricing, PriceChange } from "@/lib/price-types";

const wheelsWithTires = {
  type: "Ratų komplektas",
  size: "<R16",
  spec: "Su padangomis",
};

function change(patch: Partial<PriceChange> = {}): PriceChange {
  return {
    category: "automotiveGoods",
    sheet: wheelsWithTires,
    field: "price.UK-LT",
    from: 77,
    to: 80,
    ...patch,
  };
}

describe("applyImportChanges", () => {
  it("changes a copy and returns only the changed categories", () => {
    const catalog = sampleCatalog();
    const outcome = applyImportChanges(catalog, [change()]);

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.updated.map((category) => category.value)).toEqual([
      "automotiveGoods",
    ]);
    const pricing = outcome.updated[0].subCategories[0].pricing as FixedPricing;
    expect(pricing.variants[1].price).toEqual({ "UK-LT": 80, "LT-UK": 77 });
    // The input is not touched.
    const original = catalog[1].subCategories[0].pricing as FixedPricing;
    expect(original.variants[1].price["UK-LT"]).toBe(77);
  });

  it("matches rows regardless of case and extra spaces", () => {
    const outcome = applyImportChanges(sampleCatalog(), [
      change({
        sheet: {
          type: " ratų  komplektas",
          size: "<r16",
          spec: "SU PADANGOMIS ",
        },
      }),
    ]);
    expect(outcome.conflicts).toEqual([]);
  });

  it("changes tier prices and variant volume", () => {
    const outcome = applyImportChanges(sampleCatalog(), [
      change({
        category: "shipments",
        sheet: { type: "", size: ">15 kg", spec: "" },
        field: "price.LT-UK",
        from: 1.65,
        to: 1.75,
      }),
      change({ field: "volume", from: 0.24, to: 0.25 }),
    ]);
    expect(outcome.conflicts).toEqual([]);
    expect(outcome.updated).toHaveLength(2);
  });

  it("applies nothing when one value changed since the preview", () => {
    const outcome = applyImportChanges(sampleCatalog(), [
      change({ field: "volume", from: 0.24, to: 0.25 }),
      change({ from: 70 }),
    ]);
    expect(outcome.updated).toEqual([]);
    expect(outcome.conflicts).toEqual([
      { change: change({ from: 70 }), reason: "stale" },
    ]);
  });

  it("reports unknown rows and fields a tier does not have", () => {
    const outcome = applyImportChanges(sampleCatalog(), [
      change({ sheet: { type: "Ratų komplektas", size: "<R18", spec: "" } }),
      change({ category: "removals" }),
      change({
        category: "shipments",
        sheet: { type: "", size: "<15 kg", spec: "" },
        field: "weight",
        from: null,
      }),
      change({ to: null }),
    ]);
    expect(outcome.conflicts.map((conflict) => conflict.reason)).toEqual([
      "not-found",
      "not-found",
      "invalid-field",
      "invalid-field",
    ]);
  });
});
