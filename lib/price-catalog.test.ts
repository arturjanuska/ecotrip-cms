import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diffPriceSheet } from "@/lib/price-diff";
import { parsePriceSheet } from "@/lib/price-sheet";
import type {
  Category,
  FixedPricing,
  MeasuredPricing,
} from "@/lib/price-types";
import { catalogSchema } from "@/lib/validation/price";

const catalog = JSON.parse(
  readFileSync(
    new URL("../scripts/data/price-catalog.json", import.meta.url),
    "utf8",
  ),
) as Category[];
const sheet = readFileSync(
  new URL("./__fixtures__/pricelist-2026-09-17.csv", import.meta.url),
  "utf8",
);

const category = (value: string) =>
  catalog.find((item) => item.value === value)!;
const fixedOf = (categoryValue: string, sub?: string) =>
  (sub
    ? category(categoryValue).subCategories.find((item) => item.value === sub)!
        .pricing
    : category(categoryValue).pricing) as FixedPricing;
const measuredOf = (categoryValue: string, sub?: string) =>
  (sub
    ? category(categoryValue).subCategories.find((item) => item.value === sub)!
        .pricing
    : category(categoryValue).pricing) as MeasuredPricing;

describe("price catalog", () => {
  it("passes the schema", () => {
    expect(catalogSchema.safeParse(catalog).success).toBe(true);
  });

  it("keeps the category order of the spreadsheet", () => {
    expect(catalog.map((item) => item.value)).toEqual([
      "shipments",
      "automotiveGoods",
      "householdAppliances",
      "bicyclesAndScooters",
      "motorcyclesAndAccessories",
      "palettes",
      "removals",
      "flatScreenTv",
      "goodsForChildren",
      "gardenEquipment",
    ]);
  });

  it("matches the 2026-09-17 spreadsheet except the two fixed gearbox volumes", () => {
    const parsed = parsePriceSheet(sheet);
    const diff = diffPriceSheet(catalog, parsed.rows);
    expect(diff.unknown).toEqual([]);
    expect(diff.missing).toEqual([]);
    expect(diff.errors).toEqual([]);
    expect(
      diff.changes.map(({ sheet, field, from, to }) => ({
        ...sheet,
        field,
        from,
        to,
      })),
    ).toEqual([
      {
        type: "Pavarų dėžė",
        size: "<2000 cm3",
        spec: "Mechaninė",
        field: "volume",
        from: 0.04,
        to: 0.4,
      },
      {
        type: "Pavarų dėžė",
        size: "<2500 cm3",
        spec: "Automatinė",
        field: "volume",
        from: 0.04,
        to: 0.4,
      },
    ]);
  });

  it("carries the agreed data fixes", () => {
    const minibus = fixedOf("automotiveGoods", "cover").variants.find(
      (v) => v.size?.value === "minibuses",
    )!;
    expect(minibus.price).toEqual({ "UK-LT": 90, "LT-UK": 90 });

    expect(
      fixedOf("householdAppliances", "stove").variants.map((v) => [
        v.size?.value,
        v.price["LT-UK"],
      ]),
    ).toEqual([
      ["built-in", 65],
      ["freestanding", 80],
      ["withBurners", 100],
    ]);

    // Sizes keep the old site's texts (lib/price-legacy-sizes.ts).
    expect(fixedOf("automotiveGoods", "engine").variants[0].size).toEqual({
      value: ">1000 cm3",
      label: ">1000 cm3",
    });

    const wheelSizes = fixedOf("automotiveGoods", "setOfWheels").variants.map(
      (v) => v.size?.label,
    );
    expect([...new Set(wheelSizes)]).toEqual([
      "<R16",
      "R16 - R18",
      "R19 - R22",
      ">R22",
    ]);

    const chopper = fixedOf("motorcyclesAndAccessories", "chopper").variants.at(
      -1,
    )!;
    expect(chopper.sheet.size).toBe("1200 cm3");
    expect(chopper.size?.label).toBe(">1200 cm3");

    const umbrella = fixedOf("goodsForChildren", "strollers").variants.find(
      (v) => v.size?.value === "umbrella",
    )!;
    expect(umbrella.volume).toBe(0.08);

    expect(
      category("goodsForChildren").subCategories.map((sub) => sub.value),
    ).toEqual(["childSeat", "strollers"]);
  });

  it("describes formula prices as tiers", () => {
    const shipments = measuredOf("shipments");
    expect(
      shipments.byWeight?.map((t) => [t.upTo, t.price["UK-LT"], t.perUnit]),
    ).toEqual([
      [1, 35, false],
      [15, 45, false],
      [30, 50, false],
      [null, 1.65, true],
    ]);
    expect(shipments.byVolume?.map((t) => [t.upTo, t.price["LT-UK"]])).toEqual([
      [0.16, 230],
      [0.31, 220],
      [0.47, 210],
      [0.63, 205],
      [null, 200],
    ]);
    expect(
      measuredOf("removals").byVolume?.map((t) => [t.upTo, t.price["LT-UK"]]),
    ).toEqual([
      [1, 200],
      [2, 185],
      [3, 170],
      [4, 160],
      [5, 150],
      [10, 130],
      [null, 115],
    ]);
    expect(measuredOf("householdAppliances", "fridge").byVolume).toEqual([
      {
        sheet: { type: "Šaldytuvas", size: "Išmatavimai", spec: "" },
        upTo: null,
        price: { "UK-LT": 200, "LT-UK": 200 },
        perUnit: true,
      },
    ]);
    expect(category("palettes").pricing).toEqual({ type: "callManager" });
  });
});
