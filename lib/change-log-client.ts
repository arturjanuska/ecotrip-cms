import type { ChangeLogList } from "@/lib/change-log-types";
import { errorMessage } from "@/lib/postcodes-client";

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
    throw new Error(
      errorMessage(
        body,
        `Failed to load the change log (HTTP ${response.status})`,
      ),
    );
  }

  return body as ChangeLogList;
}
