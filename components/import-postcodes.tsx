"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PostcodeFieldInput } from "@/components/postcode-field-input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IMPORT_MAX_BYTES,
  REQUIRED_CSV_COLUMNS,
  changedColumns,
  completeValues,
  duplicatePostcodes,
  existingByPostcode,
  importKey,
  importStatus,
  parseActive,
  parseCsv,
  validateImportValues,
  type CsvColumn,
  type ExistingPostcode,
  type ImportResult,
  type ImportRowErrors,
  type ImportStatus,
  type ImportValues,
} from "@/lib/postcode-csv";
import { DEFAULT_FILTERS } from "@/lib/postcode-filters";
import { errorMessage, fetchAllPostcodes } from "@/lib/postcodes-client";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 49;
const OVERSCAN = 10;

const FIELD_COLUMNS: { column: CsvColumn; label: string; width: number }[] = [
  { column: "postcode", label: "Postcode", width: 120 },
  { column: "town", label: "Town", width: 190 },
  { column: "country", label: "Country", width: 100 },
  { column: "region", label: "Region", width: 180 },
  { column: "countryString", label: "Country name", width: 160 },
  { column: "basicPrice", label: "Basic price", width: 170 },
  { column: "additionalCharges", label: "Additional charges", width: 190 },
  { column: "parcelForceZone", label: "Parcel Force zone", width: 150 },
  { column: "discount", label: "Discount %", width: 130 },
  { column: "calendar", label: "Calendar", width: 150 },
  { column: "active", label: "Active", width: 110 },
];

// Include checkbox, row number, status.
const LEAD_WIDTHS = [44, 64, 240];
const COLUMN_COUNT = LEAD_WIDTHS.length + FIELD_COLUMNS.length;
const TABLE_MIN_WIDTH = [
  ...LEAD_WIDTHS,
  ...FIELD_COLUMNS.map((field) => field.width),
].reduce((sum, width) => sum + width, 0);

type PreviewRow = {
  id: number;
  // Data row number in the file (1 = first row after the header).
  row: number;
  values: ImportValues;
  excluded: boolean;
};

type RowErrors = Partial<Record<CsvColumn, string>>;

type RowCheck = {
  status: ImportStatus;
  errors: RowErrors;
  changed: Set<CsvColumn>;
};

type Show = "all" | ImportStatus | "excluded";

const STATUS_LABELS: Record<ImportStatus, string> = {
  new: "New",
  update: "Update",
  unchanged: "Unchanged",
  error: "Error",
};

const STATUS_STYLES: Record<ImportStatus, string> = {
  new: "bg-brand/15 text-brand-strong",
  update: "bg-secondary text-secondary-foreground ring-1 ring-border",
  unchanged: "text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
};

// Validation results by row values: rows that were not edited keep the same
// values object, so they are not checked again on every keystroke.
const checkCache = new WeakMap<
  ImportValues,
  { duplicate: boolean; match: ExistingPostcode | undefined; check: RowCheck }
>();

function checkRow(
  values: ImportValues,
  match: ExistingPostcode | undefined,
  duplicate: boolean,
) {
  const cached = checkCache.get(values);
  if (cached && cached.duplicate === duplicate && cached.match === match) {
    return cached.check;
  }

  const errors = validateImportValues(values, match, duplicate);
  const check: RowCheck = {
    status: importStatus(values, match, errors),
    errors,
    changed: new Set(match ? changedColumns(values, match) : []),
  };
  checkCache.set(values, { duplicate, match, check });
  return check;
}

type PreviewRowProps = {
  index: number;
  ref?: Ref<HTMLTableRowElement>;
  row: PreviewRow;
  check: RowCheck;
  onChange: (id: number, column: CsvColumn, value: string) => void;
  onToggle: (id: number) => void;
};

const ImportPreviewRow = memo(function ImportPreviewRow({
  index,
  ref,
  row,
  check,
  onChange,
  onToggle,
}: PreviewRowProps) {
  const errorList = Object.entries(check.errors);

  return (
    <TableRow
      ref={ref}
      data-index={index}
      className={cn(row.excluded && "opacity-50")}
    >
      <TableCell>
        <input
          type="checkbox"
          className="size-4 accent-primary"
          aria-label={`Include row ${row.row}`}
          checked={!row.excluded}
          onChange={() => onToggle(row.id)}
        />
      </TableCell>
      <TableCell className="text-muted-foreground">{row.row}</TableCell>
      <TableCell className="whitespace-normal">
        {row.excluded ? (
          <span className="text-xs text-muted-foreground">Excluded</span>
        ) : (
          <>
            <span
              className={cn(
                "inline-block rounded-md px-1.5 py-0.5 text-xs font-medium",
                STATUS_STYLES[check.status],
              )}
            >
              {STATUS_LABELS[check.status]}
            </span>
            {errorList.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-destructive">
                {errorList.map(([column, message]) => (
                  <li key={column}>
                    {column}: {message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </TableCell>
      {FIELD_COLUMNS.map(({ column }) => {
        const value = row.values[column];
        const invalid = Boolean(check.errors[column]);
        const changed = check.status === "update" && check.changed.has(column);

        return (
          <TableCell key={column} className={cn(changed && "bg-brand/10")}>
            {column === "active" ? (
              <NativeSelect
                className="w-full"
                value={value}
                aria-invalid={invalid || undefined}
                onChange={(event) =>
                  onChange(row.id, column, event.target.value)
                }
              >
                {parseActive(value) === null && (
                  <option value={value}>{value || "—"}</option>
                )}
                <option value="true">Yes</option>
                <option value="false">No</option>
              </NativeSelect>
            ) : (
              <PostcodeFieldInput
                field={column}
                value={value}
                invalid={invalid}
                onChange={(next) => onChange(row.id, column, next)}
              />
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
});

export function ImportPostcodes() {
  const { getToken } = useAuth();
  const [existing, setExisting] = useState<Map<
    string,
    ExistingPostcode
  > | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadExisting, setReloadExisting] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [ignoredColumns, setIgnoredColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  // Errors the server reported for rows the preview considered valid.
  const [serverErrors, setServerErrors] = useState<Record<number, RowErrors>>(
    {},
  );
  const [show, setShow] = useState<Show>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Current records tell new rows from updates and fill columns missing from the file.
  useEffect(() => {
    const controller = new AbortController();

    fetchAllPostcodes({ ...DEFAULT_FILTERS, active: "all" }, controller.signal)
      .then(({ items }) => setExisting(existingByPostcode(items)))
      .catch((error: Error) => {
        if (!controller.signal.aborted) {
          setLoadError(error.message);
        }
      });

    return () => controller.abort();
  }, [reloadExisting]);

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [rows.length]);

  const duplicates = useMemo(
    () => duplicatePostcodes(rows.filter((row) => !row.excluded)),
    [rows],
  );

  const checks = useMemo(() => {
    const result = new Map<number, RowCheck>();
    if (!existing) {
      return result;
    }

    for (const row of rows) {
      const key = importKey(row.values.postcode);
      const check = checkRow(
        row.values,
        existing.get(key),
        !row.excluded && duplicates.has(key),
      );
      const fromServer = serverErrors[row.id];
      result.set(
        row.id,
        fromServer
          ? {
              ...check,
              status: "error",
              errors: { ...check.errors, ...fromServer },
            }
          : check,
      );
    }
    return result;
  }, [rows, existing, duplicates, serverErrors]);

  const counts = useMemo(() => {
    const result: Record<Show, number> = {
      all: rows.length,
      new: 0,
      update: 0,
      unchanged: 0,
      error: 0,
      excluded: 0,
    };
    for (const row of rows) {
      const status = checks.get(row.id)?.status;
      if (row.excluded) {
        result.excluded += 1;
      } else if (status) {
        result[status] += 1;
      }
    }
    return result;
  }, [rows, checks]);

  const visibleRows = useMemo(
    () =>
      rows.filter((row) =>
        show === "all"
          ? true
          : show === "excluded"
            ? row.excluded
            : !row.excluded && checks.get(row.id)?.status === show,
      ),
    [rows, checks, show],
  );

  const toWrite = counts.new + counts.update;

  // React Compiler is not enabled in this project, so the memoization warning does not apply.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => visibleRows[index].id,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const updateValue = useCallback(
    (id: number, column: CsvColumn, value: string) => {
      setRows((current) =>
        current.map((row) =>
          row.id === id
            ? { ...row, values: { ...row.values, [column]: value } }
            : row,
        ),
      );
      setServerErrors((current) => {
        if (!current[id]) {
          return current;
        }
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    [],
  );

  const toggleExcluded = useCallback((id: number) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, excluded: !row.excluded } : row,
      ),
    );
  }, []);

  function excludeErrors() {
    setRows((current) =>
      current.map((row) =>
        !row.excluded && checks.get(row.id)?.status === "error"
          ? { ...row, excluded: true }
          : row,
      ),
    );
  }

  function reset() {
    setRows([]);
    setFileName(null);
    setFileError(null);
    setIgnoredColumns([]);
    setServerErrors({});
    setShow("all");
  }

  async function chooseFile(file: File | undefined) {
    if (!file || !existing) {
      return;
    }

    reset();
    setMessage(null);
    setFileName(file.name);

    if (file.size > IMPORT_MAX_BYTES) {
      setFileError(
        `The file is larger than ${IMPORT_MAX_BYTES / 1024 / 1024} MB.`,
      );
      return;
    }

    const parsed = parseCsv(await file.text());
    setFileError(parsed.error);
    setIgnoredColumns(parsed.ignoredColumns);
    setRows(
      parsed.rows.map(({ row, values }, id) => ({
        id,
        row,
        values: completeValues(
          values,
          existing.get(importKey(values.postcode ?? "")),
        ),
        excluded: false,
      })),
    );
  }

  async function runImport() {
    const toSend = rows.filter((row) => {
      const status = checks.get(row.id)?.status;
      return !row.excluded && (status === "new" || status === "update");
    });

    if (
      !window.confirm(
        `Import ${toSend.length} rows: ${counts.new} new, ${counts.update} updated?`,
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(null);

    const send = () =>
      fetch("/api/postcodes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: toSend.map((row) => row.values) }),
      });

    try {
      let response = await send();
      if (response.status === 401) {
        await getToken({ skipCache: true });
        response = await send();
      }
      const body = await response.json().catch(() => null);

      if (!response.ok || !body) {
        const rowErrors = (
          body as { details?: { rows?: ImportRowErrors[] } } | null
        )?.details?.rows;

        if (response.status === 400 && rowErrors) {
          const byId: Record<number, RowErrors> = {};
          for (const { index, errors } of rowErrors) {
            byId[toSend[index].id] = errors;
          }
          setServerErrors(byId);
          setShow("error");
          setMessage({
            text: "The server found errors. Fix or exclude these rows and import again.",
            error: true,
          });
          return;
        }

        setMessage({
          text:
            response.status === 401
              ? "Session expired. Sign in again in a new tab (/login), then import again."
              : response.status === 403
                ? "You do not have permission to import."
                : errorMessage(body, `Import failed (HTTP ${response.status})`),
          error: true,
        });
        return;
      }

      const result = body as ImportResult;
      setMessage({
        text: `Imported: ${result.inserted} new, ${result.updated} updated, ${result.unchanged} unchanged.`,
        error: false,
      });
      reset();
      setExisting(null);
      setReloadExisting((current) => current + 1);
    } catch {
      setMessage({ text: "Network error", error: true });
    } finally {
      setBusy(false);
    }
  }

  const showOptions: { value: Show; label: string }[] = [
    { value: "all", label: "All" },
    { value: "error", label: "Errors" },
    { value: "new", label: "New" },
    { value: "update", label: "Updates" },
    { value: "unchanged", label: "Unchanged" },
    { value: "excluded", label: "Excluded" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            void chooseFile(event.target.files?.[0]);
            // Allows choosing the same file again after editing it.
            event.target.value = "";
          }}
        />
        <Button
          variant={rows.length > 0 ? "outline" : "default"}
          disabled={!existing || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {rows.length > 0 ? "Choose another file" : "Choose CSV file"}
        </Button>
        {fileName && (
          <span className="text-sm text-muted-foreground">{fileName}</span>
        )}
        {!existing && !loadError && <Skeleton className="h-4 w-48" />}

        {rows.length > 0 && (
          <>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Show</span>
              <NativeSelect
                value={show}
                onChange={(event) => setShow(event.target.value as Show)}
              >
                {showOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({counts[option.value]})
                  </option>
                ))}
              </NativeSelect>
            </label>
            {counts.error > 0 && (
              <Button variant="ghost" onClick={excludeErrors}>
                Exclude rows with errors
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                reset();
                setMessage(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || counts.error > 0 || toWrite === 0}
              onClick={runImport}
            >
              Import {toWrite} rows
            </Button>
          </>
        )}
      </div>

      {loadError && (
        <p className="text-sm text-destructive">
          Could not load current postcodes: {loadError}
        </p>
      )}
      {fileError && <p className="text-sm text-destructive">{fileError}</p>}
      {message && (
        <p
          className={cn(
            "text-sm",
            message.error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message.text}
        </p>
      )}

      {rows.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {counts.new} new, {counts.update} to update, {counts.unchanged}{" "}
          unchanged
          {counts.excluded > 0 && `, ${counts.excluded} excluded`}
          {counts.error > 0 && (
            <span className="text-destructive">
              . Fix or exclude {counts.error} rows with errors to continue
            </span>
          )}
          .
          {ignoredColumns.length > 0 &&
            ` Ignored columns: ${ignoredColumns.join(", ")}.`}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="max-w-2xl space-y-2 rounded-lg border p-4 text-sm">
          <p className="font-medium">How import works</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Use a CSV file exported from this CMS, or prepared in Excel or
              Google Sheets (saved as CSV UTF-8, comma or semicolon separated).
            </li>
            <li>
              The first row holds column names. Required:{" "}
              {REQUIRED_CSV_COLUMNS.join(", ")}. Optional: region,
              countryString, basicPrice, additionalCharges, parcelForceZone,
              discount, calendar, active (true or false).
            </li>
            <li>
              Existing postcodes are updated, new ones are added. Columns
              missing from the file keep their current values. Postcodes not in
              the file are not changed.
            </li>
            <li>
              You review and fix the rows here first. Nothing is saved until you
              press Import.
            </li>
          </ul>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="h-[calc(100vh-17rem)] min-h-96 overflow-auto rounded-lg border"
        >
          <table
            className="w-full table-fixed caption-bottom text-sm"
            style={{ minWidth: TABLE_MIN_WIDTH }}
          >
            <colgroup>
              {LEAD_WIDTHS.map((width, index) => (
                <col key={`lead-${index}`} style={{ width }} />
              ))}
              {FIELD_COLUMNS.map((field) => (
                <col key={field.column} style={{ width: field.width }} />
              ))}
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead />
                <TableHead>Row</TableHead>
                <TableHead>Status</TableHead>
                {FIELD_COLUMNS.map((field) => (
                  <TableHead key={field.column}>{field.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className="text-center">
                    No rows
                  </TableCell>
                </TableRow>
              )}
              {paddingTop > 0 && (
                <tr aria-hidden>
                  <td colSpan={COLUMN_COUNT} style={{ height: paddingTop }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const row = visibleRows[virtualRow.index];
                const check = checks.get(row.id);
                if (!check) {
                  return null;
                }

                return (
                  <ImportPreviewRow
                    key={row.id}
                    index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    row={row}
                    check={check}
                    onChange={updateValue}
                    onToggle={toggleExcluded}
                  />
                );
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden>
                  <td
                    colSpan={COLUMN_COUNT}
                    style={{ height: paddingBottom }}
                  />
                </tr>
              )}
            </TableBody>
          </table>
        </div>
      )}
    </div>
  );
}
