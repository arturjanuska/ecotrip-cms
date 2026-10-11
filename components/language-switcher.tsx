"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALES,
  type Locale,
} from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

// Kept for a year on every path; the server reads it on each request.
function saveLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

// EN / LT. The choice goes into a cookie the server reads; refresh() renders
// the page again in the new language (and drops the router's cached pages)
// while client state, such as unsaved edits, stays.
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) {
      return;
    }
    saveLocale(next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      aria-busy={pending || undefined}
      className={cn("flex items-center gap-1 text-xs", className)}
    >
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          title={t(`language.${option}`)}
          aria-pressed={option === locale}
          disabled={pending}
          onClick={() => choose(option)}
          className={cn(
            "rounded-md px-2 py-1 font-medium uppercase transition-colors",
            option === locale
              ? "bg-brand/15 text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
