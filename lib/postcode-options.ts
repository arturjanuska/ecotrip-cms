export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 500;

export const CALENDAR_VALUES = ["Odd", "Even"] as const;
export const PARCEL_FORCE_ZONES = ["Zone 1", "Zone 2", "Zone 3"] as const;

export const DISCOUNT_MIN = 0;
export const DISCOUNT_MAX = 100;
export const DISCOUNT_HINT = `Number from ${DISCOUNT_MIN} to ${DISCOUNT_MAX} (dot for decimals)`;

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
