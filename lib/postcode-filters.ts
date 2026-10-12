import type { Postcode } from "@/lib/postcode-types";

// Filter value that selects records where the field is empty ("" means "any").
export const EMPTY_FILTER = "none";

// Filter by the `active` flag: only active, only inactive (soft-deleted), or both.
export const ACTIVE_FILTERS = ["yes", "no", "all"] as const;
export type ActiveFilter = (typeof ACTIVE_FILTERS)[number];

// Filter by isParcelForce: "" any, "yes" or "no".
export const PARCEL_FORCE_FILTERS = ["", "yes", "no"] as const;
export type ParcelForceFilter = (typeof PARCEL_FORCE_FILTERS)[number];

export type PostcodeFilters = {
  active: ActiveFilter;
  isParcelForce: ParcelForceFilter;
  // Prefix of the postcode: "M4" matches M4, M40, M46...
  postcode: string;
  // "", EMPTY_FILTER, or one of the allowed values.
  calendar: string;
  parcelForceZone: string;
};

export const DEFAULT_FILTERS: PostcodeFilters = {
  active: "yes",
  isParcelForce: "",
  postcode: "",
  calendar: "",
  parcelForceZone: "",
};

// Query parameters for GET /api/postcodes; filters that are not set are left out.
export function filtersToParams(filters: PostcodeFilters) {
  const params: Record<string, string> = {
    active: filters.active === "all" ? "all" : String(filters.active === "yes"),
  };

  const postcode = filters.postcode.trim().toUpperCase();
  if (postcode) {
    params.postcode = postcode;
  }
  if (filters.calendar) {
    params.calendar = filters.calendar;
  }
  if (filters.parcelForceZone) {
    params.parcelForceZone = filters.parcelForceZone;
  }
  if (filters.isParcelForce) {
    params.isParcelForce = String(filters.isParcelForce === "yes");
  }

  return params;
}

function matchesSelect(value: string, filter: string) {
  return filter === "" || value === (filter === EMPTY_FILTER ? "" : filter);
}

// Same rules as the API filter, so a saved row that no longer matches can
// leave the list without a reload.
export function matchesFilters(
  item: Pick<
    Postcode,
    "postcode" | "calendar" | "parcelForceZone" | "isParcelForce" | "active"
  >,
  filters: PostcodeFilters,
) {
  return (
    (filters.active === "all" || item.active === (filters.active === "yes")) &&
    item.postcode.startsWith(filters.postcode.trim().toUpperCase()) &&
    matchesSelect(item.calendar, filters.calendar) &&
    matchesSelect(item.parcelForceZone, filters.parcelForceZone) &&
    (filters.isParcelForce === "" ||
      item.isParcelForce === (filters.isParcelForce === "yes"))
  );
}
