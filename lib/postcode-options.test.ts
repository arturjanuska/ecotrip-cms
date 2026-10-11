import { describe, expect, it } from "vitest";
import { isValidDiscount, sanitizeDiscountInput } from "@/lib/postcode-options";

describe("isValidDiscount", () => {
  it.each(["", "0", "10", "7.5", "99.99", "100", "100.0", "0.5"])(
    "accepts %j",
    (value) => {
      expect(isValidDiscount(value)).toBe(true);
    },
  );

  it.each(["100.1", "101", "-5", "7.", ".5", "7,5", "1e2", "abc", "10%", " 5"])(
    "rejects %j",
    (value) => {
      expect(isValidDiscount(value)).toBe(false);
    },
  );
});

describe("sanitizeDiscountInput", () => {
  it.each([
    ["1a2%b", "12"],
    ["7,5", "7.5"],
    ["7.5.3", "7.53"],
    [".5", "0.5"],
    ["12abc.5x", "12.5"],
    ["-3", "3"],
    ["", ""],
  ])("turns %j into %j", (raw, expected) => {
    expect(sanitizeDiscountInput(raw)).toBe(expected);
  });
});
