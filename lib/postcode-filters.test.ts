import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  EMPTY_FILTER,
  filtersToParams,
  matchesFilters,
} from "@/lib/postcode-filters";

const item = {
  postcode: "M46",
  calendar: "Odd" as const,
  parcelForceZone: "Zone 1" as const,
  isParcelForce: true,
  active: true,
};

describe("filtersToParams", () => {
  it("sends only active=all by default: no filter", () => {
    expect(filtersToParams(DEFAULT_FILTERS)).toEqual({ active: "all" });
  });

  it("sends every filter that is set", () => {
    expect(
      filtersToParams({
        active: "all",
        isParcelForce: "no",
        postcode: " m4 ",
        calendar: EMPTY_FILTER,
        parcelForceZone: "Zone 2",
      }),
    ).toEqual({
      active: "all",
      postcode: "M4",
      calendar: "none",
      parcelForceZone: "Zone 2",
      isParcelForce: "false",
    });
  });

  it("matches the ParcelForce filter", () => {
    expect(
      matchesFilters(item, { ...DEFAULT_FILTERS, isParcelForce: "yes" }),
    ).toBe(true);
    expect(
      matchesFilters(item, { ...DEFAULT_FILTERS, isParcelForce: "no" }),
    ).toBe(false);
  });

  it("maps active=no to active=false", () => {
    expect(filtersToParams({ ...DEFAULT_FILTERS, active: "no" })).toEqual({
      active: "false",
    });
  });
});

describe("matchesFilters", () => {
  it("matches with default filters", () => {
    expect(matchesFilters(item, DEFAULT_FILTERS)).toBe(true);
  });

  it.each([
    [{ active: "no" as const }, false],
    [{ active: "all" as const }, true],
    [{ postcode: "M4" }, true],
    [{ postcode: "m4" }, true],
    [{ postcode: "M5" }, false],
    [{ calendar: "Odd" }, true],
    [{ calendar: "Even" }, false],
    [{ calendar: EMPTY_FILTER }, false],
    [{ parcelForceZone: "Zone 1" }, true],
    [{ parcelForceZone: "Zone 3" }, false],
  ])("%j -> %s", (patch, expected) => {
    expect(matchesFilters(item, { ...DEFAULT_FILTERS, ...patch })).toBe(
      expected,
    );
  });

  it("matches empty values with the empty filter", () => {
    expect(
      matchesFilters(
        { ...item, calendar: "" },
        { ...DEFAULT_FILTERS, calendar: EMPTY_FILTER },
      ),
    ).toBe(true);
  });
});
