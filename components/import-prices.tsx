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

function formatValue(value: number | null) {
  return value === null ? "empty" : String(value);
}

export function ImportPrices() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [catalog, setCatalog] = useState<StoredCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [diff, setDiff] = useState<SheetDiff | null>(null);
  // Indexes of changes the user unticked.
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Bumped to load the prices again (after a 409).
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPriceCatalog(controller.signal)
      .then(setCatalog)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load prices",
          );
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
      setFileError("The file is larger than 1 MB. Is it the price list?");
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
        setApplyError(result.message);
        if (result.status === 409) {
          // The preview is out of date: reload prices so the file can be read again.
          setDiff(null);
          setCatalog(null);
          setReload((current) => current + 1);
        }
        return;
      }
      router.push(`/prices?imported=${result.body.updated}`);
    } catch {
      setApplyError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  const selected = diff ? diff.changes.length - excluded.size : 0;
  const errorLines = new Set(diff?.errors.map((error) => error.line));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          In Google Sheets open the price list, then File → Download →
          Comma-separated values (.csv), and choose the file here.
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
        {fileError && <p className="text-sm text-destructive">{fileError}</p>}
        {applyError && <p className="text-sm text-destructive">{applyError}</p>}
      </div>

      {diff && (
        <>
          <Section title={`Changes (${diff.changes.length})`}>
            {diff.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every price in the file is already in the CMS.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Row</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Specification</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Now → In file</TableHead>
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
                          aria-label={`Apply row ${change.line} ${FIELD_LABELS[change.field]}`}
                          checked={!excluded.has(index)}
                          onChange={() => toggle(index)}
                        />
                      </TableCell>
                      <TableCell>{change.line}</TableCell>
                      <TableCell className="whitespace-normal">
                        {categorySheets.get(change.category)}
                      </TableCell>
                      <RowTexts sheet={change.sheet} />
                      <TableCell>{FIELD_LABELS[change.field]}</TableCell>
                      <TableCell>
                        {formatValue(change.from)} →{" "}
                        <span className="font-medium">
                          {formatValue(change.to)}
                        </span>
                        {change.to === null ? (
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            (clears the value)
                          </span>
                        ) : (
                          errorLines.has(change.line) && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              (row has errors)
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
            <Section title={`Errors (${diff.errors.length})`}>
              <p className="text-sm text-muted-foreground">
                These cells are not applied. Fix them in the spreadsheet or in
                the CMS.
              </p>
              <ul className="space-y-0.5 text-sm text-destructive">
                {diff.errors.map((error) => (
                  <li key={`${error.line}:${error.message}`}>
                    Row {error.line}: {error.message}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {diff.unknown.length > 0 && (
            <Section title={`Unknown rows (${diff.unknown.length})`}>
              <p className="text-sm text-muted-foreground">
                Not in the CMS, so not applied. New items also need translations
                on the site, so a developer adds them: a new category goes into
                scripts/data/price-catalog.json and npm run import:prices, a new
                row in an existing category goes through PUT
                /api/prices/:category.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Specification</TableHead>
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
            <Section title={`Missing rows (${diff.missing.length})`}>
              <p className="text-sm text-muted-foreground">
                In the CMS but not in the file. Nothing is deleted.
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
              {busy ? "Applying…" : `Apply ${selected} changes`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
