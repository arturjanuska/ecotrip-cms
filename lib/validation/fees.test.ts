import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { FeeSettings } from "@/lib/fee-types";
import { feeSettingsSchema, putFeesBodySchema } from "@/lib/validation/fees";
import { INITIAL_FEE_SETTINGS } from "@/scripts/data/fee-settings";

function initial(): FeeSettings {
  return structuredClone(INITIAL_FEE_SETTINGS);
}

// "path: message" of every issue, so tests check where an error points.
function issues(value: unknown) {
  const result = feeSettingsSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      );
}

describe("feeSettingsSchema", () => {
  it("has the FeeSettings shape", () => {
    // Compile-time check: npm run typecheck fails when the schema and
    // lib/fee-types.ts drift apart.
    const fromSchema: FeeSettings = initial() as z.output<
      typeof feeSettingsSchema
    >;
    const toSchema: z.output<typeof feeSettingsSchema> = fromSchema;
    expect(toSchema).toBe(fromSchema);
  });

  it("accepts the initial values", () => {
    expect(issues(initial())).toEqual([]);
  });

  it("rejects unknown fields at any depth", () => {
    expect(issues({ ...initial(), _id: "x" })).toHaveLength(1);

    const settings = initial();
    Object.assign(settings.purchaseService.ownMoney, { extra: 1 });
    expect(issues(settings)).toEqual([
      expect.stringMatching(/^purchaseService\.ownMoney: /),
    ]);
  });

  it("rejects negative money and infinite numbers", () => {
    const settings = initial();
    settings.addressService.fee = -1;
    settings.parcelForce.zones[1].fee = Infinity;
    expect(issues(settings)).toEqual([
      "addressService.fee: validation.nonNegative",
      expect.stringMatching(/^parcelForce\.zones\.1\.fee: /),
    ]);
  });

  it.each([-1, 101])("rejects percent %d", (percent) => {
    const settings = initial();
    settings.salesService.percent = percent;
    settings.quantityDiscounts[2].percent = percent;
    expect(issues(settings)).toEqual([
      "salesService.percent: validation.percentRange",
      "quantityDiscounts.2.percent: validation.percentRange",
    ]);
  });

  it("accepts open bounds and percent 0 and 100", () => {
    const settings = initial();
    settings.salesService = { percent: 100, min: null, max: null };
    settings.purchaseService.ownMoney = { percent: 0, min: 0, max: 0 };
    expect(issues(settings)).toEqual([]);
  });

  it("rejects min above max and negative bounds", () => {
    const settings = initial();
    settings.purchaseService.clientMoney.min = 60;
    settings.salesService.max = -5;
    expect(issues(settings)).toEqual([
      "purchaseService.clientMoney.max: validation.maxBelowMin",
      "salesService.max: validation.nonNegative",
    ]);
  });

  it("rejects a threshold of 0", () => {
    const settings = initial();
    settings.purchaseService.threshold = 0;
    expect(issues(settings)).toEqual([
      "purchaseService.threshold: validation.positive",
    ]);
  });

  it("rejects ParcelForce sizes and weights of 0", () => {
    const settings = initial();
    settings.parcelForce.small.maxSide = 0;
    settings.parcelForce.small.maxWeight = 0;
    settings.parcelForce.medium.maxSide = 0;
    settings.parcelForce.medium.tiers[0].upToWeight = 0;
    expect(issues(settings)).toEqual([
      "parcelForce.small.maxSide: validation.positive",
      "parcelForce.small.maxWeight: validation.positive",
      "parcelForce.medium.maxSide: validation.positive",
      "parcelForce.medium.tiers.0.upToWeight: validation.positive",
    ]);
  });

  it("rejects medium tiers out of order or missing", () => {
    const outOfOrder = initial();
    outOfOrder.parcelForce.medium.tiers[2].upToWeight = 10;
    expect(issues(outOfOrder)).toEqual([
      "parcelForce.medium.tiers.2.upToWeight: validation.tiersAscending",
    ]);

    const none = initial();
    none.parcelForce.medium.tiers = [];
    expect(issues(none)).toEqual([
      "parcelForce.medium.tiers: validation.addTier",
    ]);
  });

  it("rejects zones missing, repeated or out of order", () => {
    const message =
      'parcelForce.zones: validation.zonesOrder {"zones":"Zone 1, Zone 2, Zone 3"}';

    const missing = initial();
    missing.parcelForce.zones.pop();
    expect(issues(missing)).toEqual([message]);

    const swapped = initial();
    swapped.parcelForce.zones.reverse();
    expect(issues(swapped)).toEqual([message]);

    const repeated = initial();
    repeated.parcelForce.zones[2].zone = "Zone 2";
    expect(issues(repeated)).toEqual([message]);
  });

  it("rejects an unknown zone", () => {
    const settings = initial();
    (settings.parcelForce.zones[0] as { zone: string }).zone = "Zone 4";
    expect(issues(settings)).toContainEqual(
      expect.stringMatching(/^parcelForce\.zones\.0\.zone: /),
    );
  });

  it("rejects quantity discounts not starting from 1", () => {
    const settings = initial();
    settings.quantityDiscounts[0].fromParcels = 2;
    expect(issues(settings)).toContain(
      "quantityDiscounts.0.fromParcels: validation.firstRowFromOne",
    );
  });

  it("rejects quantity discounts out of order or fractional", () => {
    const outOfOrder = initial();
    outOfOrder.quantityDiscounts[3].fromParcels = 3;
    expect(issues(outOfOrder)).toEqual([
      "quantityDiscounts.3.fromParcels: validation.rowsAscending",
    ]);

    const fractional = initial();
    fractional.quantityDiscounts[4].fromParcels = 5.5;
    expect(issues(fractional)).toEqual([
      "quantityDiscounts.4.fromParcels: validation.wholeNumber",
    ]);
  });

  it("accepts one quantity discount row and rejects none", () => {
    const one = initial();
    one.quantityDiscounts = [{ fromParcels: 1, percent: 0 }];
    expect(issues(one)).toEqual([]);

    const none = initial();
    none.quantityDiscounts = [];
    expect(issues(none)).toEqual([
      "quantityDiscounts: validation.addDiscountRow",
    ]);
  });
});

describe("putFeesBodySchema", () => {
  const updatedAt = "2026-10-11T08:00:00.000Z";

  it("accepts settings and the version read", () => {
    expect(
      putFeesBodySchema.safeParse({ settings: initial(), updatedAt }).success,
    ).toBe(true);
  });

  it("rejects a missing or malformed version and unknown fields", () => {
    expect(putFeesBodySchema.safeParse({ settings: initial() }).success).toBe(
      false,
    );
    expect(
      putFeesBodySchema.safeParse({ settings: initial(), updatedAt: "today" })
        .success,
    ).toBe(false);
    expect(
      putFeesBodySchema.safeParse({ settings: initial(), updatedAt, _id: "x" })
        .success,
    ).toBe(false);
  });

  it("rejects the stored document as settings", () => {
    const stored = { ...initial(), _id: "x", createdAt: updatedAt, updatedAt };
    expect(
      putFeesBodySchema.safeParse({ settings: stored, updatedAt }).success,
    ).toBe(false);
  });
});
