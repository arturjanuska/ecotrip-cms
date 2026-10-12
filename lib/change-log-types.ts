import type { Message } from "@/lib/i18n/translate";

// One change log entry = one write: a save, a bulk change or an import.

export const CHANGE_LOG_LIMIT = 500;
// Field changes stored per entry; a large import keeps the first ones and the
// total in changeCount.
export const CHANGE_LOG_MAX_CHANGES = 1000;

export const CHANGE_LOG_PAGES = [
  "postcodes",
  "prices",
  "fees",
  "dates",
] as const;
export type ChangeLogPage = (typeof CHANGE_LOG_PAGES)[number];

export type ChangeValue = string | number | boolean | null;

// Texts are stored as message keys and shown in the reader's language:
// - `record`: which row changed. Postcodes: the postcode; prices: the
//   spreadsheet row (data); fees: the group as a list of label keys
//   (["fees.purchaseService", "fees.clientMoney"]), where zone names are data
//   and a row number is a msg() string ("fees.row {\"n\":2}"); dates: the
//   direction and month ("LT-UK 2026-12").
// - `field`: a key: "postcode.calendar", "price.UK-LT", "fees.max".
// Entries written before keep their English texts, which show as they are.
export type FieldChange = {
  record: string | string[];
  field: string;
  from: ChangeValue;
  to: ChangeValue;
};

// `{ key: "log.editedPostcode", params: { postcode: "FY1" } }`; older entries
// have an English string.
export type ChangeLogSummary = Message | string;

export type ChangeLogInput = {
  page: ChangeLogPage;
  summary: Message;
  changes: FieldChange[];
};

export type ChangeLogEntry = {
  _id: string;
  createdAt: string;
  user: { id: string; name: string };
  page: ChangeLogPage;
  summary: ChangeLogSummary;
  changeCount: number;
  changes: FieldChange[];
};

export type ChangeLogList = {
  items: ChangeLogEntry[];
  total: number;
  page: number;
  limit: number;
};
