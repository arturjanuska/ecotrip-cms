import { describe, expect, it } from "vitest";
import {
  applyDrafts,
  cellKey,
  cellText,
  parseCellNumber,
  pruneDrafts,
  setDraft,
} from "@/lib/price-drafts";
import { sampleCatalog } from "@/lib/price-test-data";
import type { FixedPricing, MeasuredPricing } from "@/lib/price-types";

const wheels = { type: "Ratų komplektas", size: "<R16", spec: "Be padangų" };
const firstTier = { type: "", size: "<15 kg", spec: "" };

describe("parseCellNumber", () => {
  it.each([
    ["66", 66],
    ["1,65", 1.65],
    [" 0.04 ", 0.04],
    ["", null],
    ["12a", "invalid"],
    ["-3", "invalid"],
  ])("reads %j as %j", (text, expected) => {
    expect(parseCellNumber(text)).toBe(expected);
  });

  it("writes null as an empty cell", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(0.08)).toBe("0.08");
  });
});

describe("setDraft", () => {
  it("keeps typed text and drops it when it equals the saved value", () => {
    const key = cellKey(wheels, "price.UK-LT");
    const typed = setDraft({}, key, "70", 66);
    expect(typed).toEqual({ [key]: "70" });
    expect(setDraft(typed, key, "66,0", 66)).toEqual({});
  });
});

describe("applyDrafts", () => {
  it("applies prices typed with a comma", () => {
    const [, automotive] = sampleCatalog();
    const applied = applyDrafts(automotive, {
      [cellKey(wheels, "price.LT-UK")]: "70,5",
    });
    expect(applied.cellErrors).toEqual({});
    expect(applied.formErrors).toEqual([]);
    expect(
      (applied.category.subCategories[0].pricing as FixedPricing).variants[0]
        .price,
    ).toEqual({
      "UK-LT": 66,
      "LT-UK": 70.5,
    });
    // The saved category is not touched.
    expect(
      (automotive.subCategories[0].pricing as FixedPricing).variants[0].price[
        "LT-UK"
      ],
    ).toBe(66);
  });

  it("clears volume and weight with an empty cell", () => {
    const [, automotive] = sampleCatalog();
    const applied = applyDrafts(automotive, {
      [cellKey(wheels, "volume")]: "",
    });
    expect(
      (applied.category.subCategories[0].pricing as FixedPricing).variants[0]
        .volume,
    ).toBeNull();
    expect(applied.formErrors).toEqual([]);
  });

  it("marks bad cells", () => {
    const [, automotive] = sampleCatalog();
    const price = cellKey(wheels, "price.UK-LT");
    const weight = cellKey(wheels, "weight");
    expect(
      applyDrafts(automotive, { [price]: "", [weight]: "x" }).cellErrors,
    ).toEqual({
      [price]: "Must be greater than 0",
      [weight]: "Not a number",
    });
  });

  it("edits tier limits and reports tiers that stop going up", () => {
    const [shipments] = sampleCatalog();
    const applied = applyDrafts(shipments, {
      [cellKey(firstTier, "upTo")]: "20",
    });
    expect(
      (applied.category.pricing as MeasuredPricing).byWeight?.[0].upTo,
    ).toBe(20);
    expect(applied.formErrors).toEqual([]);

    const open = applyDrafts(shipments, { [cellKey(firstTier, "upTo")]: "" });
    expect(open.formErrors).toEqual([
      "Only the last tier can have no upper limit",
    ]);
  });

  it("reports each form problem once", () => {
    const [shipments] = sampleCatalog();
    (shipments.pricing as MeasuredPricing).byWeight!.splice(1, 0, {
      sheet: { type: "", size: "<20 kg", spec: "" },
      upTo: 20,
      price: { "UK-LT": 48, "LT-UK": 48 },
      perUnit: false,
    });
    const applied = applyDrafts(shipments, {
      [cellKey(firstTier, "upTo")]: "",
      [cellKey({ type: "", size: "<20 kg", spec: "" }, "upTo")]: "",
    });
    expect(applied.formErrors).toEqual([
      "Only the last tier can have no upper limit",
    ]);
  });
});

describe("pruneDrafts", () => {
  it("keeps only drafts that differ from the saved category", () => {
    const [, automotive] = sampleCatalog();
    const same = cellKey(wheels, "price.UK-LT");
    const different = cellKey(wheels, "weight");
    const gone = cellKey(
      { type: "Ratų komplektas", size: "<R18", spec: "" },
      "weight",
    );
    expect(
      pruneDrafts(automotive, { [same]: "66", [different]: "30", [gone]: "1" }),
    ).toEqual({
      [different]: "30",
    });
  });
});
