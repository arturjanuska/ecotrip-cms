import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { msg } from "@/lib/i18n/translate";
import { sampleCatalog } from "@/lib/price-test-data";
import type {
  Category,
  FixedPricing,
  MeasuredPricing,
} from "@/lib/price-types";
import {
  catalogSchema,
  categorySchema,
  importBodySchema,
  putCategoryBodySchema,
} from "@/lib/validation/price";

function messages(value: unknown) {
  const result = categorySchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

function automotive() {
  return sampleCatalog()[1];
}

function shipments() {
  return sampleCatalog()[0];
}

describe("categorySchema", () => {
  it("has the Category shape", () => {
    // Compile-time check: npm run typecheck fails when the schema and
    // lib/price-types.ts drift apart.
    const fromSchema: Category = sampleCatalog()[0] as z.output<
      typeof categorySchema
    >;
    const toSchema: z.output<typeof categorySchema> = fromSchema;
    expect(toSchema).toBe(fromSchema);
  });

  it("accepts the sample catalog", () => {
    expect(catalogSchema.safeParse(sampleCatalog()).success).toBe(true);
  });

  it("drops unknown fields such as _id", () => {
    const parsed = categorySchema.parse({
      ...automotive(),
      _id: "x",
      updatedAt: "y",
    });
    expect(parsed).not.toHaveProperty("_id");
  });

  it("rejects a repeated size and specification", () => {
    const category = automotive();
    const pricing = category.subCategories[0].pricing as FixedPricing;
    pricing.variants[1].specification = pricing.variants[0].specification;
    pricing.variants[1].sheet.spec = "Other text";
    expect(messages(category)).toContain("validation.variantRepeats");
  });

  it.each([0, -5])("rejects price %d", (price) => {
    const category = automotive();
    (category.subCategories[0].pricing as FixedPricing).variants[0].price[
      "UK-LT"
    ] = price;
    expect(messages(category)).not.toEqual([]);
  });

  it("rejects tiers out of order and an open tier before the last", () => {
    const outOfOrder = shipments();
    const tiers = (outOfOrder.pricing as MeasuredPricing).byWeight!;
    tiers[1].upTo = 10;
    expect(messages(outOfOrder)).toContain("validation.tiersAscending");

    const openFirst = shipments();
    (openFirst.pricing as MeasuredPricing).byWeight![0].upTo = null;
    expect(messages(openFirst)).toContain("validation.onlyLastTierOpen");
  });

  it("rejects measured pricing without tiers", () => {
    const category = shipments();
    (category.pricing as MeasuredPricing).byWeight = null;
    expect(messages(category)).toContain("validation.weightOrVolumeTiers");
  });

  it("rejects pricing next to subcategories, and neither", () => {
    expect(
      messages({ ...automotive(), pricing: { type: "callManager" } }),
    ).toContain("validation.subcategoriesOrPricing");
    expect(messages({ ...shipments(), pricing: null })).toContain(
      "validation.subcategoriesOrPricing",
    );
  });

  it("rejects a repeated spreadsheet row", () => {
    const category = automotive();
    const pricing = category.subCategories[0].pricing as FixedPricing;
    pricing.variants[1].sheet = {
      type: "ratų komplektas",
      size: "<R16 ",
      spec: "be padangų",
    };
    expect(messages(category)).toContain(
      msg("validation.sheetRowRepeats", {
        row: "ratų komplektas · <R16 · be padangų",
      }),
    );
  });

  it("rejects a repeated category", () => {
    const [first] = sampleCatalog();
    expect(catalogSchema.safeParse([first, first]).success).toBe(false);
  });

  it("rejects two categories with the same spreadsheet name", () => {
    const [shipments, automotive] = sampleCatalog();
    const result = catalogSchema.safeParse([
      shipments,
      { ...automotive, sheet: " SIUNTOS " },
    ]);
    expect(
      result.success ? [] : result.error.issues.map((issue) => issue.message),
    ).toContain('validation.sheetCategoryRepeats {"sheet":"siuntos"}');
  });
});

describe("request bodies", () => {
  it("needs an ISO date in PUT", () => {
    expect(
      putCategoryBodySchema.safeParse({
        category: automotive(),
        updatedAt: "yesterday",
      }).success,
    ).toBe(false);
    expect(
      putCategoryBodySchema.safeParse({
        category: automotive(),
        updatedAt: "2026-10-11T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts import changes with known fields only", () => {
    const change = {
      category: "automotiveGoods",
      sheet: { type: "Ratų komplektas", size: "<R16", spec: "Be padangų" },
      field: "volume",
      from: 0.08,
      to: 0.09,
    };
    expect(importBodySchema.safeParse({ changes: [change] }).success).toBe(
      true,
    );
    expect(
      importBodySchema.safeParse({ changes: [{ ...change, field: "upTo" }] })
        .success,
    ).toBe(false);
    expect(importBodySchema.safeParse({ changes: [] }).success).toBe(false);
  });
});
