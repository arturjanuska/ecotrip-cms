// One change log entry = one write: a save, a bulk change or an import.

export const CHANGE_LOG_LIMIT = 500;
// Field changes stored per entry; a large import keeps the first ones and the
// total in changeCount.
export const CHANGE_LOG_MAX_CHANGES = 1000;

export const CHANGE_LOG_PAGES = ["postcodes", "prices", "fees"] as const;
export type ChangeLogPage = (typeof CHANGE_LOG_PAGES)[number];

export type ChangeValue = string | number | boolean | null;

// `record`: which row changed (postcode, spreadsheet row, fee group).
export type FieldChange = {
  record: string;
  field: string;
  from: ChangeValue;
  to: ChangeValue;
};

export type ChangeLogInput = {
  page: ChangeLogPage;
  summary: string;
  changes: FieldChange[];
};

export type ChangeLogEntry = {
  _id: string;
  createdAt: string;
  user: { id: string; name: string };
  page: ChangeLogPage;
  summary: string;
  changeCount: number;
  changes: FieldChange[];
};

export type ChangeLogList = {
  items: ChangeLogEntry[];
  total: number;
  page: number;
  limit: number;
};
