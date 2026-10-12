import { msg } from "@/lib/i18n/translate";

export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 500;

export const CALENDAR_VALUES = ["Odd", "Even"] as const;
export const PARCEL_FORCE_ZONES = ["Zone 1", "Zone 2", "Zone 3"] as const;

export const DISCOUNT_MIN = 0;
export const DISCOUNT_MAX = 100;
// A message (lib/i18n/translate.ts): the Zod error and the input's tooltip.
export const DISCOUNT_HINT = msg("validation.discountRange", {
  min: DISCOUNT_MIN,
  max: DISCOUNT_MAX,
});

// Discount is stored as a string: "" or a non-negative decimal like "10" or "7.5".
export function isValidDiscount(value: string) {
  if (value === "") {
    return true;
  }
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return false;
  }

  const number = Number(value);
  return number >= DISCOUNT_MIN && number <= DISCOUNT_MAX;
}

// Additional charges are stored as a string: "" or an amount the site adds to
// the order, like "15" or "-5". ParcelForce areas are marked by isParcelForce.
export const ADDITIONAL_CHARGES_HINT = "validation.additionalChargesNumber";

export function isValidAdditionalCharges(value: string) {
  return value === "" || /^-?\d+(\.\d+)?$/.test(value);
}

// Like sanitizeDiscountInput, and keeps a leading minus.
export function sanitizeAdditionalChargesInput(raw: string) {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("-");
  const number = sanitizeDiscountInput(trimmed);
  return negative ? `-${number}` : number;
}

// Keeps only what can be part of a decimal number while the user types.
export function sanitizeDiscountInput(raw: string) {
  const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  const normalized =
    firstDot === -1
      ? cleaned
      : cleaned.slice(0, firstDot + 1) +
        cleaned.slice(firstDot + 1).replace(/\./g, "");

  return normalized.startsWith(".") ? `0${normalized}` : normalized;
}
