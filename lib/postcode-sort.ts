// Columns of the postcodes table that can be sorted. Without a sort the list
// keeps its default order: by postcode.
export const SORT_FIELDS = [
  "postcode",
  "town",
  "additionalCharges",
  "isParcelForce",
  "parcelForceZone",
  "discount",
  "calendar",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type PostcodeSort = {
  field: SortField;
  direction: SortDirection;
} | null;

// Stored as strings, but compared as numbers: "-5" < "0" < "15" < "100".
export const NUMERIC_SORT_FIELDS: readonly SortField[] = [
  "additionalCharges",
  "discount",
];

// A header click cycles ascending, descending, then back to the default order.
// Another column starts again from ascending.
export function nextSort(
  current: PostcodeSort,
  field: SortField,
): PostcodeSort {
  if (current?.field !== field) {
    return { field, direction: "asc" };
  }
  return current.direction === "asc" ? { field, direction: "desc" } : null;
}

// Query parameters for GET /api/postcodes; the default order sends none.
export function sortToParams(sort: PostcodeSort): Record<string, string> {
  return sort ? { sort: sort.field, order: sort.direction } : {};
}
