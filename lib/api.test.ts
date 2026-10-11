import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  corsHeaders,
  isDuplicateKeyError,
  isValidId,
  preflight,
  requireAdmin,
  requireJson,
  withErrorHandling,
} from "@/lib/api";

const { getAuthState } = vi.hoisted(() => ({ getAuthState: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getAuthState }));

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/postcodes", {
    headers,
  }) as unknown as NextRequest;
}

describe("isValidId", () => {
  it("accepts 24 hex characters only", () => {
    expect(isValidId("6ac9a9213a671434070832bd")).toBe(true);
    expect(isValidId("abc")).toBe(false);
    expect(isValidId("zzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });
});

describe("isDuplicateKeyError", () => {
  it("detects Mongo error 11000", () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ code: 121 })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});

describe("requireAdmin", () => {
  it.each([
    ["signed-out", 401],
    ["forbidden", 403],
  ])("answers %s with %i and a code", async (state, status) => {
    getAuthState.mockResolvedValueOnce(state);
    const response = await requireAdmin();
    expect(response?.status).toBe(status);
    expect((await response?.json()).code).toBe(
      status === 401 ? "unauthorized" : "forbidden",
    );
  });

  it("lets an admin through", async () => {
    getAuthState.mockResolvedValueOnce("admin");
    expect(await requireAdmin()).toBe(null);
  });
});

describe("requireJson", () => {
  it("accepts application/json", () => {
    expect(
      requireJson(
        request({ "content-type": "application/json; charset=utf-8" }),
      ),
    ).toBe(null);
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", ""])(
    "answers %j with 415",
    async (type) => {
      const headers: Record<string, string> = type
        ? { "content-type": type }
        : {};
      const response = requireJson(request(headers));
      expect(response?.status).toBe(415);
      expect(await response?.json()).toMatchObject({
        code: "unsupported_media_type",
      });
    },
  );
});

describe("CORS", () => {
  beforeEach(() => {
    vi.stubEnv("CORS_ORIGINS", "https://a.example, https://b.example");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows listed origins only", () => {
    expect(corsHeaders(request({ origin: "https://b.example" }))).toEqual({
      Vary: "Origin",
      "Access-Control-Allow-Origin": "https://b.example",
    });
    expect(corsHeaders(request({ origin: "https://evil.example" }))).toEqual({
      Vary: "Origin",
    });
  });

  it("grants GET only in preflight", () => {
    const response = preflight(request({ origin: "https://a.example" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS",
    );
  });
});

describe("withErrorHandling", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the handler response", async () => {
    const handler = withErrorHandling(async () => new Response("ok"));
    expect(await (await handler(request(), undefined)).text()).toBe("ok");
  });

  it("answers 503 JSON when the database is unreachable", async () => {
    const error = new Error("timed out");
    error.name = "MongooseServerSelectionError";
    const handler = withErrorHandling(async () => {
      throw error;
    });

    const response = await handler(request(), undefined);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Database unavailable",
      code: "database_unavailable",
    });
  });

  it("answers 500 JSON for other errors", async () => {
    const handler = withErrorHandling(async () => {
      throw new Error("boom");
    });

    const response = await handler(request(), undefined);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Internal server error",
      code: "internal_error",
    });
  });
});
