import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bulkSummary,
  diffDateOverride,
  diffFees,
  diffPostcode,
  diffPriceCategory,
} from "@/lib/change-log-diff";
import type { DateOverride } from "@/lib/date-override-types";
import type { Category } from "@/lib/price-types";
import { INITIAL_FEE_SETTINGS } from "../scripts/data/fee-settings";

const catalog = JSON.parse(
  readFileSync(
    new URL("../scripts/data/price-catalog.json", import.meta.url),
    "utf8",
  ),
) as Category[];

const postcode = {
  postcode: "FY1",
  town: "",
  region: "Blackpool",
  country: "ENG",
  countryString: "England",
  basicPrice: "Ecotrip pricelist",
  additionalCharges: "",
  isParcelForce: true,
  parcelForceZone: "Zone 1",
  discount: "",
  calendar: "Odd",
  active: true,
};

describe("diffPostcode", () => {
  it("lists the changed fields", () => {
    expect(
      diffPostcode(postcode, { ...postcode, calendar: "Even", discount: "5" }),
    ).toEqual([
      { record: "FY1", field: "postcode.discount", from: "", to: "5" },
      { record: "FY1", field: "postcode.calendar", from: "Odd", to: "Even" },
    ]);
  });

  it("lists the filled fields of a new postcode", () => {
    const changes = diffPostcode(null, postcode);
    expect(changes.map((change) => change.field)).toEqual([
      "postcode.postcode",
      "postcode.region",
      "postcode.country",
      "postcode.countryString",
      "postcode.basicPrice",
      "postcode.isParcelForce",
      "postcode.parcelForceZone",
      "postcode.calendar",
      "postcode.active",
    ]);
    expect(changes[0]).toEqual({
      record: "FY1",
      field: "postcode.postcode",
      from: null,
      to: "FY1",
    });
  });

  it("ignores ids and timestamps and gives nothing for no change", () => {
    expect(
      diffPostcode(
        { ...postcode, _id: "a", updatedAt: "x" } as typeof postcode,
        { ...postcode, _id: "a", updatedAt: "y" } as typeof postcode,
      ),
    ).toEqual([]);
  });
});

describe("diffPriceCategory", () => {
  const wheels = catalog.find((c) => c.value === "automotiveGoods")!;

  it("lists changed numbers by spreadsheet row", () => {
    const edited = structuredClone(wheels);
    const variant =
      edited.subCategories[0].pricing.type === "fixed"
        ? edited.subCategories[0].pricing.variants[0]
        : null;
    variant!.price["UK-LT"] = 70;
    variant!.weight = 29;

    expect(diffPriceCategory(wheels, edited)).toEqual([
      {
        record: "Ratų komplektas / <R16 / Be padangų",
        field: "price.weight",
        from: 28,
        to: 29,
      },
      {
        record: "Ratų komplektas / <R16 / Be padangų",
        field: "price.UK-LT",
        from: 66,
        to: 70,
      },
    ]);
  });

  it("lists a changed tier limit", () => {
    const removals = catalog.find((c) => c.value === "removals")!;
    const edited = structuredClone(removals);
    if (edited.pricing?.type === "measured") {
      edited.pricing.byVolume![3].upTo = 4.5;
    }
    expect(diffPriceCategory(removals, edited)).toEqual([
      { record: "<4 m3", field: "price.upTo", from: 4, to: 4.5 },
    ]);
  });

  it("gives nothing for an unchanged category", () => {
    expect(diffPriceCategory(wheels, structuredClone(wheels))).toEqual([]);
  });
});

describe("diffFees", () => {
  it("names the group and the field by message keys", () => {
    const edited = structuredClone(INITIAL_FEE_SETTINGS);
    edited.purchaseService.clientMoney.max = 60;
    edited.parcelForce.zones[1].fee = 20;

    expect(diffFees(INITIAL_FEE_SETTINGS, edited)).toEqual([
      {
        record: ["fees.purchaseService", "fees.clientMoney"],
        field: "fees.max",
        from: 50,
        to: 60,
      },
      {
        record: ["fees.parcelForce", "fees.zones", "Zone 2"],
        field: "fees.fee",
        from: 19,
        to: 20,
      },
    ]);
  });

  it("lists added and removed rows, numbered from 1", () => {
    const edited = structuredClone(INITIAL_FEE_SETTINGS);
    edited.quantityDiscounts.pop();
    edited.parcelForce.medium.tiers.push({ upToWeight: 30, fee: 15 });

    const tier = [
      "fees.parcelForce",
      "fees.medium",
      "fees.tiers",
      'fees.row {"n":4}',
    ];
    const discount = ["fees.quantityDiscounts", 'fees.row {"n":5}'];
    expect(diffFees(INITIAL_FEE_SETTINGS, edited)).toEqual([
      { record: tier, field: "fees.upToWeight", from: null, to: 30 },
      { record: tier, field: "fees.fee", from: null, to: 15 },
      { record: discount, field: "fees.fromParcels", from: 5, to: null },
      { record: discount, field: "fees.percent", from: 15, to: null },
    ]);
  });

  it("ignores ids and timestamps of a stored document", () => {
    const stored = { ...INITIAL_FEE_SETTINGS, _id: "x", updatedAt: "y" };
    expect(diffFees(stored, INITIAL_FEE_SETTINGS)).toEqual([]);
  });
});

describe("bulkSummary", () => {
  it("carries the count and every field with its value", () => {
    expect(
      bulkSummary(3, { calendar: "Even", discount: "", active: false }),
    ).toEqual({
      key: "log.bulkEditedPostcodes",
      params: {
        count: 3,
        changes: [
          {
            key: "log.setTo",
            params: { field: { key: "postcode.calendar" }, value: "Even" },
          },
          {
            key: "log.setTo",
            params: {
              field: { key: "postcode.discount" },
              value: { key: "log.empty" },
            },
          },
          {
            key: "log.setTo",
            params: {
              field: { key: "postcode.active" },
              value: { key: "log.false" },
            },
          },
        ],
      },
    });
  });
});

describe("diffDateOverride", () => {
  const december: DateOverride = {
    direction: "LT-UK",
    year: 2026,
    month: 12,
    trips: [
      {
        pickup: { from: "2026-12-01", to: "2026-12-02" },
        delivery: { from: "2026-12-04", to: "2026-12-06" },
      },
      {
        pickup: { from: "2026-12-08", to: "2026-12-09" },
        delivery: { from: "2026-12-11", to: "2026-12-13" },
      },
    ],
  };

  it("lists a new month's trips", () => {
    expect(diffDateOverride(null, december)).toEqual([
      { record: "LT-UK 2026-12", field: "dates.tripCount", from: null, to: 2 },
      {
        record: "LT-UK 2026-12",
        field: "dates.trip",
        from: null,
        to: "2026-12-01 – 2026-12-02 → 2026-12-04 – 2026-12-06",
      },
      {
        record: "LT-UK 2026-12",
        field: "dates.trip",
        from: null,
        to: "2026-12-08 – 2026-12-09 → 2026-12-11 – 2026-12-13",
      },
    ]);
  });

  it("records only the trips that changed", () => {
    const after = structuredClone(december);
    after.trips[1].delivery.to = "2026-12-12";
    expect(diffDateOverride(december, after)).toEqual([
      {
        record: "LT-UK 2026-12",
        field: "dates.trip",
        from: "2026-12-08 – 2026-12-09 → 2026-12-11 – 2026-12-13",
        to: "2026-12-08 – 2026-12-09 → 2026-12-11 – 2026-12-12",
      },
    ]);
    expect(diffDateOverride(december, structuredClone(december))).toEqual([]);

    const parcelForce = structuredClone(december);
    parcelForce.trips[0] = {
      ...parcelForce.trips[0],
      parcelForceDelivery: { from: "2026-12-10", to: "2026-12-11" },
    };
    expect(diffDateOverride(december, parcelForce)[0].to).toBe(
      "2026-12-01 – 2026-12-02 → 2026-12-04 – 2026-12-06 (ParcelForce 2026-12-10 – 2026-12-11)",
    );
  });

  it("logs a deleted month, also one with no trips", () => {
    const empty = { ...december, trips: [] };
    expect(diffDateOverride(empty, null)).toEqual([
      { record: "LT-UK 2026-12", field: "dates.tripCount", from: 0, to: null },
    ]);
  });
});
