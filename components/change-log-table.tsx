"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableFrame } from "@/components/ui/loading-bar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadProblem, problemText, type Problem } from "@/lib/api-errors";
import { readCache, writeCache } from "@/lib/client-cache";
import { fetchChangeLog } from "@/lib/change-log-client";
import type {
  ChangeLogList,
  ChangeLogPage,
  ChangeLogSummary,
  ChangeValue,
  FieldChange,
} from "@/lib/change-log-types";
import { INTL_LOCALES, type Locale } from "@/lib/i18n/config";
import { useLocale, useT, useHeaderT } from "@/lib/i18n/client";
import { formatNumber, type Translate } from "@/lib/i18n/translate";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const PER_PAGE = 20;
const CACHE_KEY = "changelog";

const PAGE_LABELS: Record<ChangeLogPage, string> = {
  postcodes: "nav.postcodes",
  prices: "nav.prices",
  fees: "nav.fees",
  dates: "nav.dates",
};

const dateFormats = new Map<Locale, Intl.DateTimeFormat>();

function formatDate(locale: Locale, date: string) {
  let format = dateFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
      dateStyle: "medium",
      timeStyle: "short",
    });
    dateFormats.set(locale, format);
  }
  return format.format(new Date(date));
}

function valueText(t: Translate, value: ChangeValue) {
  if (value === null) {
    return "—";
  }
  if (value === "") {
    return t("log.empty");
  }
  if (typeof value === "boolean") {
    return t(value ? "log.true" : "log.false");
  }
  return String(value);
}

// Keys and params in the reader's language; older entries keep their English
// text, and a key this version does not know shows as it is.
function summaryText(t: Translate, summary: ChangeLogSummary) {
  return typeof summary === "string" ? summary : t(summary);
}

function recordText(t: Translate, record: FieldChange["record"]) {
  return Array.isArray(record)
    ? record.map((part) => t(part)).join(" · ")
    : record;
}

// Older postcode entries stored the bare field name ("calendar").
function fieldText(t: Translate, page: ChangeLogPage, field: string) {
  if (page === "postcodes" && !field.includes(".")) {
    const key = `postcode.${field}`;
    const text = t(key);
    return text === key ? field : text;
  }
  return t(field);
}

type ListState = ChangeLogList & { error: Problem | null };

export function ChangeLogTable() {
  const t = useT();
  const th = useHeaderT();
  const locale = useLocale();
  const desktop = useMediaQuery(DESKTOP_QUERY, true);
  const [page, setPage] = useState(
    () => readCache<ListState>(CACHE_KEY)?.page ?? 1,
  );
  const [list, setList] = useState<ListState | null>(
    () => readCache<ListState>(CACHE_KEY) ?? null,
  );
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    fetchChangeLog({ page, limit: PER_PAGE }, controller.signal)
      .then((result) => {
        const next = { ...result, error: null };
        setList(next);
        writeCache(CACHE_KEY, next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setList({
            items: [],
            total: 0,
            page,
            limit: PER_PAGE,
            error: loadProblem(error, "errors.loadChangeLog"),
          });
        }
      });
    return () => controller.abort();
  }, [page]);

  const loading = list?.page !== page;
  const totalPages = Math.max(1, Math.ceil((list?.total ?? 0) / PER_PAGE));

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (list?.error) {
    return (
      <p className="text-sm text-destructive">{problemText(t, list.error)}</p>
    );
  }

  const pageLabel = (page: string) =>
    PAGE_LABELS[page as ChangeLogPage]
      ? t(PAGE_LABELS[page as ChangeLogPage])
      : page;

  return (
    <div className="space-y-4">
      {!desktop ? (
        // Phones: one card per entry instead of five columns.
        <TableFrame loading={loading} className="divide-y">
          {loading && !list
            ? Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="space-y-2 p-3">
                  <Skeleton className="h-3 w-32 rounded" />
                  <Skeleton className="h-4 w-full rounded" />
                </div>
              ))
            : list?.items.map((entry) => {
                const isOpen = open.has(entry._id);
                return (
                  <div
                    key={entry._id}
                    className={cn("space-y-2 p-3", loading && "opacity-50")}
                  >
                    <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(locale, entry.createdAt)}</span>
                      <span>{pageLabel(entry.page)}</span>
                    </div>
                    <p className="text-sm">{summaryText(t, entry.summary)}</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs text-muted-foreground">
                        {entry.user.name}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-expanded={isOpen}
                        onClick={() => toggle(entry._id)}
                      >
                        {th("changeLog.changes")}:{" "}
                        {formatNumber(locale, entry.changeCount)}{" "}
                        {isOpen ? "▴" : "▾"}
                      </Button>
                    </div>
                    {isOpen && <ChangeDetails entry={entry} compact />}
                  </div>
                );
              })}
          {list && list.items.length === 0 && !loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("changeLog.noChanges")}
            </p>
          )}
        </TableFrame>
      ) : (
        <TableFrame loading={loading}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">{th("changeLog.when")}</TableHead>
                <TableHead className="w-40">{th("changeLog.who")}</TableHead>
                <TableHead className="w-28">{th("changeLog.page")}</TableHead>
                <TableHead>{th("changeLog.what")}</TableHead>
                <TableHead className="w-32 text-right">
                  {th("changeLog.changes")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !list
                ? Array.from({ length: 8 }, (_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-5 w-full rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                : list?.items.map((entry) => {
                    const isOpen = open.has(entry._id);
                    return (
                      <Fragment key={entry._id}>
                        <TableRow
                          className={loading ? "opacity-50" : undefined}
                        >
                          <TableCell className="whitespace-nowrap">
                            {formatDate(locale, entry.createdAt)}
                          </TableCell>
                          <TableCell className="truncate">
                            {entry.user.name}
                          </TableCell>
                          <TableCell>{pageLabel(entry.page)}</TableCell>
                          <TableCell className="whitespace-normal">
                            {summaryText(t, entry.summary)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-expanded={isOpen}
                              onClick={() => toggle(entry._id)}
                            >
                              {formatNumber(locale, entry.changeCount)}{" "}
                              {isOpen ? "▴" : "▾"}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="bg-muted/40 p-3">
                              <ChangeDetails entry={entry} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
              {list && list.items.length === 0 && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {t("changeLog.noChanges")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableFrame>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">
          {t("common.pageOf", { page, total: totalPages })}
        </span>
        <Button
          variant="outline"
          disabled={page <= 1 || loading}
          onClick={() => setPage((current) => current - 1)}
        >
          {t("common.prev")}
        </Button>
        <Button
          variant="outline"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}

function ChangeDetails({
  entry,
  compact = false,
}: {
  entry: ChangeLogList["items"][number];
  // Phones: a list, each change on its own lines, instead of a table.
  compact?: boolean;
}) {
  const t = useT();
  const th = useHeaderT();
  const locale = useLocale();

  return (
    <div className="space-y-2">
      {compact ? (
        <ul className="divide-y rounded-md border bg-muted/40 text-sm">
          {entry.changes.map((change, index) => (
            <li key={index} className="space-y-0.5 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                {recordText(t, change.record)} ·{" "}
                {fieldText(t, entry.page, change.field)}
              </div>
              <div className="break-words">
                <span className="text-muted-foreground">
                  {valueText(t, change.from)}
                </span>
                {" → "}
                <span className="font-medium">{valueText(t, change.to)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Table className="bg-background">
          <TableHeader>
            <TableRow>
              <TableHead>{th("changeLog.record")}</TableHead>
              <TableHead>{th("changeLog.field")}</TableHead>
              <TableHead>{th("changeLog.before")}</TableHead>
              <TableHead>{th("changeLog.after")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.changes.map((change, index) => (
              <TableRow key={index}>
                <TableCell className="whitespace-normal">
                  {recordText(t, change.record)}
                </TableCell>
                <TableCell>{fieldText(t, entry.page, change.field)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {valueText(t, change.from)}
                </TableCell>
                <TableCell className="font-medium">
                  {valueText(t, change.to)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {entry.changeCount > entry.changes.length && (
        <p className="text-sm text-muted-foreground">
          {t("changeLog.showingFirst", {
            shown: formatNumber(locale, entry.changes.length),
            total: entry.changeCount,
          })}
        </p>
      )}
    </div>
  );
}
