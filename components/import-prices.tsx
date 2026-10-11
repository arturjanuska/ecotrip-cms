"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FIELD_LABELS,
  diffPriceSheet,
  riskyChanges,
  type SheetDiff,
} from "@/lib/price-diff";
import { SHEET_MAX_BYTES, parsePriceSheet } from "@/lib/price-sheet";
import type { SheetKey, StoredCategory } from "@/lib/price-types";
import { fetchPriceCatalog, importPriceChanges } from "@/lib/prices-client";
import {
  NETWORK_ERROR,
  loadProblem,
  problemText,
  writeProblem,
  type Problem,
} from "@/lib/api-errors";
import { useT, useHeaderT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

function RowTexts({ sheet }: { sheet: SheetKey }) {
  return (
    <>
      <TableCell className="whitespace-normal">{sheet.type}</TableCell>
      <TableCell className="whitespace-normal">{sheet.size}</TableCell>
      <TableCell className="whitespace-normal">{sheet.spec}</TableCell>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function formatValue(t: Translate, value: number | null) {
  return value === null ? t("importPrices.emptyValue") : String(value);
}

// Column headers shared by the changes and unknown rows tables.
function RowHeads() {
  const th = useHeaderT();
  return (
    <>
      <TableHead>{th("price.category")}</TableHead>
      <TableHead>{th("price.type")}</TableHead>
      <TableHead>{th("price.size")}</TableHead>
      <TableHead>{th("price.spec")}</TableHead>
    </>
  );
}

export function ImportPrices() {
  const t = useT();
  const th = useHeaderT();
  const router = useRouter();
  const { getToken } = useAuth();
  const [catalog, setCatalog] = useState<StoredCategory[] | null>(null);
  const [loadError, setLoadError] = useState<Problem | null>(null);
  // A msg() string (lib/i18n/translate.ts).
  const [fileError, setFileError] = useState<string | null>(null);
  const [diff, setDiff] = useState<SheetDiff | null>(null);
  // Indexes of changes the user unticked.
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState<Problem | null>(null);

  // Bumped to load the prices again (after a 409).
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPriceCatalog(controller.signal)
      .then(setCatalog)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(loadProblem(error, "errors.loadPrices"));
        }
      });
    return () => controller.abort();
  }, [reload]);

  const categorySheets = useMemo(
    () =>
      new Map(
        (catalog ?? []).map((category) => [category.value, category.sheet]),
      ),
    [catalog],
  );

  async function chooseFile(file: File | undefined) {
    setDiff(null);
    setFileError(null);
    setApplyError(null);
    setExcluded(new Set());
    if (!file || !catalog) {
      return;
    }
    if (file.size > SHEET_MAX_BYTES) {
      setFileError("file.priceListTooLarge");
      return;
    }

    const parsed = parsePriceSheet(await file.text());
    if (parsed.error) {
      setFileError(parsed.error);
      return;
    }
    const nextDiff = diffPriceSheet(catalog, parsed.rows);
    setDiff(nextDiff);
    setExcluded(riskyChanges(nextDiff));
  }

  function toggle(index: number) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  async function apply() {
    if (!diff) {
      return;
    }
    const changes = diff.changes
      .filter((_, index) => !excluded.has(index))
      .map((change) => ({
        category: change.category,
        sheet: change.sheet,
        field: change.field,
        from: change.from,
        to: change.to,
      }));

    setBusy(true);
    setApplyError(null);
    try {
      const result = await importPriceChanges(changes, () =>
        getToken({ skipCache: true }),
      );
      if (!result.ok) {
        setApplyError(writeProblem(result.failure, "errors.requestFailed"));
        if (result.failure.status === 409) {
          // The preview is out of date: reload prices so the file can be read again.
          setDiff(null);
          setCatalog(null);
          setReload((current) => current + 1);
        }
        return;
      }
      router.push(`/prices?imported=${result.body.updated}`);
    } catch {
      setApplyError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <p className="text-sm text-destructive">{problemText(t, loadError)}</p>
    );
  }

  const selected = diff ? diff.changes.length - excluded.size : 0;
  const errorLines = new Set(diff?.errors.map((error) => error.line));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t("importPrices.intro")}
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={!catalog || busy}
          onChange={(event) => {
            chooseFile(event.target.files?.[0]);
            // Allows choosing the same file again (after a 409 or a fixed file).
            event.target.value = "";
          }}
          className="text-sm"
        />
        {fileError && (
          <p className="text-sm text-destructive">{t(fileError)}</p>
        )}
        {applyError && (
          <p className="text-sm text-destructive">
            {problemText(t, applyError)}
          </p>
        )}
      </div>

      {diff && (
        <>
          <Section
            title={t("importPrices.changes", { count: diff.changes.length })}
          >
            {diff.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("importPrices.noChanges")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>{th("common.row")}</TableHead>
                    <RowHeads />
                    <TableHead>{th("importPrices.field")}</TableHead>
                    <TableHead>{th("importPrices.nowInFile")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.changes.map((change, index) => (
                    <TableRow
                      key={`${change.line}:${change.field}`}
                      className={cn(excluded.has(index) && "opacity-50")}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          aria-label={t("importPrices.applyRow", {
                            row: String(change.line),
                            field: { key: FIELD_LABELS[change.field] },
                          })}
                          checked={!excluded.has(index)}
                          onChange={() => toggle(index)}
                        />
                      </TableCell>
                      <TableCell>{change.line}</TableCell>
                      <TableCell className="whitespace-normal">
                        {categorySheets.get(change.category)}
                      </TableCell>
                      <RowTexts sheet={change.sheet} />
                      <TableCell>{t(FIELD_LABELS[change.field])}</TableCell>
                      <TableCell>
                        {formatValue(t, change.from)} →{" "}
                        <span className="font-medium">
                          {formatValue(t, change.to)}
                        </span>
                        {change.to === null ? (
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            {t("importPrices.clears")}
                          </span>
                        ) : (
                          errorLines.has(change.line) && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              {t("importPrices.rowHasErrors")}
                            </span>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>

          {diff.errors.length > 0 && (
            <Section
              title={t("importPrices.errors", { count: diff.errors.length })}
            >
              <p className="text-sm text-muted-foreground">
                {t("importPrices.errorsIntro")}
              </p>
              <ul className="space-y-0.5 text-sm text-destructive">
                {diff.errors.map((error) => (
                  <li key={`${error.line}:${error.message}`}>
                    {t("importPrices.rowError", {
                      row: String(error.line),
                      message: t(error.message),
                    })}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {diff.unknown.length > 0 && (
            <Section
              title={t("importPrices.unknown", { count: diff.unknown.length })}
            >
              <p className="text-sm text-muted-foreground">
                {t("importPrices.unknownIntro")}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{th("common.row")}</TableHead>
                    <RowHeads />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.unknown.map((row) => (
                    <TableRow key={row.line}>
                      <TableCell>{row.line}</TableCell>
                      <TableCell className="whitespace-normal">
                        {row.category}
                      </TableCell>
                      <RowTexts sheet={row} />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          )}

          {diff.missing.length > 0 && (
            <Section
              title={t("importPrices.missing", { count: diff.missing.length })}
            >
              <p className="text-sm text-muted-foreground">
                {t("importPrices.missingIntro")}
              </p>
              <ul className="space-y-0.5 text-sm">
                {diff.missing.map((row) => (
                  <li
                    key={`${row.category}:${row.sheet.type}:${row.sheet.size}:${row.sheet.spec}`}
                  >
                    {[
                      row.categorySheet,
                      row.sheet.type,
                      row.sheet.size,
                      row.sheet.spec,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="flex items-center gap-3">
            <Button disabled={selected === 0 || busy} onClick={apply}>
              {busy
                ? t("importPrices.applying")
                : t("importPrices.apply", { count: selected })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
