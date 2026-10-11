import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { ApiErrorCode } from "@/lib/api-errors";
import { getAuthState } from "@/lib/auth";
import { OBJECT_ID_PATTERN } from "@/lib/validation/postcode";

type Headers = Record<string, string>;

// `error` is English text for API users; `code` is stable, and the CMS shows
// its text in the user's language (lib/api-errors.ts).
export function errorJson(
  status: number,
  error: string,
  options: { code: ApiErrorCode; details?: unknown; headers?: Headers },
) {
  return NextResponse.json(
    {
      error,
      code: options.code,
      ...(options.details ? { details: options.details } : {}),
    },
    { status, headers: options.headers },
  );
}

// Messages in `details` are message keys (lib/validation/*.ts) or Zod's own
// English messages.
export function validationError(error: z.ZodError, headers?: Headers) {
  return errorJson(400, "Validation failed", {
    code: "validation_failed",
    details: z.flattenError(error),
    headers,
  });
}

export function notFound(headers?: Headers) {
  return errorJson(404, "Postcode not found", {
    code: "postcode_not_found",
    headers,
  });
}

export function duplicate() {
  return errorJson(
    409,
    "Postcode already exists (it may be inactive: restore it with PUT active=true)",
    { code: "postcode_duplicate" },
  );
}

// Every write needs a signed-in user with the admin role (see lib/auth.ts).
export async function requireAdmin() {
  const state = await getAuthState();

  if (state === "signed-out") {
    return errorJson(401, "Unauthorized", { code: "unauthorized" });
  }
  if (state === "forbidden") {
    return errorJson(403, "Forbidden", { code: "forbidden" });
  }
  return null;
}

// A JSON-only body forces a CORS preflight on cross-origin writes, which the
// preflight handler never grants (CSRF hardening on top of SameSite cookies).
export function requireJson(request: Request) {
  const type = request.headers.get("content-type") ?? "";

  return type.toLowerCase().startsWith("application/json")
    ? null
    : errorJson(415, "Content-Type must be application/json", {
        code: "unsupported_media_type",
      });
}

export function isValidId(id: string) {
  return OBJECT_ID_PATTERN.test(id);
}

export function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function readJson(request: Request) {
  return request.json().catch(() => null);
}

function allowedOrigins() {
  return (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request): Headers {
  const headers: Headers = { Vary: "Origin" };
  const origin = request.headers.get("origin");

  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function preflight(request: Request) {
  const headers = corsHeaders(request);

  if (headers["Access-Control-Allow-Origin"]) {
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return new NextResponse(null, { status: 204, headers });
}

const DATABASE_UNAVAILABLE_ERRORS = new Set([
  "MongooseServerSelectionError",
  "MongoServerSelectionError",
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoNotConnectedError",
  "MongoTopologyClosedError",
]);

function isDatabaseUnavailable(error: unknown) {
  return error instanceof Error && DATABASE_UNAVAILABLE_ERRORS.has(error.name);
}

// Unexpected errors become JSON (with CORS headers, so browsers on allowed
// origins can read them) instead of Next's empty 500.
export function withErrorHandling<Context>(
  handler: (request: NextRequest, context: Context) => Promise<Response>,
) {
  return async (request: NextRequest, context: Context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error(error);
      const headers = corsHeaders(request);

      return isDatabaseUnavailable(error)
        ? errorJson(503, "Database unavailable", {
            code: "database_unavailable",
            headers,
          })
        : errorJson(500, "Internal server error", {
            code: "internal_error",
            headers,
          });
    }
  };
}
