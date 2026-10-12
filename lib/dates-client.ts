import { ApiError } from "@/lib/api-errors";
import type {
  DateOverride,
  DateOverrideList,
  StoredDateOverride,
} from "@/lib/date-override-types";
import { write } from "@/lib/prices-client";

// Browser helpers for the date overrides API.

export async function fetchDateOverrides(signal?: AbortSignal) {
  const response = await fetch("/api/date-overrides", {
    signal,
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body) {
    throw new ApiError(response.status, body);
  }

  return (body as DateOverrideList).items;
}

export function createDateOverride(
  override: DateOverride,
  refreshToken: () => Promise<unknown>,
) {
  return write<StoredDateOverride>(
    "/api/date-overrides",
    "POST",
    override,
    refreshToken,
  );
}

export function saveDateOverride(
  saved: StoredDateOverride,
  next: DateOverride,
  refreshToken: () => Promise<unknown>,
) {
  return write<StoredDateOverride>(
    `/api/date-overrides/${saved._id}`,
    "PUT",
    { override: next, updatedAt: saved.updatedAt },
    refreshToken,
  );
}

export function deleteDateOverride(
  saved: StoredDateOverride,
  refreshToken: () => Promise<unknown>,
) {
  return write<StoredDateOverride>(
    `/api/date-overrides/${saved._id}`,
    "DELETE",
    undefined,
    refreshToken,
  );
}
