# CMS localization: English and Lithuanian

Date: 2026-10-11. Status: agreed in chat.

## Decisions

| Question | Decision |
| --- | --- |
| Languages | `en` (default) and `lt`; adding one = one more dictionary |
| Choice | switcher EN / LT at the bottom of the sidebar and on the login page; cookie `cms-lang` (1 year, path `/`); no locale in URLs |
| Library | none: typed dictionaries + small `t()` |
| API error messages | translated on the client: every error response carries a stable `code`; validation messages are message keys |
| Change log | summaries and field names stored as keys + params, shown in the current language; entries written before keep their English text |
| Data | not translated: spreadsheet texts (`sheet`), postcodes, zone names, user names |
| Translator | Lithuanian written by Claude, to be reviewed by a native speaker; price list terms as in the spreadsheet («Siuntos kategorija», «Dydis», «Tūris», «Svoris») |

## Infrastructure

- `lib/i18n/config.ts`: `LOCALES = ["en", "lt"] as const`, `DEFAULT_LOCALE = "en"`, `LOCALE_COOKIE = "cms-lang"`.
- `lib/i18n/messages/en.ts`: the source dictionary (nested object). `lib/i18n/messages/lt.ts`: `satisfies Messages` (same keys, TypeScript fails on a missing or extra key). A test checks both have the same keys and no empty strings.
- Interpolation `{name}`. Plurals: keys with `_one` / `_few` / `_many` / `_other` picked by `Intl.PluralRules(locale)`; English uses `_one` / `_other`.
- `translate(messages, key, params)` pure, tested. A missing key returns the key itself (so data and old log text still show).
- Server: `getLocale()` (from `cookies()`, falls back to default), `getTranslator()` for server components and `metadata` (`generateMetadata`).
- Client: `I18nProvider` in the root layout gets the locale and its dictionary; `useT()` and `useLocale()`. `<html lang>` follows the locale.
- Switcher writes the cookie and calls `router.refresh()` (that also clears the client router cache kept by `staleTimes`).
- Dates and numbers shown through `Intl` with `en-GB` / `lt-LT`.
- Zod built-in messages on the client: `z.config(z.locales.lt())` / `en()` set when the locale changes, so client-side checks speak the language.

## API errors

- `errorJson(status, error, { code, ... })`: every error response gets `code` (e.g. `unauthorized`, `forbidden`, `not_found`, `postcode_duplicate`, `validation_failed`, `unsupported_media_type`, `prices_changed`, `fees_changed`, `prices_import_conflict`, `fees_not_found`, `database_unavailable`, `internal_error`, …). `error` stays English for API users.
- Custom messages in `lib/validation/*.ts` become message keys (e.g. `validation.maxBelowMin`). The client translates `details.fieldErrors` messages with `t()`; anything that is not a key shows as is.
- Client helpers return / throw the code (and params); the UI picks the text.

## Change log

- `summary` stored as `{ key, params }` (e.g. `{ key: "log.editedPostcode", params: { postcode: "FY1" } }`); a string summary (older entries) shows as is.
- `FieldChange.field` stored as a key (`postcode.calendar`, `price.UK-LT`, `fees.max`, …); for fees `record` is a list of label keys (`["fees.purchaseService", "fees.clientMoney"]`) joined with " · " on display; for prices `record` stays the spreadsheet text (data); for postcodes the postcode.
- `lib/change-log-diff.ts` and its tests follow.

## Scope

Every visible text: sidebar, login and no-access pages, Postcodes (table, filters, bulk bar, import), Prices (table, import), Fees (labels, subtitles, help texts with examples), Change log, metadata titles, confirm dialogs (`useUnsavedChanges`), empty and loading states.
