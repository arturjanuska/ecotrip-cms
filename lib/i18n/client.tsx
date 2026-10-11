"use client";

import { createContext, useContext, useMemo } from "react";
import { z } from "zod";
import zodEn from "zod/v4/locales/en.js";
import zodLt from "zod/v4/locales/lt.js";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { createTranslator, type Translate } from "@/lib/i18n/translate";

type I18n = { locale: Locale; t: Translate };

const I18nContext = createContext<I18n | null>(null);

const ZOD_LOCALES = { en: zodEn, lt: zodLt } satisfies Record<
  Locale,
  () => Parameters<typeof z.config>[0]
>;

let zodLocale: Locale | null = null;

// Zod's own messages (checks in the browser) follow the language. Set during
// render, before the forms below validate; in the browser only, so the
// server's API keeps English.
function setZodLocale(locale: Locale) {
  if (typeof window !== "undefined" && zodLocale !== locale) {
    z.config(ZOD_LOCALES[locale]());
    zodLocale = locale;
  }
}

/** Gives client components the language chosen for this request. */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  setZodLocale(locale);
  const value = useMemo(
    () => ({ locale, t: createTranslator(messages) }),
    [locale, messages],
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useT() needs an I18nProvider above it");
  }
  return value;
}

export function useT() {
  return useI18n().t;
}

export function useLocale() {
  return useI18n().locale;
}
