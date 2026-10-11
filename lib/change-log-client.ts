import type { ChangeLogList } from "@/lib/change-log-types";
import { ApiError } from "@/lib/api-errors";

// Browser helper for the change log API.
export async function fetchChangeLog(
  params: { page: number; limit: number },
  signal: AbortSignal,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  const response = await fetch(`/api/changelog?${query}`, {
    signal,
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body) {
    throw new ApiError(response.status, body);
  }

  return body as ChangeLogList;
}
