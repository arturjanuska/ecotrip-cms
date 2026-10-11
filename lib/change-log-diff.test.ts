import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  diffFees,
  diffPostcode,
  diffPriceCategory,
} from "@/lib/change-log-diff";
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
  additionalCharges: "Parcel force pricelist",
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
      { record: "FY1", field: "discount", from: "", to: "5" },
      { record: "FY1", field: "calendar", from: "Odd", to: "Even" },
    ]);
  });

  it("lists the filled fields of a new postcode", () => {
    const changes = diffPostcode(null, postcode);
    expect(changes.map((change) => change.field)).toEqual([
      "postcode",
      "region",
      "country",
      "countryString",
      "basicPrice",
      "additionalCharges",
      "parcelForceZone",
      "calendar",
      "active",
    ]);
    expect(changes[0]).toEqual({
      record: "FY1",
      field: "postcode",
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
        field: "Weight (kg)",
        from: 28,
        to: 29,
      },
      {
        record: "Ratų komplektas / <R16 / Be padangų",
        field: "UK→LT (£)",
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
      { record: "<4 m3", field: "Up to", from: 4, to: 4.5 },
    ]);
  });

  it("gives nothing for an unchanged category", () => {
    expect(diffPriceCategory(wheels, structuredClone(wheels))).toEqual([]);
  });
});

describe("diffFees", () => {
  it("names the group and the field", () => {
    const edited = structuredClone(INITIAL_FEE_SETTINGS);
    edited.purchaseService.clientMoney.max = 60;
    edited.parcelForce.zones[1].fee = 20;

    expect(diffFees(INITIAL_FEE_SETTINGS, edited)).toEqual([
      {
        record: "Purchase service · Client's money",
        field: "Max",
        from: 50,
        to: 60,
      },
      {
        record: "ParcelForce · Zones · Zone 2",
        field: "Fee",
        from: 19,
        to: 20,
      },
    ]);
  });

  it("lists added and removed rows", () => {
    const edited = structuredClone(INITIAL_FEE_SETTINGS);
    edited.quantityDiscounts.pop();
    edited.parcelForce.medium.tiers.push({ upToWeight: 30, fee: 15 });

    expect(diffFees(INITIAL_FEE_SETTINGS, edited)).toEqual([
      {
        record: "ParcelForce · Medium parcel · Tier · row 4",
        field: "Up to (kg)",
        from: null,
        to: 30,
      },
      {
        record: "ParcelForce · Medium parcel · Tier · row 4",
        field: "Fee",
        from: null,
        to: 15,
      },
      {
        record: "Quantity discounts · row 5",
        field: "From parcels",
        from: 5,
        to: null,
      },
      {
        record: "Quantity discounts · row 5",
        field: "Percent",
        from: 15,
        to: null,
      },
    ]);
  });

  it("ignores ids and timestamps of a stored document", () => {
    const stored = { ...INITIAL_FEE_SETTINGS, _id: "x", updatedAt: "y" };
    expect(diffFees(stored, INITIAL_FEE_SETTINGS)).toEqual([]);
  });
});
