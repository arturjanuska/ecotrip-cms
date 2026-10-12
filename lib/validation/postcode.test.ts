import { describe, expect, it } from "vitest";
import {
  bulkUpdateSchema,
  createPostcodeSchema,
  listQuerySchema,
  updatePostcodeSchema,
} from "@/lib/validation/postcode";

describe("listQuerySchema", () => {
  it("applies defaults", () => {
    expect(listQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 50,
      active: true,
    });
  });

  it("parses query string values", () => {
    expect(
      listQuerySchema.parse({ page: "3", limit: "100", active: "false" }),
    ).toEqual({ page: 3, limit: 100, active: false });
  });

  it("caps limit at 500", () => {
    expect(listQuerySchema.parse({ limit: "501" }).limit).toBe(500);
  });

  it("returns active and deleted records for active=all", () => {
    expect(listQuerySchema.parse({ active: "all" }).active).toBe(undefined);
  });

  it("accepts a sort column and direction", () => {
    expect(
      listQuerySchema.parse({ sort: "discount", order: "desc" }),
    ).toMatchObject({ sort: "discount", order: "desc" });
  });

  it("rejects an unknown sort column", () => {
    expect(listQuerySchema.safeParse({ sort: "region" }).success).toBe(false);
  });

  it("normalizes the postcode prefix", () => {
    expect(listQuerySchema.parse({ postcode: " m4 " }).postcode).toBe("M4");
  });

  it("maps the empty filter to an empty string", () => {
    const query = listQuerySchema.parse({
      calendar: "none",
      parcelForceZone: "none",
    });
    expect(query.calendar).toBe("");
    expect(query.parcelForceZone).toBe("");
  });

  it("passes allowed filter values through", () => {
    const query = listQuerySchema.parse({
      calendar: "Even",
      parcelForceZone: "Zone 2",
    });
    expect(query.calendar).toBe("Even");
    expect(query.parcelForceZone).toBe("Zone 2");
  });

  it.each([
    { limit: "0" },
    { limit: "" },
    { limit: "abc" },
    { page: "0" },
    { page: "1.5" },
    { active: "maybe" },
    { postcode: "M4.*" },
    { postcode: "" },
    { postcode: "ABCDEFGHI" },
    { calendar: "odd" },
    { calendar: "" },
    { parcelForceZone: "Zone 4" },
  ])("rejects %j", (query) => {
    expect(listQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("createPostcodeSchema", () => {
  it("normalizes the postcode and fills defaults", () => {
    expect(
      createPostcodeSchema.parse({
        postcode: " m46 ",
        town: " Pemberton ",
        country: "ENG",
      }),
    ).toEqual({
      postcode: "M46",
      town: "Pemberton",
      country: "ENG",
      region: "",
      countryString: "",
      basicPrice: "",
      additionalCharges: "0",
      isParcelForce: false,
      parcelForceZone: "",
      discount: "0",
      calendar: "",
      active: true,
    });
  });

  it.each(["postcode", "town", "country"])("requires %s", (field) => {
    const input: Record<string, string> = {
      postcode: "M46",
      town: "Pemberton",
      country: "ENG",
    };
    input[field] = "  ";
    expect(createPostcodeSchema.safeParse(input).success).toBe(false);
  });

  it("drops unknown fields", () => {
    const result = createPostcodeSchema.parse({
      postcode: "M46",
      town: "Pemberton",
      country: "ENG",
      _id: "x",
      createdAt: "y",
    });
    expect(result).not.toHaveProperty("_id");
    expect(result).not.toHaveProperty("createdAt");
  });
});

describe("updatePostcodeSchema", () => {
  it("accepts a partial update", () => {
    expect(updatePostcodeSchema.parse({ calendar: "Even" })).toEqual({
      calendar: "Even",
    });
  });

  it.each([
    ["an empty body", {}],
    ["only unknown fields", { foo: "bar" }],
    ["a blank town", { town: "   " }],
    ["calendar outside the list", { calendar: "odd" }],
    ["parcelForceZone outside the list", { parcelForceZone: "Zone 4" }],
    ["discount above 100", { discount: "101" }],
    ["discount as a number", { discount: 10 }],
    ["active as a string", { active: "false" }],
  ])("rejects %s", (_name, input) => {
    expect(updatePostcodeSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    { calendar: "" },
    { parcelForceZone: "Zone 3" },
    { discount: "7.5" },
    { discount: "" },
    { active: false },
  ])("accepts %j", (input) => {
    expect(updatePostcodeSchema.safeParse(input).success).toBe(true);
  });

  it("takes an empty discount or additional charges as 0", () => {
    expect(
      updatePostcodeSchema.parse({ discount: "", additionalCharges: " " }),
    ).toEqual({ discount: "0", additionalCharges: "0" });
  });
});

describe("bulkUpdateSchema", () => {
  const id = "6ac9a9213a671434070832bd";

  it("accepts ids with allowed changes", () => {
    expect(
      bulkUpdateSchema.parse({
        ids: [id],
        changes: { calendar: "Odd", active: false },
      }),
    ).toEqual({ ids: [id], changes: { calendar: "Odd", active: false } });
  });

  it("removes duplicate ids, ignoring case", () => {
    expect(
      bulkUpdateSchema.parse({
        ids: [id, id.toUpperCase()],
        changes: { discount: "5" },
      }).ids,
    ).toEqual([id]);
  });

  it("caps the number of ids", () => {
    const ids = Array.from({ length: 5001 }, (_, index) =>
      index.toString(16).padStart(24, "0"),
    );
    expect(
      bulkUpdateSchema.safeParse({ ids, changes: { calendar: "Odd" } }).success,
    ).toBe(false);
  });

  it.each([
    ["no ids", { ids: [], changes: { calendar: "Odd" } }],
    ["an invalid id", { ids: ["abc"], changes: { calendar: "Odd" } }],
    ["no changes", { ids: [id], changes: {} }],
    ["a field not allowed in bulk", { ids: [id], changes: { town: "X" } }],
    ["a postcode change", { ids: [id], changes: { postcode: "M1" } }],
    ["an invalid value", { ids: [id], changes: { discount: "150" } }],
    ["a missing changes object", { ids: [id] }],
  ])("rejects %s", (_name, input) => {
    expect(bulkUpdateSchema.safeParse(input).success).toBe(false);
  });
});
