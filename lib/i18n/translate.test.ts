import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/messages/en";
import { lt } from "@/lib/i18n/messages/lt";
import {
  createTranslator,
  msg,
  parseMessage,
  translate,
  type Dictionary,
} from "@/lib/i18n/translate";

const enT = createTranslator(en);
const ltT = createTranslator(lt);

describe("translate", () => {
  it("finds nested keys", () => {
    expect(translate(en, "nav.postcodes")).toBe("Postcodes");
    expect(translate(lt, "nav.postcodes")).toBe("Pašto kodai");
    expect(translate(lt, "price.UK-LT")).toBe("Kaina iš UK į LT (£)");
  });

  it("fills params and leaves unknown ones", () => {
    expect(enT("log.editedPostcode", { postcode: "FY1" })).toBe(
      "Edited postcode FY1",
    );
    expect(enT("log.editedPostcode")).toBe("Edited postcode {postcode}");
  });

  it("formats numbers for the language", () => {
    expect(enT("changeLog.intro", { limit: 1500 })).toContain("latest 1,500");
    expect(ltT("changeLog.intro", { limit: 1500 })).toMatch(/1\s500/);
  });

  it("translates params that are messages, and lists of them", () => {
    const params = {
      field: { key: "postcode.calendar" },
      value: { key: "log.empty" },
    };
    expect(enT("log.setTo", params)).toBe("Calendar → (empty)");
    expect(ltT("log.setTo", params)).toBe("Kalendorius → (tuščia)");
    expect(
      ltT({
        key: "log.bulkEditedPostcodes",
        params: {
          count: 2,
          changes: [
            {
              key: "log.setTo",
              params: { field: { key: "postcode.calendar" }, value: "Even" },
            },
            {
              key: "log.setTo",
              params: {
                field: { key: "postcode.active" },
                value: { key: "log.true" },
              },
            },
          ],
        },
      }),
    ).toBe("Masinis 2 pašto kodų keitimas: Kalendorius → Even, Aktyvus → taip");
  });

  it.each([
    [0, "Imported prices: 0 changes"],
    [1, "Imported prices: 1 change"],
    [2, "Imported prices: 2 changes"],
    [21, "Imported prices: 21 changes"],
  ])("picks the English plural for %i", (count, text) => {
    expect(enT("log.importedPrices", { count })).toBe(text);
  });

  it.each([
    [1, "1 pakeitimas"],
    [2, "2 pakeitimai"],
    [9, "9 pakeitimai"],
    [10, "10 pakeitimų"],
    [11, "11 pakeitimų"],
    [12, "12 pakeitimų"],
    [21, "21 pakeitimas"],
    [22, "22 pakeitimai"],
    [0, "0 pakeitimų"],
  ])("picks the Lithuanian plural for %i", (count, text) => {
    expect(ltT("log.importedPrices", { count })).toBe(
      `Importuotos kainos: ${text}`,
    );
  });

  it("falls back to _other, then to the plain key, for counts", () => {
    expect(enT("pricesPage.imported", { count: "x" })).toBe(
      "Import applied: x changes.",
    );
    expect(enT("importPrices.changes", { count: 3 })).toBe("Changes (3)");
  });

  it("returns a missing key, or plain text, as it is", () => {
    expect(enT("nav.missing")).toBe("nav.missing");
    expect(enT("Saved prices: Siuntos")).toBe("Saved prices: Siuntos");
    expect(enT("Zone 2")).toBe("Zone 2");
    expect(enT("nav")).toBe("nav");
    expect(translate({} as Dictionary, "nav.postcodes")).toBe("nav.postcodes");
  });
});

describe("msg and parseMessage", () => {
  it("keeps a key without params as the key", () => {
    expect(msg("validation.required")).toBe("validation.required");
    expect(msg("validation.required", {})).toBe("validation.required");
  });

  it("round-trips params", () => {
    const text = msg("validation.subcategoryRepeats", { value: "wheels" });
    expect(text).toBe('validation.subcategoryRepeats {"value":"wheels"}');
    expect(parseMessage(text)).toEqual({
      key: "validation.subcategoryRepeats",
      params: { value: "wheels" },
    });
    expect(enT(text)).toBe('Subcategory "wheels" repeats');
    expect(ltT(text)).toBe("Subkategorija „wheels“ kartojasi");
  });

  it("translates nested messages inside a msg() string", () => {
    const text = msg("priceDiff.notANumber", {
      field: { key: "price.weight" },
      raw: "abc",
    });
    expect(enT(text)).toBe('Weight (kg): "abc" is not a number');
    expect(ltT(text)).toBe("Svoris (kg): „abc“ nėra skaičius");
  });

  it("treats other text as plain text", () => {
    expect(parseMessage("Invalid input {x}")).toEqual({
      key: "Invalid input {x}",
    });
    expect(parseMessage("validation.required {broken")).toEqual({
      key: "validation.required {broken",
    });
    expect(enT("Too small: expected number to be >=0")).toBe(
      "Too small: expected number to be >=0",
    );
  });
});
