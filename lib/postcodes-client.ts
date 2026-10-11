import { ApiError } from "@/lib/api-errors";
import { filtersToParams, type PostcodeFilters } from "@/lib/postcode-filters";
import { LIST_MAX_LIMIT } from "@/lib/postcode-options";
import type { Postcode, PostcodeList } from "@/lib/postcode-types";

// Browser helpers for the postcode API. Failures throw ApiError: the UI
// shows its text with lib/api-errors.ts.

export async function fetchPostcodes(
  params: { page: number; limit: number; filters: PostcodeFilters },
  signal: AbortSignal,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    ...filtersToParams(params.filters),
  });
  const response = await fetch(`/api/postcodes?${query}`, { signal });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body) {
    throw new ApiError(response.status, body);
  }

  return body as PostcodeList;
}

// Loads every matching record in 500-row pages (the API maximum).
export async function fetchAllPostcodes(
  filters: PostcodeFilters,
  signal: AbortSignal,
) {
  const first = await fetchPostcodes(
    { page: 1, limit: LIST_MAX_LIMIT, filters },
    signal,
  );
  const pages = Math.ceil(first.total / LIST_MAX_LIMIT);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      fetchPostcodes(
        { page: index + 2, limit: LIST_MAX_LIMIT, filters },
        signal,
      ),
    ),
  );

  // Offset pages can overlap if records change while they load: keep each once.
  const unique = new Map<string, Postcode>();
  for (const part of [first, ...rest]) {
    for (const item of part.items) {
      unique.set(item._id, item);
    }
  }

  return { items: [...unique.values()], total: first.total };
}
