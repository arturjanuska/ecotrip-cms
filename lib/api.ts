import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthState } from "@/lib/auth";
import { OBJECT_ID_PATTERN } from "@/lib/validation/postcode";

type Headers = Record<string, string>;

export function errorJson(
  status: number,
  error: string,
  options: { details?: unknown; headers?: Headers } = {},
) {
  return NextResponse.json(
    { error, ...(options.details ? { details: options.details } : {}) },
    { status, headers: options.headers },
  );
}

export function validationError(error: z.ZodError, headers?: Headers) {
  return errorJson(400, "Validation failed", {
    details: z.flattenError(error),
    headers,
  });
}

export function notFound(headers?: Headers) {
  return errorJson(404, "Postcode not found", { headers });
}

export function duplicate() {
  return errorJson(
    409,
    "Postcode already exists (it may be inactive: restore it with PUT active=true)",
  );
}

// Every write needs a signed-in user with the admin role (see lib/auth.ts).
export async function requireAdmin() {
  const state = await getAuthState();

  if (state === "signed-out") {
    return errorJson(401, "Unauthorized");
  }
  if (state === "forbidden") {
    return errorJson(403, "Forbidden");
  }
  return null;
}

// A JSON-only body forces a CORS preflight on cross-origin writes, which the
// preflight handler never grants (CSRF hardening on top of SameSite cookies).
export function requireJson(request: Request) {
  const type = request.headers.get("content-type") ?? "";

  return type.toLowerCase().startsWith("application/json")
    ? null
    : errorJson(415, "Content-Type must be application/json");
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
        ? errorJson(503, "Database unavailable", { headers })
        : errorJson(500, "Internal server error", { headers });
    }
  };
}
