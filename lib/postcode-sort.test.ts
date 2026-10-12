import { describe, expect, it } from "vitest";
import { nextSort, sortToParams } from "@/lib/postcode-sort";

describe("nextSort", () => {
  it("cycles ascending, descending, then the default order", () => {
    const asc = nextSort(null, "town");
    expect(asc).toEqual({ field: "town", direction: "asc" });
    const desc = nextSort(asc, "town");
    expect(desc).toEqual({ field: "town", direction: "desc" });
    expect(nextSort(desc, "town")).toBe(null);
  });

  it("starts another column from ascending", () => {
    expect(nextSort({ field: "town", direction: "desc" }, "discount")).toEqual({
      field: "discount",
      direction: "asc",
    });
  });
});

describe("sortToParams", () => {
  it("sends nothing for the default order", () => {
    expect(sortToParams(null)).toEqual({});
  });

  it("sends the column and direction", () => {
    expect(sortToParams({ field: "calendar", direction: "desc" })).toEqual({
      sort: "calendar",
      order: "desc",
    });
  });
});
