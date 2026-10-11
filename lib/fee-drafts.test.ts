import { describe, expect, it } from "vitest";
import {
  applyForm,
  changedFields,
  formFields,
  setField,
  toForm,
} from "@/lib/fee-drafts";
import { INITIAL_FEE_SETTINGS } from "@/scripts/data/fee-settings";

const form = () => toForm(INITIAL_FEE_SETTINGS);

describe("toForm", () => {
  it("writes numbers as text, null as empty and keeps zone names", () => {
    const fields = formFields(form());
    expect(fields["purchaseService.ownMoney.max"]).toBe("");
    expect(fields["parcelForce.small.fee"]).toBe("4.19");
    expect(fields["parcelForce.zones.1.zone"]).toBe("Zone 2");
    expect(fields["quantityDiscounts.4.fromParcels"]).toBe("5");
  });

  it("leaves out _id and the timestamps", () => {
    const stored = {
      ...INITIAL_FEE_SETTINGS,
      _id: "x",
      createdAt: "2026-10-11T08:00:00.000Z",
      updatedAt: "2026-10-11T08:00:00.000Z",
    };
    expect(toForm(stored)).toEqual(form());
  });
});

describe("applyForm", () => {
  it("reads the initial form back as the initial settings", () => {
    expect(applyForm(form())).toEqual({
      settings: INITIAL_FEE_SETTINGS,
      fieldErrors: {},
      formErrors: [],
    });
  });

  it("reads a comma as the decimal point and empty bounds as null", () => {
    let next = setField(form(), ["parcelForce", "small", "fee"], "4,5");
    next = setField(next, ["salesService", "max"], " ");
    const { settings, fieldErrors } = applyForm(next);
    expect(fieldErrors).toEqual({});
    expect(settings.parcelForce.small.fee).toBe(4.5);
    expect(settings.salesService.max).toBeNull();
  });

  it("puts each error under its field", () => {
    let next = setField(form(), ["addressService", "fee"], "3a");
    next = setField(next, ["purchaseService", "threshold"], "");
    next = setField(next, ["salesService", "min"], "60");
    next = setField(next, ["quantityDiscounts", 2, "percent"], "120");
    expect(applyForm(next).fieldErrors).toEqual({
      "addressService.fee": "Not a number",
      "purchaseService.threshold": "Required",
      "salesService.max": "Max must not be below min",
      "quantityDiscounts.2.percent": "Must be from 0 to 100",
    });
  });

  it("puts list errors under the list", () => {
    const next = form();
    next.parcelForce.medium.tiers = [];
    expect(applyForm(next).fieldErrors).toEqual({
      "parcelForce.medium.tiers": "Add at least one weight tier",
    });
  });
});

describe("changedFields", () => {
  it("ignores text that reads as the saved number", () => {
    const next = setField(form(), ["parcelForce", "small", "fee"], "4,190");
    expect(changedFields(form(), next).size).toBe(0);
  });

  it("lists changed fields, added rows and removed rows", () => {
    const changed = setField(form(), ["salesService", "percent"], "3");
    expect([...changedFields(form(), changed)]).toEqual([
      "salesService.percent",
    ]);

    const added = form();
    added.quantityDiscounts.push({ fromParcels: "6", percent: "20" });
    expect([...changedFields(form(), added)]).toEqual([
      "quantityDiscounts.5.fromParcels",
      "quantityDiscounts.5.percent",
    ]);

    const removed = form();
    removed.parcelForce.medium.tiers.pop();
    expect([...changedFields(form(), removed)]).toEqual([
      "parcelForce.medium.tiers.2.upToWeight",
      "parcelForce.medium.tiers.2.fee",
    ]);
  });
});
