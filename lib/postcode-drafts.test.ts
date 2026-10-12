import { describe, expect, it } from "vitest";
import {
  pruneDraft,
  pruneDrafts,
  validateDraft,
  withDraft,
} from "@/lib/postcode-drafts";
import type { Postcode } from "@/lib/postcode-types";
import { DISCOUNT_HINT } from "@/lib/postcode-options";

const item = {
  town: "Pemberton",
  region: "Wigan",
  countryString: "England",
  basicPrice: "Ecotrip pricelist",
  additionalCharges: "",
  isParcelForce: false,
  parcelForceZone: "Zone 1" as const,
  discount: "",
  calendar: "Odd" as const,
  active: true,
};

describe("pruneDraft", () => {
  it("keeps only fields that differ from the record", () => {
    expect(
      pruneDraft(item, { town: "Pemberton", region: "Leigh", active: true }),
    ).toEqual({ region: "Leigh" });
  });

  it("returns undefined when nothing differs", () => {
    expect(pruneDraft(item, { town: "Pemberton", active: true })).toBe(
      undefined,
    );
    expect(pruneDraft(item, undefined)).toBe(undefined);
  });

  it("keeps edits typed after Save was clicked", () => {
    // Saved town "Leigh"; meanwhile the user changed region too.
    const saved = { ...item, town: "Leigh" };
    expect(pruneDraft(saved, { town: "Leigh", region: "Bolton" })).toEqual({
      region: "Bolton",
    });
  });
});

describe("withDraft", () => {
  it("sets and removes a draft", () => {
    const drafts = withDraft({}, "a", { town: "X" });
    expect(drafts).toEqual({ a: { town: "X" } });
    expect(withDraft(drafts, "a", undefined)).toEqual({});
  });
});

describe("validateDraft", () => {
  it("accepts valid changes", () => {
    expect(validateDraft({ discount: "12.5", calendar: "Even" })).toBe(null);
  });

  it("reports invalid fields", () => {
    const problems = validateDraft({ town: " ", discount: "150" });
    expect(problems?.fields).toEqual(new Set(["town", "discount"]));
    expect(problems?.issues).toEqual([
      { field: "town", message: "validation.required" },
      { field: "discount", message: DISCOUNT_HINT },
    ]);
  });
});

describe("pruneDrafts", () => {
  const record = {
    ...item,
    _id: "a",
    postcode: "M46",
    country: "ENG",
    createdAt: "",
    updatedAt: "",
  } satisfies Postcode;

  it("drops draft fields that now match the loaded record", () => {
    const drafts = {
      a: { calendar: "Odd", region: "Leigh" },
      b: { town: "Y" },
    };
    expect(pruneDrafts(drafts, [record])).toEqual({
      a: { region: "Leigh" },
      b: { town: "Y" },
    });
  });

  it("removes a draft that fully matches", () => {
    expect(pruneDrafts({ a: { calendar: "Odd" } }, [record])).toEqual({});
  });

  it("returns the same object when nothing changes", () => {
    const drafts = { a: { region: "Leigh" } };
    expect(pruneDrafts(drafts, [record])).toBe(drafts);
  });
});
