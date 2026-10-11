"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { BulkEditBar } from "@/components/bulk-edit-bar";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PostcodeFieldInput } from "@/components/postcode-field-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CALENDAR_VALUES, PARCEL_FORCE_ZONES } from "@/lib/postcode-options";
import {
  pruneDraft,
  validateDraft,
  pruneDrafts,
  withDraft,
  type Draft,
  type EditableTextField,
} from "@/lib/postcode-drafts";
import {
  DEFAULT_FILTERS,
  EMPTY_FILTER,
  matchesFilters,
  type PostcodeFilters,
  type ActiveFilter,
} from "@/lib/postcode-filters";
import type { Postcode } from "@/lib/postcode-types";
import {
  errorMessage,
  fetchAllPostcodes,
  fetchPostcodes,
} from "@/lib/postcodes-client";
import { readCache, writeCache } from "@/lib/client-cache";
import type { BulkChanges, BulkUpdateResult } from "@/lib/validation/postcode";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";

const PER_PAGE_OPTIONS = [25, 50, 100, 200, 500] as const;
const DEFAULT_PER_PAGE = 50;

// Only the rows inside the scroll area are rendered, so "all" stays fast.
// Column widths are fixed because off-screen rows do not take part in layout.
const ROW_HEIGHT = 49;
const OVERSCAN = 10;
const COLUMN_COUNT = 13;
const COLUMN_WIDTHS = [
  44, 110, 190, 90, 180, 160, 170, 190, 150, 130, 150, 80, 150,
] as const;

const TEXT_COLUMNS: readonly { field: EditableTextField; label: string }[] = [
  { field: "town", label: "Town" },
  { field: "region", label: "Region" },
  { field: "countryString", label: "Country name" },
  { field: "basicPrice", label: "Basic price" },
  { field: "additionalCharges", label: "Additional charges" },
  { field: "parcelForceZone", label: "Parcel Force zone" },
  { field: "discount", label: "Discount %" },
  { field: "calendar", label: "Calendar" },
];

type ListState = {
  key: string;
  items: Postcode[];
  total: number;
  error: string | null;
};

type PerPage = number | "all";

function without<T>(record: Record<string, T>, id: string) {
  const next = { ...record };
  delete next[id];
  return next;
}

type RowProps = {
  index: number;
  ref?: Ref<HTMLTableRowElement>;
  item: Postcode;
  draft: Draft | undefined;
  error: string | undefined;
  saving: boolean;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onChange: (item: Postcode, patch: Draft) => void;
  onSave: (item: Postcode, draft: Draft) => void;
};

// Memoized so typing in one row does not re-render thousands of rows in "all" mode.
const PostcodeRow = memo(function PostcodeRow({
  index,
  ref,
  item,
  draft,
  error,
  saving,
  selected,
  onSelect,
  onChange,
  onSave,
}: RowProps) {
  const problems = draft ? validateDraft(draft) : null;

  const fieldCell = (field: EditableTextField) => (
    <TableCell key={field}>
      <PostcodeFieldInput
        field={field}
        value={draft?.[field] ?? item[field]}
        invalid={problems?.fields.has(field)}
        onChange={(value) => onChange(item, { [field]: value })}
      />
    </TableCell>
  );

  return (
    <TableRow
      ref={ref}
      data-index={index}
      data-state={selected ? "selected" : undefined}
      className="data-[state=selected]:bg-brand/10"
    >
      <TableCell>
        <input
          type="checkbox"
          className="size-4 accent-primary"
          aria-label={`Select ${item.postcode}`}
          checked={selected}
          onChange={(event) => onSelect(item._id, event.target.checked)}
        />
      </TableCell>
      <TableCell className="font-mono font-medium">{item.postcode}</TableCell>
      {fieldCell("town")}
      <TableCell>{item.country}</TableCell>
      {TEXT_COLUMNS.slice(1).map((column) => fieldCell(column.field))}
      <TableCell>
        <Switch
          checked={draft?.active ?? item.active}
          onCheckedChange={(checked) => onChange(item, { active: checked })}
        />
      </TableCell>
      <TableCell>
        {draft && (
          <Button
            size="sm"
            disabled={saving || Boolean(problems)}
            onClick={() => onSave(item, draft)}
          >
            Save
          </Button>
        )}
        {(error ?? problems?.message) && (
          <p className="mt-1 max-w-56 whitespace-normal text-xs text-destructive">
            {error ?? problems?.message}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
});

const SKELETON_ROWS = 12;

// Placeholder rows while a page loads, laid out like PostcodeRow.
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <TableRow key={row} aria-hidden className="hover:bg-transparent">
          <TableCell>
            <Skeleton className="size-4 rounded-sm" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-8 w-full rounded-lg" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-10" />
          </TableCell>
          {TEXT_COLUMNS.slice(1).map((column) => (
            <TableCell key={column.field}>
              <Skeleton className="h-8 w-full rounded-lg" />
            </TableCell>
          ))}
          <TableCell>
            <Skeleton className="h-[18px] w-8 rounded-full" />
          </TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  );
}

const POSTCODES_CACHE_KEY = "postcodes";

type PostcodesView = {
  filters: PostcodeFilters;
  postcodeInput: string;
  perPage: PerPage;
  page: number;
  list: ListState | null;
};

export function PostcodesTable() {
  const { getToken } = useAuth();
  // Back from another page: the same filters, page and rows as when it was
  // left; the rows refresh in the background.
  const [cached] = useState(() =>
    readCache<PostcodesView>(POSTCODES_CACHE_KEY),
  );
  const [filters, setFilters] = useState<PostcodeFilters>(
    cached?.filters ?? DEFAULT_FILTERS,
  );
  // Typed value; it reaches `filters` after a short pause in typing.
  const [postcodeInput, setPostcodeInput] = useState(
    cached?.postcodeInput ?? "",
  );
  const [perPage, setPerPage] = useState<PerPage>(
    cached?.perPage ?? DEFAULT_PER_PAGE,
  );
  const [page, setPage] = useState(cached?.page ?? 1);
  const [refresh, setRefresh] = useState(0);
  const [list, setList] = useState<ListState | null>(cached?.list ?? null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  // Selected record ids; kept across pages and filter changes.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  const key = [
    filters.active,
    filters.postcode,
    filters.calendar,
    filters.parcelForceZone,
    perPage,
    page,
  ].join("|");
  const loading = list?.key !== key;
  const items = loading ? [] : list.items;
  const total = list?.total ?? 0;
  const totalPages =
    perPage === "all" ? 1 : Math.max(1, Math.ceil(total / perPage));
  const unsavedCount = Object.keys(drafts).length;
  const filtered =
    postcodeInput !== "" ||
    Object.entries(DEFAULT_FILTERS).some(
      ([name, value]) => filters[name as keyof PostcodeFilters] !== value,
    );

  const scrollRef = useRef<HTMLDivElement>(null);
  // React Compiler is not enabled in this project, so the memoization warning does not apply.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => items[index]._id,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  // `refresh` reloads the current page in the background: the key does not
  // change, so the rows on screen stay until the new ones arrive.
  useEffect(() => {
    const controller = new AbortController();
    const request =
      perPage === "all"
        ? fetchAllPostcodes(filters, controller.signal)
        : fetchPostcodes({ page, limit: perPage, filters }, controller.signal);

    request
      .then(({ items, total }) => {
        setList({ key, items, total, error: null });
        setDrafts((current) => pruneDrafts(current, items));
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) {
          return;
        }
        setList({ key, items: [], total: 0, error: error.message });
      });

    return () => controller.abort();
  }, [key, page, perPage, filters, refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [key]);

  useEffect(() => {
    writeCache<PostcodesView>(POSTCODES_CACHE_KEY, {
      filters,
      postcodeInput,
      perPage,
      page,
      list: list?.error ? null : list,
    });
  }, [filters, postcodeInput, perPage, page, list]);

  // Drafts survive page and filter changes, but not leaving the page.
  useUnsavedChanges(unsavedCount > 0);

  function updateFilters(patch: Partial<PostcodeFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setPostcodeInput("");
    setPage(1);
  }

  useEffect(() => {
    if (postcodeInput === filters.postcode) {
      return;
    }

    const timer = setTimeout(() => {
      setFilters((current) => ({ ...current, postcode: postcodeInput }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [postcodeInput, filters.postcode]);

  function changePerPage(value: string) {
    setPerPage(value === "all" ? "all" : Number(value));
    setPage(1);
  }

  const updateDraft = useCallback((item: Postcode, patch: Draft) => {
    setDrafts((current) =>
      withDraft(
        current,
        item._id,
        pruneDraft(item, { ...current[item._id], ...patch }),
      ),
    );
  }, []);

  const allLoadedSelected =
    items.length > 0 && items.every((item) => selected.has(item._id));
  const someLoadedSelected = items.some((item) => selected.has(item._id));

  const toggleSelected = useCallback((id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
    setBulkMessage(null);
  }, []);

  function toggleAllLoaded() {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (allLoadedSelected) {
          next.delete(item._id);
        } else {
          next.add(item._id);
        }
      }
      return next;
    });
    setBulkMessage(null);
  }

  async function applyBulk(changes: BulkChanges) {
    const ids = [...selected];
    setBulkBusy(true);
    setBulkMessage(null);

    const send = () =>
      fetch("/api/postcodes/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, changes }),
      });

    try {
      let response = await send();
      if (response.status === 401) {
        await getToken({ skipCache: true });
        response = await send();
      }
      const body = await response.json().catch(() => null);

      if (!response.ok || !body) {
        const text =
          response.status === 401
            ? "Session expired. Sign in again in a new tab (/login), then apply again."
            : response.status === 403
              ? "You do not have permission to edit."
              : errorMessage(
                  body,
                  `Bulk update failed (HTTP ${response.status})`,
                );
        setBulkMessage({ text, error: true });
        return;
      }

      const result = body as BulkUpdateResult;
      const missing = result.notFound.length
        ? ` ${result.notFound.length} not found.`
        : "";
      setBulkMessage({
        text: `Updated ${result.matched} postcodes (${result.modified} changed).${missing}`,
        error: result.notFound.length > 0,
      });
      setSelected(new Set());
      // Reload: values changed, and rows may no longer match the filters.
      setRefresh((current) => current + 1);
    } catch {
      setBulkMessage({ text: "Network error", error: true });
    } finally {
      setBulkBusy(false);
    }
  }

  const save = useCallback(
    async (item: Postcode, draft: Draft) => {
      const id = item._id;
      setSaving((current) => ({ ...current, [id]: true }));
      setRowErrors((current) => without(current, id));

      const send = () =>
        fetch(`/api/postcodes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });

      try {
        let response = await send();
        if (response.status === 401) {
          // The short-lived session token can expire in a background tab:
          // refresh it once and retry before giving up.
          await getToken({ skipCache: true });
          response = await send();
        }
        const body = await response.json().catch(() => null);

        if (!response.ok || !body) {
          const message =
            response.status === 401
              ? "Session expired. Sign in again in a new tab (/login), then save. Your changes are kept."
              : response.status === 403
                ? "You do not have permission to edit."
                : errorMessage(
                    body,
                    `Failed to save (HTTP ${response.status})`,
                  );
          setRowErrors((current) => ({ ...current, [id]: message }));
          return;
        }

        const saved = body as Postcode;
        const leavesView = !matchesFilters(saved, filters);

        setList((current) => {
          if (!current || !current.items.some((row) => row._id === id)) {
            return current;
          }
          return leavesView
            ? {
                ...current,
                items: current.items.filter((row) => row._id !== id),
                total: Math.max(0, current.total - 1),
              }
            : {
                ...current,
                items: current.items.map((row) =>
                  row._id === id ? saved : row,
                ),
              };
        });
        // Keep whatever was typed in the row after Save was clicked.
        setDrafts((current) =>
          withDraft(current, id, pruneDraft(saved, current[id])),
        );

        if (leavesView && perPage !== "all") {
          // Refetch the page so the next record moves up instead of being
          // skipped by offset paging.
          setRefresh((current) => current + 1);
        }
      } catch {
        setRowErrors((current) => ({ ...current, [id]: "Network error" }));
      } finally {
        setSaving((current) => ({ ...current, [id]: false }));
      }
    },
    [getToken, perPage, filters],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Postcode</span>
          <Input
            className="w-28"
            placeholder="e.g. M4"
            value={postcodeInput}
            onChange={(event) =>
              setPostcodeInput(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 8),
              )
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Calendar</span>
          <NativeSelect
            value={filters.calendar}
            onChange={(event) =>
              updateFilters({ calendar: event.target.value })
            }
          >
            <option value="">Any</option>
            <option value={EMPTY_FILTER}>Empty</option>
            {CALENDAR_VALUES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Parcel Force zone</span>
          <NativeSelect
            value={filters.parcelForceZone}
            onChange={(event) =>
              updateFilters({ parcelForceZone: event.target.value })
            }
          >
            <option value="">Any</option>
            <option value={EMPTY_FILTER}>Empty</option>
            {PARCEL_FORCE_ZONES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Active</span>
          <NativeSelect
            value={filters.active}
            onChange={(event) =>
              updateFilters({ active: event.target.value as ActiveFilter })
            }
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="all">All</option>
          </NativeSelect>
        </label>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset filters
          </Button>
        )}
        {unsavedCount > 0 && (
          <span className="text-sm text-destructive">
            Unsaved rows: {unsavedCount}
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Per page</span>
          <NativeSelect
            value={perPage}
            onChange={(event) => changePerPage(event.target.value)}
          >
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="all">All</option>
          </NativeSelect>
        </label>
        {loading ? (
          <Skeleton className="h-4 w-24" />
        ) : (
          <span className="text-sm text-muted-foreground">{total} records</span>
        )}
      </div>

      {selected.size > 0 && (
        <BulkEditBar
          selectedCount={selected.size}
          busy={bulkBusy}
          onApply={applyBulk}
          onClear={() => setSelected(new Set())}
        />
      )}

      {bulkMessage && (
        <p
          className={
            bulkMessage.error
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {bulkMessage.text}
        </p>
      )}

      {list?.key === key && list.error && (
        <p className="text-sm text-destructive">{list.error}</p>
      )}

      <div
        ref={scrollRef}
        aria-busy={loading}
        className="h-[calc(100vh-14rem)] min-h-96 overflow-auto rounded-lg border"
      >
        <table className="w-full min-w-[1784px] table-fixed caption-bottom text-sm">
          <colgroup>
            {COLUMN_WIDTHS.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label="Select all rows in the table"
                  disabled={items.length === 0}
                  checked={allLoadedSelected}
                  ref={(element) => {
                    if (element) {
                      element.indeterminate =
                        someLoadedSelected && !allLoadedSelected;
                    }
                  }}
                  onChange={toggleAllLoaded}
                />
              </TableHead>
              <TableHead>Postcode</TableHead>
              <TableHead>{TEXT_COLUMNS[0].label}</TableHead>
              <TableHead>Country</TableHead>
              {TEXT_COLUMNS.slice(1).map((column) => (
                <TableHead key={column.field}>{column.label}</TableHead>
              ))}
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="text-center">
                  No postcodes
                </TableCell>
              </TableRow>
            )}
            {loading && <SkeletonRows />}
            {paddingTop > 0 && (
              <tr aria-hidden>
                <td colSpan={COLUMN_COUNT} style={{ height: paddingTop }} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const item = items[virtualRow.index];

              return (
                <PostcodeRow
                  key={item._id}
                  index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  item={item}
                  draft={drafts[item._id]}
                  error={rowErrors[item._id]}
                  saving={Boolean(saving[item._id])}
                  onChange={updateDraft}
                  selected={selected.has(item._id)}
                  onSelect={toggleSelected}
                  onSave={save}
                />
              );
            })}
            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td colSpan={COLUMN_COUNT} style={{ height: paddingBottom }} />
              </tr>
            )}
          </TableBody>
        </table>
      </div>

      {perPage !== "all" && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => current - 1)}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
