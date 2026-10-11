import type { Message, Params, Translate } from "@/lib/i18n/translate";

// Stable codes of API error responses (`{ error, code, details? }`). `error`
// stays English for API users; the CMS shows the text of `code` in its own
// language (messages: apiErrors.<code>).
export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "unsupported_media_type",
  "validation_failed",
  "postcode_not_found",
  "postcode_duplicate",
  "postcodes_import_invalid",
  "category_not_found",
  "category_value_changed",
  "prices_changed",
  "prices_import_conflict",
  "prices_import_invalid",
  "fees_not_found",
  "fees_changed",
  "database_unavailable",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorBody = {
  error?: string;
  code?: string;
  details?: {
    fieldErrors?: Record<string, string[]>;
    formErrors?: string[];
    messages?: string[];
  };
};

// A failed API request, kept as data so its text follows the language.
export type ApiFailure = {
  status: number;
  body: ApiErrorBody | null;
};

export function toFailure(status: number, body: unknown): ApiFailure {
  return {
    status,
    body:
      typeof body === "object" && body !== null ? (body as ApiErrorBody) : null,
  };
}

// Thrown by the browser helpers that load data.
export class ApiError extends Error {
  readonly failure: ApiFailure;

  constructor(status: number, body: unknown) {
    const failure = toFailure(status, body);
    super(failure.body?.error ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.failure = failure;
  }
}

function isApiErrorCode(code: unknown): code is ApiErrorCode {
  return API_ERROR_CODES.includes(code as ApiErrorCode);
}

// Postcode fields have labels; other field names show as they are.
function fieldLabel(t: Translate, field: string) {
  const key = `postcode.${field}`;
  const label = t(key);
  return label === key ? field : label;
}

/**
 * The text of a failed request: the text of its code (or the English `error`
 * of an older server, or `fallback`), then the validation messages.
 */
export function failureText(
  t: Translate,
  failure: ApiFailure,
  fallback: string,
  fallbackParams?: Params,
) {
  const { status, body } = failure;
  const main = isApiErrorCode(body?.code)
    ? t(`apiErrors.${body.code}`)
    : (body?.error ?? t(fallback, { status, ...fallbackParams }));

  const details = [
    ...Object.entries(body?.details?.fieldErrors ?? {}).map(
      ([field, messages]) =>
        `${fieldLabel(t, field)}: ${messages.map((text) => t(text)).join(", ")}`,
    ),
    ...(body?.details?.formErrors ?? []).map((text) => t(text)),
    // "category: message" lines of an import that makes prices invalid.
    ...(body?.details?.messages ?? []).map((line) => {
      const colon = line.indexOf(": ");
      return colon === -1
        ? t(line)
        : `${line.slice(0, colon)}: ${t(line.slice(colon + 2))}`;
    }),
  ].join("; ");

  return [main, details].filter(Boolean).join(" - ");
}

// What went wrong in a request the UI shows: kept as data (not text) in
// component state, so the text follows a language switch.
export type Problem =
  | { kind: "message"; message: Message }
  | {
      kind: "failure";
      failure: ApiFailure;
      fallback: string;
      // Texts for 401 and 403, when the action has its own wording.
      unauthorized?: string;
      forbidden?: string;
    };

export function messageProblem(key: string, params?: Params): Problem {
  return { kind: "message", message: { key, params } };
}

export const NETWORK_ERROR: Problem = messageProblem("errors.network");

// A write that failed: 401 and 403 get the action's own wording.
export function writeProblem(
  failure: ApiFailure,
  fallback: string,
  unauthorized = "errors.sessionExpired",
  forbidden = "errors.noPermission",
): Problem {
  return { kind: "failure", failure, fallback, unauthorized, forbidden };
}

// An error caught while loading: an API error, or a network failure.
export function loadProblem(error: unknown, fallback: string): Problem {
  return error instanceof ApiError
    ? { kind: "failure", failure: error.failure, fallback }
    : NETWORK_ERROR;
}

export function problemText(t: Translate, problem: Problem) {
  if (problem.kind === "message") {
    return t(problem.message);
  }
  const { failure } = problem;
  if (failure.status === 401 && problem.unauthorized) {
    return t(problem.unauthorized);
  }
  if (failure.status === 403 && problem.forbidden) {
    return t(problem.forbidden);
  }
  return failureText(t, failure, problem.fallback);
}
