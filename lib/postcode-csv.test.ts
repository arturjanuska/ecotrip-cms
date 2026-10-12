import { describe, expect, it } from "vitest";
import {
  completeValues,
  duplicatePostcodes,
  importStatus,
  parseBoolean,
  parseCsv,
  toCsv,
  toImportRecord,
  validateImportValues,
  type ExistingPostcode,
  type ImportValues,
} from "@/lib/postcode-csv";

const existing: ExistingPostcode = {
  postcode: "M46",
  town: "",
  region: "Wigan",
  country: "ENG",
  countryString: "England",
  basicPrice: "Ecotrip pricelist",
  additionalCharges: "-5",
  isParcelForce: false,
  parcelForceZone: "Zone 1",
  discount: "",
  calendar: "Odd",
  active: true,
};

const values = (patch: Partial<ImportValues> = {}): ImportValues => ({
  postcode: "M46",
  town: "Pemberton",
  region: "Wigan",
  country: "ENG",
  countryString: "England",
  basicPrice: "Ecotrip pricelist",
  additionalCharges: "-5",
  isParcelForce: "false",
  parcelForceZone: "Zone 1",
  discount: "",
  calendar: "Odd",
  active: "true",
  ...patch,
});

describe("toCsv and parseCsv", () => {
  it("round-trips records, including quotes, commas and a BOM", () => {
    const tricky = {
      ...existing,
      town: 'Leigh, "Old" town',
      isParcelForce: true,
      active: false,
    };
    const parsed = parseCsv(toCsv([existing, tricky]));

    expect(parsed.error).toBe(null);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[1].values.town).toBe('Leigh, "Old" town');
    expect(parsed.rows[1].values.active).toBe("false");
    expect(parsed.rows[1].values.isParcelForce).toBe("true");
    expect(parsed.rows[0].values.additionalCharges).toBe("-5");
  });

  it("starts with a BOM and a header row", () => {
    const csv = toCsv([existing]);
    expect(csv.startsWith("﻿postcode,town,region,country")).toBe(true);
  });

  it("detects semicolons and matches headers without regard to case", () => {
    const parsed = parseCsv(
      "Postcode;TOWN;Country;Notes\nm1;Manchester;ENG;x\n",
    );
    expect(parsed.error).toBe(null);
    expect(parsed.ignoredColumns).toEqual(["Notes"]);
    expect(parsed.rows).toEqual([
      {
        row: 1,
        values: { postcode: "m1", town: "Manchester", country: "ENG" },
      },
    ]);
  });

  it("skips empty lines", () => {
    const parsed = parseCsv(
      "postcode,town,country\nM1,A,ENG\n\n,,\nM2,B,ENG\n",
    );
    expect(parsed.rows.map((row) => row.values.postcode)).toEqual(["M1", "M2"]);
  });

  it.each([
    [
      "missing required columns",
      "postcode,region\nM1,x\n",
      'file.missingColumns {"columns":"town, country"}',
    ],
    ["no data rows", "postcode,town,country\n", "file.noDataRows"],
    [
      "text that is not UTF-8",
      "postcode,town,country\nM1,Caf�,ENG\n",
      "file.postcodesNotUtf8",
    ],
  ])("reports %s", (_name, text, message) => {
    expect(parseCsv(text).error).toBe(message);
  });
});

describe("parseBoolean", () => {
  it.each([
    ["true", true],
    ["TRUE", true],
    ["yes", true],
    ["1", true],
    ["false", false],
    ["FALSE", false],
    ["no", false],
    ["0", false],
    ["maybe", null],
    ["", null],
  ])("%j -> %s", (value, expected) => {
    expect(parseBoolean(value)).toBe(expected);
  });
});

describe("completeValues", () => {
  it("keeps stored values for columns missing from the file", () => {
    expect(
      completeValues({ postcode: "m46", town: "Leigh" }, existing),
    ).toEqual({
      ...existing,
      town: "Leigh",
      isParcelForce: "false",
      active: "true",
    });
  });

  it("uses defaults for a new postcode", () => {
    expect(
      completeValues({ postcode: "m99", town: "X", country: "ENG" }, undefined),
    ).toEqual({
      postcode: "M99",
      town: "X",
      region: "",
      country: "ENG",
      countryString: "",
      basicPrice: "",
      additionalCharges: "",
      isParcelForce: "false",
      parcelForceZone: "",
      discount: "",
      calendar: "",
      active: "true",
    });
  });

  it("normalizes cells", () => {
    const complete = completeValues(
      { postcode: " m46 ", discount: "7,5", active: "FALSE" },
      existing,
    );
    expect(complete.postcode).toBe("M46");
    expect(complete.discount).toBe("7.5");
    expect(complete.active).toBe("false");
  });

  it("keeps the stored isParcelForce when the cell is empty or missing", () => {
    const parcelForce = { ...existing, isParcelForce: true };
    expect(
      completeValues({ postcode: "M46", isParcelForce: "" }, parcelForce)
        .isParcelForce,
    ).toBe("true");
    expect(completeValues({ postcode: "M46" }, parcelForce).isParcelForce).toBe(
      "true",
    );
    expect(
      completeValues({ postcode: "M46", isParcelForce: "no" }, parcelForce)
        .isParcelForce,
    ).toBe("false");
  });

  it("keeps the stored active flag when the cell is empty", () => {
    expect(
      completeValues(
        { postcode: "M46", active: "" },
        { ...existing, active: false },
      ).active,
    ).toBe("false");
  });
});

describe("validateImportValues", () => {
  it("accepts a valid row", () => {
    expect(validateImportValues(values(), existing, false)).toEqual({});
  });

  it("takes only numbers as additional charges", () => {
    expect(
      validateImportValues(
        values({ additionalCharges: "Parcel force pricelist" }),
        existing,
        false,
      ),
    ).toEqual({ additionalCharges: "validation.additionalChargesNumber" });
    expect(
      validateImportValues(
        values({ additionalCharges: "12.5" }),
        existing,
        false,
      ),
    ).toEqual({});
  });

  it("takes yes or no as isParcelForce", () => {
    expect(
      validateImportValues(values({ isParcelForce: "maybe" }), existing, false),
    ).toEqual({ isParcelForce: "validation.useTrueFalse" });
  });

  it("allows an empty town only for an existing postcode", () => {
    expect(validateImportValues(values({ town: "" }), existing, false)).toEqual(
      {},
    );
    expect(
      validateImportValues(values({ town: "" }), undefined, false),
    ).toEqual({
      town: "validation.requiredForNew",
    });
  });

  it("reports every invalid column", () => {
    const errors = validateImportValues(
      values({
        postcode: "",
        country: "",
        calendar: "odd",
        parcelForceZone: "Zone 4",
        discount: "150",
        active: "maybe",
      }),
      undefined,
      false,
    );
    expect(errors.calendar).toBe(
      'validation.useValuesOrEmpty {"values":"Odd, Even"}',
    );
    expect(errors.parcelForceZone).toBe(
      'validation.useValuesOrEmpty {"values":"Zone 1, Zone 2, Zone 3"}',
    );
    expect(errors.active).toBe("validation.useTrueFalse");
    expect(errors.postcode).toBe("validation.required");
    expect(Object.keys(errors).sort()).toEqual(
      [
        "active",
        "calendar",
        "country",
        "discount",
        "parcelForceZone",
        "postcode",
      ].sort(),
    );
  });

  it("flags duplicates", () => {
    expect(validateImportValues(values(), existing, true)).toEqual({
      postcode: "validation.duplicateInFile",
    });
  });
});

describe("importStatus", () => {
  it("detects new, update, unchanged and error rows", () => {
    const same = completeValues({ postcode: "M46" }, existing);
    expect(importStatus(same, existing, {})).toBe("unchanged");
    expect(importStatus(values(), existing, {})).toBe("update");
    expect(importStatus(values({ postcode: "M99" }), undefined, {})).toBe(
      "new",
    );
    expect(importStatus(values(), existing, { town: "x" })).toBe("error");
  });
});

describe("duplicatePostcodes", () => {
  it("finds postcodes used more than once, ignoring case", () => {
    expect(
      duplicatePostcodes([
        { values: values({ postcode: "M1" }) },
        { values: values({ postcode: "m1 " }) },
        { values: values({ postcode: "M2" }) },
      ]),
    ).toEqual(new Set(["M1"]));
  });
});

describe("toImportRecord", () => {
  it("converts text values to a record", () => {
    expect(
      toImportRecord(values({ active: "false", discount: "7,5" })),
    ).toEqual({
      ...existing,
      town: "Pemberton",
      discount: "7.5",
      active: false,
    });
  });
});
