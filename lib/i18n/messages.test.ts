import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "@/lib/api-errors";
import { LOCALES } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/lib/i18n/messages";
import { en } from "@/lib/i18n/messages/en";
import { isMessageKey, type Dictionary } from "@/lib/i18n/translate";

const PLURAL = /_(zero|one|two|few|many|other)$/;

function leaves(node: Dictionary, prefix = ""): [string, string][] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string"
      ? [[path, value] as [string, string]]
      : leaves(value as Dictionary, path);
  });
}

// Keys without plural suffixes: languages differ only in plural forms.
function baseKeys(messages: Dictionary) {
  return [
    ...new Set(leaves(messages).map(([key]) => key.replace(PLURAL, ""))),
  ].sort();
}

describe("dictionaries", () => {
  it.each(LOCALES)("%s has the keys of en and no empty texts", (locale) => {
    const messages = DICTIONARIES[locale] as Dictionary;
    expect(baseKeys(messages)).toEqual(baseKeys(en));
    for (const [key, text] of leaves(messages)) {
      expect(text.trim(), key).not.toBe("");
    }
  });

  it.each(LOCALES)("%s has every plural form its language needs", (locale) => {
    const messages = DICTIONARIES[locale] as Dictionary;
    const categories = new Intl.PluralRules(locale).resolvedOptions()
      .pluralCategories;
    // Counts are whole numbers: Lithuanian "many" is for fractions only.
    const needed = categories.filter((category) => category !== "many");
    const keys = new Set(leaves(messages).map(([key]) => key));
    const plurals = [...keys].filter((key) => key.endsWith("_other"));
    for (const key of plurals) {
      const base = key.replace(/_other$/, "");
      for (const category of needed) {
        expect(keys.has(`${base}_${category}`), `${base}_${category}`).toBe(
          true,
        );
      }
    }
  });

  it.each(LOCALES)("%s uses the same {params} as en", (locale) => {
    const english = new Map(leaves(en));
    const params = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [key, text] of leaves(DICTIONARIES[locale] as Dictionary)) {
      const source =
        english.get(key) ?? english.get(key.replace(PLURAL, "_other"));
      expect(new Set(params(text)), key).toEqual(new Set(params(source!)));
    }
  });

  it("has a text for every API error code", () => {
    for (const code of API_ERROR_CODES) {
      expect(isMessageKey(en, `apiErrors.${code}`), code).toBe(true);
    }
  });
});

// Every message key written in the source exists (catches typos). Keys are
// string literals starting with a dictionary namespace.
describe("keys used in the source", () => {
  const roots = ["app", "components", "lib", "scripts"];
  const namespaces = Object.keys(en).join("|");
  const pattern = new RegExp(
    `["'\`]((?:${namespaces})\\.[A-Za-z0-9_.-]+)["'\` ]`,
    "g",
  );

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === "messages" || name === "data") {
        return [];
      }
      return statSync(path).isDirectory()
        ? files(path)
        : /\.tsx?$/.test(name) && !name.endsWith(".test.ts")
          ? [path]
          : [];
    });
  }

  it("finds each key in en", () => {
    const missing: string[] = [];
    let found = 0;
    for (const file of roots.flatMap((root) => files(root))) {
      for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
        const key = match[1];
        // Template literals such as `postcode.${field}` stop at the "$".
        if (key.endsWith(".")) {
          continue;
        }
        found += 1;
        const plural =
          isMessageKey(en, `${key}_one`) || isMessageKey(en, `${key}_other`);
        if (!isMessageKey(en, key) && !plural) {
          missing.push(`${file}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(found).toBeGreaterThan(200);
  });
});
