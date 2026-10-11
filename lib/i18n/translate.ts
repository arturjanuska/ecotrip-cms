import { INTL_LOCALES, toLocale, type Locale } from "@/lib/i18n/config";

// A text to show: a message key with its params. Param values that are
// messages themselves are translated too; a list is joined with ", ".
export type ParamValue = string | number | Message | Message[];
export type Params = { [name: string]: ParamValue };
export type Message = { key: string; params?: Params };

export type Dictionary = { [key: string]: string | Dictionary | undefined };

export type Translate = (text: string | Message, params?: Params) => string;

const KEY_PATTERN = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+)+$/;

/**
 * A message as one string, for places that only carry strings (Zod issue
 * messages, API error details, the change log): the key, then its params as
 * JSON after a space: `validation.subcategoryRepeats {"value":"wheels"}`.
 */
export function msg(key: string, params?: Params): string {
  return params && Object.keys(params).length > 0
    ? `${key} ${JSON.stringify(params)}`
    : key;
}

// The key and params of a string made by msg(); any other text is returned
// as a key of its own, which translate() shows as is.
export function parseMessage(text: string): Message {
  const space = text.indexOf(" {");
  if (space > 0 && KEY_PATTERN.test(text.slice(0, space))) {
    try {
      const params: unknown = JSON.parse(text.slice(space + 1));
      if (params && typeof params === "object" && !Array.isArray(params)) {
        return { key: text.slice(0, space), params: params as Params };
      }
    } catch {
      // Not params after all: plain text.
    }
  }
  return { key: text };
}

export function isMessageKey(messages: Dictionary, key: string) {
  return KEY_PATTERN.test(key) && lookup(messages, key) !== undefined;
}

function lookup(messages: Dictionary, key: string): string | undefined {
  let node: string | Dictionary | undefined = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || !Object.hasOwn(node, part)) {
      return undefined;
    }
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function localeOf(messages: Dictionary): Locale {
  return toLocale(lookup(messages, "meta.locale"));
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
const numberFormats = new Map<Locale, Intl.NumberFormat>();

function pluralRule(locale: Locale, count: number) {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALES[locale]);
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}

export function formatNumber(locale: Locale, value: number) {
  let format = numberFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(INTL_LOCALES[locale]);
    numberFormats.set(locale, format);
  }
  return format.format(value);
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Message).key === "string"
  );
}

/**
 * The text of `key` in `messages`, with `{name}` replaced by params. With a
 * numeric `count` param, `key_one` / `key_few` / `key_many` / `key_other` is
 * picked by the plural rules of the dictionary's language. A missing key
 * returns the key itself, so data and old change log text show as is. `key`
 * may also be a string made by msg().
 */
export function translate(
  messages: Dictionary,
  key: string | Message,
  params?: Params,
): string {
  const message = isMessage(key)
    ? key
    : params
      ? { key, params }
      : parseMessage(key);
  const values = message.params ?? {};
  const locale = localeOf(messages);

  let template: string | undefined;
  if (typeof values.count === "number") {
    template = lookup(
      messages,
      `${message.key}_${pluralRule(locale, values.count)}`,
    );
  }
  if (values.count !== undefined) {
    template ??= lookup(messages, `${message.key}_other`);
  }
  template ??= lookup(messages, message.key);
  if (template === undefined) {
    return message.key;
  }

  const format = (value: ParamValue): string => {
    if (typeof value === "number") {
      return formatNumber(locale, value);
    }
    if (Array.isArray(value)) {
      return value.map(format).join(", ");
    }
    if (isMessage(value)) {
      return translate(messages, value);
    }
    return String(value);
  };

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? format(values[name]) : match,
  );
}

export function createTranslator(messages: Dictionary): Translate {
  return (key, params) => translate(messages, key, params);
}
