"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  applyDrafts,
  cellKey,
  cellText,
  pruneDrafts,
  readCell,
  setDraft,
  type CategoryDrafts,
  type DraftField,
} from "@/lib/price-drafts";
import type { SheetTarget } from "@/lib/price-sheet-key";
import type { Category, StoredCategory } from "@/lib/price-types";
import { fetchPriceCatalog, saveCategory } from "@/lib/prices-client";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { label: "Type", width: 220 },
  { label: "Size", width: 200 },
  { label: "Specification", width: 160 },
  { label: "Volume (m³)", width: 120 },
  { label: "Weight (kg)", width: 120 },
  { label: "UK→LT (£)", width: 140 },
  { label: "LT→UK (€)", width: 140 },
];
const TABLE_MIN_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0);

// One table row: a variant, a tier (its limit sits in the Weight or Volume
// column of its basis) or a contact-manager item without prices.
type PriceRowModel =
  | { kind: "variant"; key: string; target: SheetTarget }
  | {
      kind: "tier";
      key: string;
      target: SheetTarget;
      basis: "weight" | "volume";
    }
  | { kind: "callManager"; key: string; label: string };

function tableRows(category: Category): PriceRowModel[] {
  const parts = category.pricing
    ? [{ label: category.label, pricing: category.pricing }]
    : category.subCategories.map((sub) => ({
        label: sub.label,
        pricing: sub.pricing,
      }));

  return parts.flatMap(({ label, pricing }): PriceRowModel[] => {
    if (pricing.type === "callManager") {
      return [{ kind: "callManager", key: `call:${label}`, label }];
    }
    if (pricing.type === "fixed") {
      return pricing.variants.map((item) => ({
        kind: "variant",
        key: cellKey(item.sheet, "price.UK-LT"),
        target: { kind: "variant", category: category.value, item },
      }));
    }
    return (["byWeight", "byVolume"] as const).flatMap((basis) =>
      (pricing[basis] ?? []).map((item): PriceRowModel => ({
        kind: "tier",
        key: cellKey(item.sheet, "price.UK-LT"),
        target: { kind: "tier", category: category.value, item },
        basis: basis === "byWeight" ? "weight" : "volume",
      })),
    );
  });
}

type CellProps = {
  target: SheetTarget;
  field: DraftField;
  drafts: CategoryDrafts;
  errors: Record<string, string>;
  suffix?: string;
  placeholder?: string;
  onChange: (key: string, text: string, saved: number | null) => void;
};

function NumberCell({
  target,
  field,
  drafts,
  errors,
  suffix,
  placeholder,
  onChange,
}: CellProps) {
  const key = cellKey(target.item.sheet, field);
  const saved = readCell(target, field) ?? null;
  const draft = drafts[key];
  const error = errors[key];

  return (
    <div className="flex items-center gap-1">
      <Input
        inputMode="decimal"
        value={draft ?? cellText(saved)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        title={error}
        className={cn(draft !== undefined && "bg-brand/10")}
        onChange={(event) => onChange(key, event.target.value, saved)}
      />
      {suffix && (
        <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>
      )}
    </div>
  );
}

type BlockProps = {
  category: StoredCategory;
  drafts: CategoryDrafts;
  saving: boolean;
  error: string | undefined;
  onChange: (
    category: string,
    key: string,
    text: string,
    saved: number | null,
  ) => void;
  onSave: (category: StoredCategory, next: Category) => void;
};

const CategoryBlock = memo(function CategoryBlock({
  category,
  drafts,
  saving,
  error,
  onChange,
  onSave,
}: BlockProps) {
  const rows = useMemo(() => tableRows(category), [category]);
  const applied = useMemo(
    () => applyDrafts(category, drafts),
    [category, drafts],
  );
  const unsaved = Object.keys(drafts).length;
  const invalid =
    Object.keys(applied.cellErrors).length > 0 || applied.formErrors.length > 0;
  const change = useCallback(
    (key: string, text: string, saved: number | null) =>
      onChange(category.value, key, text, saved),
    [category.value, onChange],
  );
  const cell = (
    target: SheetTarget,
    field: DraftField,
    extra: Partial<CellProps> = {},
  ) => (
    <NumberCell
      target={target}
      field={field}
      drafts={drafts}
      errors={applied.cellErrors}
      onChange={change}
      {...extra}
    />
  );

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-semibold">{category.sheet}</h2>
        {unsaved > 0 && (
          <span className="text-sm text-muted-foreground">
            Unsaved: {unsaved}
          </span>
        )}
        <Button
          disabled={unsaved === 0 || saving || invalid}
          onClick={() => onSave(category, applied.category)}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {applied.formErrors.length > 0 && (
        <ul className="space-y-0.5 text-sm text-destructive">
          {applied.formErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <Table className="table-fixed" style={{ minWidth: TABLE_MIN_WIDTH }}>
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.label} style={{ width: column.width }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead key={column.label}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            if (row.kind === "callManager") {
              return (
                <TableRow key={row.key} className="text-muted-foreground">
                  <TableCell>{row.label}</TableCell>
                  <TableCell colSpan={COLUMNS.length - 1}>
                    Contact manager
                  </TableCell>
                </TableRow>
              );
            }

            const { sheet } = row.target.item;
            const perUnit =
              row.kind === "tier" &&
              row.target.kind === "tier" &&
              row.target.item.perUnit
                ? row.basis === "weight"
                  ? "/kg"
                  : "/m³"
                : undefined;

            return (
              <TableRow key={row.key}>
                <TableCell className="whitespace-normal">
                  {sheet.type}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {sheet.size}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {sheet.spec}
                </TableCell>
                {row.kind === "variant" ? (
                  <>
                    <TableCell>{cell(row.target, "volume")}</TableCell>
                    <TableCell>{cell(row.target, "weight")}</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>
                      {row.basis === "volume" &&
                        cell(row.target, "upTo", {
                          placeholder: "no limit",
                          suffix: "max",
                        })}
                    </TableCell>
                    <TableCell>
                      {row.basis === "weight" &&
                        cell(row.target, "upTo", {
                          placeholder: "no limit",
                          suffix: "max",
                        })}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  {cell(row.target, "price.UK-LT", { suffix: perUnit })}
                </TableCell>
                <TableCell>
                  {cell(row.target, "price.LT-UK", { suffix: perUnit })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
});

function without<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export function PricesTable() {
  const { getToken } = useAuth();
  const [categories, setCategories] = useState<StoredCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CategoryDrafts>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    fetchPriceCatalog(controller.signal)
      .then(setCategories)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load prices",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const unsavedCount = Object.values(drafts).reduce(
    (sum, category) => sum + Object.keys(category).length,
    0,
  );

  useEffect(() => {
    if (unsavedCount === 0) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedCount]);

  const change = useCallback(
    (category: string, key: string, text: string, saved: number | null) => {
      setDrafts((current) => {
        const next = setDraft(current[category] ?? {}, key, text, saved);
        return Object.keys(next).length > 0
          ? { ...current, [category]: next }
          : without(current, category);
      });
    },
    [],
  );

  const save = useCallback(
    async (category: StoredCategory, next: Category) => {
      const value = category.value;
      setSaving((current) => ({ ...current, [value]: true }));
      setSaveErrors((current) => without(current, value));

      try {
        const result = await saveCategory(category, next, () =>
          getToken({ skipCache: true }),
        );
        if (!result.ok) {
          setSaveErrors((current) => ({ ...current, [value]: result.message }));
          return;
        }

        const saved = result.body;
        setCategories(
          (current) =>
            current?.map((item) => (item.value === value ? saved : item)) ??
            current,
        );
        // Keep whatever was typed after Save was clicked.
        setDrafts((current) => {
          const rest = pruneDrafts(saved, current[value] ?? {});
          return Object.keys(rest).length > 0
            ? { ...current, [value]: rest }
            : without(current, value);
        });
      } catch {
        setSaveErrors((current) => ({ ...current, [value]: "Network error" }));
      } finally {
        setSaving((current) => ({ ...current, [value]: false }));
      }
    },
    [getToken],
  );

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  if (!categories) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No prices yet. Fill them with npm run import:prices -- --write.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {unsavedCount > 0 && (
        <p className="text-sm text-muted-foreground">
          Unsaved changes: {unsavedCount}. Save each category you changed.
        </p>
      )}
      {categories.map((category) => (
        <CategoryBlock
          key={category.value}
          category={category}
          drafts={drafts[category.value] ?? EMPTY_DRAFTS}
          saving={saving[category.value] ?? false}
          error={saveErrors[category.value]}
          onChange={change}
          onSave={save}
        />
      ))}
    </div>
  );
}

const EMPTY_DRAFTS: CategoryDrafts = {};
