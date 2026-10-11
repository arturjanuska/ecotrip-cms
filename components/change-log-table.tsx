"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { useLocale, useT } from "@/lib/i18n/client";
import { formatNumber, type Translate } from "@/lib/i18n/translate";

const PER_PAGE = 20;
const CACHE_KEY = "changelog";

const PAGE_LABELS: Record<ChangeLogPage, string> = {
  postcodes: "nav.postcodes",
  prices: "nav.prices",
  fees: "nav.fees",
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
  const locale = useLocale();
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">{t("changeLog.when")}</TableHead>
              <TableHead className="w-40">{t("changeLog.who")}</TableHead>
              <TableHead className="w-28">{t("changeLog.page")}</TableHead>
              <TableHead>{t("changeLog.what")}</TableHead>
              <TableHead className="w-32 text-right">
                {t("changeLog.changes")}
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
                      <TableRow className={loading ? "opacity-50" : undefined}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(locale, entry.createdAt)}
                        </TableCell>
                        <TableCell className="truncate">
                          {entry.user.name}
                        </TableCell>
                        <TableCell>
                          {PAGE_LABELS[entry.page]
                            ? t(PAGE_LABELS[entry.page])
                            : entry.page}
                        </TableCell>
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
      </div>

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

function ChangeDetails({ entry }: { entry: ChangeLogList["items"][number] }) {
  const t = useT();
  const locale = useLocale();

  return (
    <div className="space-y-2">
      <Table className="bg-background">
        <TableHeader>
          <TableRow>
            <TableHead>{t("changeLog.record")}</TableHead>
            <TableHead>{t("changeLog.field")}</TableHead>
            <TableHead>{t("changeLog.before")}</TableHead>
            <TableHead>{t("changeLog.after")}</TableHead>
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
