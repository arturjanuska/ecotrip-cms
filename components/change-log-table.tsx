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
import { readCache, writeCache } from "@/lib/client-cache";
import { fetchChangeLog } from "@/lib/change-log-client";
import type {
  ChangeLogList,
  ChangeLogPage,
  ChangeValue,
} from "@/lib/change-log-types";

const PER_PAGE = 20;
const CACHE_KEY = "changelog";

const PAGE_LABELS: Record<ChangeLogPage, string> = {
  postcodes: "Postcodes",
  prices: "Prices",
  fees: "Fees",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function valueText(value: ChangeValue) {
  if (value === null) {
    return "—";
  }
  if (value === "") {
    return "(empty)";
  }
  return String(value);
}

type ListState = ChangeLogList & { error: string | null };

export function ChangeLogTable() {
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
      .catch((error: Error) => {
        if (!controller.signal.aborted) {
          setList({
            items: [],
            total: 0,
            page,
            limit: PER_PAGE,
            error: error.message,
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
    return <p className="text-sm text-destructive">{list.error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">When</TableHead>
              <TableHead className="w-40">Who</TableHead>
              <TableHead className="w-28">Page</TableHead>
              <TableHead>What</TableHead>
              <TableHead className="w-32 text-right">Changes</TableHead>
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
                          {dateFormat.format(new Date(entry.createdAt))}
                        </TableCell>
                        <TableCell className="truncate">
                          {entry.user.name}
                        </TableCell>
                        <TableCell>{PAGE_LABELS[entry.page]}</TableCell>
                        <TableCell className="whitespace-normal">
                          {entry.summary}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={isOpen}
                            onClick={() => toggle(entry._id)}
                          >
                            {entry.changeCount} {isOpen ? "▴" : "▾"}
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
                  No changes yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}

function ChangeDetails({ entry }: { entry: ChangeLogList["items"][number] }) {
  return (
    <div className="space-y-2">
      <Table className="bg-background">
        <TableHeader>
          <TableRow>
            <TableHead>Record</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entry.changes.map((change, index) => (
            <TableRow key={index}>
              <TableCell className="whitespace-normal">
                {change.record}
              </TableCell>
              <TableCell>{change.field}</TableCell>
              <TableCell className="text-muted-foreground">
                {valueText(change.from)}
              </TableCell>
              <TableCell className="font-medium">
                {valueText(change.to)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {entry.changeCount > entry.changes.length && (
        <p className="text-sm text-muted-foreground">
          Showing the first {entry.changes.length} of {entry.changeCount}{" "}
          changes.
        </p>
      )}
    </div>
  );
}
