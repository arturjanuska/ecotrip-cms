import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, toLocale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/lib/i18n/messages";
import { createTranslator } from "@/lib/i18n/translate";

// The language of this request: the `cms-lang` cookie, else the default.
export const getLocale = cache(async () =>
  toLocale((await cookies()).get(LOCALE_COOKIE)?.value),
);

// t() for Server Components and generateMetadata.
export async function getTranslator() {
  return createTranslator(DICTIONARIES[await getLocale()]);
}

// "<page> | Ecotrip CMS" in the request's language.
export async function pageTitle(key: string) {
  const t = await getTranslator();
  return t("app.title", { page: t(key) });
}
