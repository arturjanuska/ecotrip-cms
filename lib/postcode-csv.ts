import Papa from "papaparse";
import { msg } from "@/lib/i18n/translate";
import { CALENDAR_VALUES, PARCEL_FORCE_ZONES } from "@/lib/postcode-options";
import { createPostcodeSchema } from "@/lib/validation/postcode";

export const CSV_COLUMNS = [
  "postcode",
  "town",
  "region",
  "country",
  "countryString",
  "basicPrice",
  "additionalCharges",
  "parcelForceZone",
  "discount",
  "calendar",
  "active",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
type TextColumn = Exclude<CsvColumn, "active">;

export const REQUIRED_CSV_COLUMNS = ["postcode", "town", "country"] as const;
export const IMPORT_MAX_ROWS = 10000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

// One import row as text, the way the preview shows and edits it.
// `active` holds "true" or "false" (or the raw cell when it is invalid).
export type ImportValues = Record<CsvColumn, string>;

// The stored fields of a record that an import row is compared with.
export type ExistingPostcode = Record<TextColumn, string> & { active: boolean };

export type ImportRecord = Record<TextColumn, string> & { active: boolean };

export type ImportStatus = "new" | "update" | "unchanged" | "error";

// Response of POST /api/postcodes/import.
export type ImportResult = {
  inserted: number;
  updated: number;
  unchanged: number;
};

// 400 response details: `index` is the position in the request's `rows`.
// Errors are messages (msg() strings or Zod's own text) the CMS translates.
export type ImportRowErrors = {
  index: number;
  errors: Partial<Record<CsvColumn, string>>;
};

export type ParsedCsv = {
  // `row` is the data row number in the file: 1 is the first row after the header.
  rows: { row: number; values: Partial<ImportValues> }[];
  ignoredColumns: string[];
  // A msg() string (lib/i18n/translate.ts).
  error: string | null;
};

export function toCsv(items: ExistingPostcode[]) {
  const data = items.map((item) =>
    CSV_COLUMNS.map((column) =>
      column === "active" ? String(item.active) : item[column],
    ),
  );

  // The BOM makes Excel read the file as UTF-8.
  return (
    "﻿" + Papa.unparse({ fields: [...CSV_COLUMNS], data }, { newline: "\r\n" })
  );
}

export function parseCsv(text: string): ParsedCsv {
  const fail = (error: string): ParsedCsv => ({
    rows: [],
    ignoredColumns: [],
    error,
  });

  if (text.includes("�")) {
    return fail("file.postcodesNotUtf8");
  }

  // The delimiter (comma or semicolon) is detected automatically.
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  const quoteError = result.errors.find((error) => error.type === "Quotes");
  if (quoteError) {
    return fail(
      msg("file.brokenQuotesDataRow", {
        row: String((quoteError.row ?? 0) + 1),
        message: quoteError.message,
      }),
    );
  }

  // Headers match column names without regard to case ("Postcode" works).
  const byName = new Map(
    CSV_COLUMNS.map((column) => [column.toLowerCase(), column]),
  );
  const mapping = new Map<string, CsvColumn>();
  const ignoredColumns: string[] = [];
  for (const header of result.meta.fields ?? []) {
    const column = byName.get(header.toLowerCase());
    if (column && ![...mapping.values()].includes(column)) {
      mapping.set(header, column);
    } else if (header) {
      ignoredColumns.push(header);
    }
  }

  const columns = [...mapping.values()];
  const missing = REQUIRED_CSV_COLUMNS.filter(
    (column) => !columns.includes(column),
  );
  if (missing.length > 0) {
    return fail(msg("file.missingColumns", { columns: missing.join(", ") }));
  }
  if (result.data.length === 0) {
    return fail("file.noDataRows");
  }
  if (result.data.length > IMPORT_MAX_ROWS) {
    return fail(msg("file.tooManyRows", { max: IMPORT_MAX_ROWS }));
  }

  return {
    rows: result.data.map((record, index) => ({
      row: index + 1,
      values: Object.fromEntries(
        [...mapping].map(([header, column]) => [
          column,
          (record[header] ?? "").trim(),
        ]),
      ),
    })),
    ignoredColumns,
    error: null,
  };
}

export function parseActive(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0"].includes(normalized)) {
    return false;
  }
  return null;
}

export function importKey(postcode: string) {
  return postcode.trim().toUpperCase();
}

function normalizeCell(column: CsvColumn, value: string) {
  const trimmed = value.trim();
  if (column === "postcode") {
    return trimmed.toUpperCase();
  }
  if (column === "discount") {
    // Excel with a European locale writes decimals with a comma.
    return trimmed.replace(",", ".");
  }
  if (column === "active") {
    const active = parseActive(trimmed);
    return active === null ? trimmed : String(active);
  }
  return trimmed;
}

/**
 * Fills every column of a parsed row. A column missing from the file, or an
 * empty `active` cell, keeps the stored value of an existing postcode; a new
 * postcode gets "" (and active "true").
 */
export function completeValues(
  values: Partial<ImportValues>,
  existing: ExistingPostcode | undefined,
): ImportValues {
  const complete = {} as ImportValues;

  for (const column of CSV_COLUMNS) {
    const value = values[column];
    if (value !== undefined && !(column === "active" && value === "")) {
      complete[column] = normalizeCell(column, value);
    } else if (existing) {
      complete[column] =
        column === "active" ? String(existing.active) : existing[column];
    } else {
      complete[column] = column === "active" ? "true" : "";
    }
  }

  return complete;
}

// Clearer messages than zod's for values typed into a spreadsheet.
const FRIENDLY_ERRORS: Partial<Record<CsvColumn, string>> = {
  town: "validation.requiredForNew",
  calendar: msg("validation.useValuesOrEmpty", {
    values: CALENDAR_VALUES.join(", "),
  }),
  parcelForceZone: msg("validation.useValuesOrEmpty", {
    values: PARCEL_FORCE_ZONES.join(", "),
  }),
};

/**
 * Same rules as the API. `town` may stay empty for a postcode that already
 * exists (imported data has empty towns); a new postcode needs one.
 */
export function validateImportValues(
  values: ImportValues,
  existing: ExistingPostcode | undefined,
  duplicate: boolean,
) {
  const errors: Partial<Record<CsvColumn, string>> = {};
  const shape = createPostcodeSchema.shape;

  for (const column of CSV_COLUMNS) {
    if (column === "active") {
      if (parseActive(values.active) === null) {
        errors.active = "validation.useTrueFalse";
      }
      continue;
    }
    if (column === "town" && existing && values.town.trim() === "") {
      continue;
    }

    const result = shape[column].safeParse(values[column]);
    if (!result.success) {
      errors[column] =
        FRIENDLY_ERRORS[column] ?? result.error.issues[0].message;
    }
  }

  if (duplicate && !errors.postcode) {
    errors.postcode = "validation.duplicateInFile";
  }

  return errors;
}

export function toImportRecord(values: ImportValues): ImportRecord {
  const record = {} as ImportRecord;
  for (const column of CSV_COLUMNS) {
    if (column === "active") {
      record.active = parseActive(values.active) ?? true;
    } else {
      record[column] = normalizeCell(column, values[column]);
    }
  }
  return record;
}

export function changedColumns(
  values: ImportValues,
  existing: ExistingPostcode,
) {
  const record = toImportRecord(values);
  return CSV_COLUMNS.filter((column) => record[column] !== existing[column]);
}

export function importStatus(
  values: ImportValues,
  existing: ExistingPostcode | undefined,
  errors: Partial<Record<CsvColumn, string>>,
): ImportStatus {
  if (Object.keys(errors).length > 0) {
    return "error";
  }
  if (!existing) {
    return "new";
  }
  return changedColumns(values, existing).length > 0 ? "update" : "unchanged";
}

// Postcodes that appear more than once among the given rows.
export function duplicatePostcodes(rows: { values: ImportValues }[]) {
  const counts = new Map<string, number>();
  for (const { values } of rows) {
    const key = importKey(values.postcode);
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts].filter(([, count]) => count > 1).map(([key]) => key),
  );
}

export type ExistingPostcodeMap = Map<string, ExistingPostcode>;

export function existingByPostcode(items: ExistingPostcode[]) {
  return new Map(items.map((item) => [item.postcode, item]));
}
