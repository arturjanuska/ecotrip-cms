export const LOCALES = ["en", "lt"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// The language choice: set by the switcher, read by the server on each request.
export const LOCALE_COOKIE = "cms-lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Dates and numbers are formatted with these Intl locales.
export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-GB",
  lt: "lt-LT",
};

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
