import { ApiError, toFailure, type ApiFailure } from "@/lib/api-errors";
import type { PriceImportResult } from "@/lib/price-import";
import type {
  Category,
  PriceCatalog,
  PriceChange,
  StoredCategory,
} from "@/lib/price-types";

// Browser helpers for the price API. Failures carry the status and body; the
// UI shows their text with lib/api-errors.ts.

export async function fetchPriceCatalog(signal?: AbortSignal) {
  const response = await fetch("/api/prices", { signal, cache: "no-store" });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body) {
    throw new ApiError(response.status, body);
  }

  return (body as PriceCatalog).categories;
}

export type WriteResult<T> =
  { ok: true; body: T } | { ok: false; failure: ApiFailure };

export async function write<T>(
  url: string,
  method: "PUT" | "POST" | "DELETE",
  payload: unknown,
  refreshToken: () => Promise<unknown>,
): Promise<WriteResult<T>> {
  // DELETE has no body.
  const send = () =>
    fetch(url, {
      method,
      ...(payload === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
    });

  let response = await send();
  if (response.status === 401) {
    // The short-lived session token can expire in a background tab: refresh
    // it once and retry before giving up.
    await refreshToken();
    response = await send();
  }
  const body = await response.json().catch(() => null);

  if (response.ok && body) {
    return { ok: true, body: body as T };
  }

  return { ok: false, failure: toFailure(response.status, body) };
}

export function saveCategory(
  saved: StoredCategory,
  next: Category,
  refreshToken: () => Promise<unknown>,
) {
  return write<StoredCategory>(
    `/api/prices/${encodeURIComponent(saved.value)}`,
    "PUT",
    { category: next, updatedAt: saved.updatedAt },
    refreshToken,
  );
}

export function importPriceChanges(
  changes: PriceChange[],
  refreshToken: () => Promise<unknown>,
) {
  return write<PriceImportResult>(
    "/api/prices/import",
    "POST",
    { changes },
    refreshToken,
  );
}
