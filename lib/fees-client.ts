import { errorMessage } from "@/lib/postcodes-client";
import type { FeeSettings, StoredFeeSettings } from "@/lib/fee-types";
import { write } from "@/lib/prices-client";

// Browser helpers for the fees API.

// null: the settings are not seeded yet (404).
export async function fetchFeeSettings(signal?: AbortSignal) {
  const response = await fetch("/api/fees", { signal, cache: "no-store" });
  if (response.status === 404) {
    return null;
  }
  const body = await response.json().catch(() => null);

  if (!response.ok || !body) {
    throw new Error(
      errorMessage(body, `Failed to load fees (HTTP ${response.status})`),
    );
  }

  return body as StoredFeeSettings;
}

export function saveFeeSettings(
  saved: StoredFeeSettings,
  next: FeeSettings,
  refreshToken: () => Promise<unknown>,
) {
  return write<StoredFeeSettings>(
    "/api/fees",
    "PUT",
    { settings: next, updatedAt: saved.updatedAt },
    refreshToken,
  );
}
