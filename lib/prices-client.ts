import { errorMessage } from "@/lib/postcodes-client";
import type { PriceImportResult } from "@/lib/price-import";
import type {
  Category,
  PriceCatalog,
  PriceChange,
  StoredCategory,
} from "@/lib/price-types";

// Browser helpers for the price API.

export async function fetchPriceCatalog(signal?: AbortSignal) {
  const response = await fetch("/api/prices", { signal, cache: "no-store" });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body) {
    throw new Error(
      errorMessage(body, `Failed to load prices (HTTP ${response.status})`),
    );
  }

  return (body as PriceCatalog).categories;
}

export type WriteResult<T> =
  { ok: true; body: T } | { ok: false; status: number; message: string };

async function write<T>(
  url: string,
  method: "PUT" | "POST",
  payload: unknown,
  refreshToken: () => Promise<unknown>,
): Promise<WriteResult<T>> {
  const send = () =>
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

  const message =
    response.status === 401
      ? "Session expired. Sign in again in a new tab (/login), then try again. Your changes are kept."
      : response.status === 403
        ? "You do not have permission to edit."
        : errorMessage(body, `Request failed (HTTP ${response.status})`);
  return { ok: false, status: response.status, message };
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
