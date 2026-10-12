"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  CALENDAR_VALUES,
  DISCOUNT_HINT,
  PARCEL_FORCE_ZONES,
  isValidDiscount,
  sanitizeDiscountInput,
} from "@/lib/postcode-options";
import type { BulkChanges } from "@/lib/validation/postcode";
import { useT } from "@/lib/i18n/client";

// Labels: messages postcode.<field>.
const BULK_FIELDS = [
  { field: "calendar", options: CALENDAR_VALUES },
  { field: "parcelForceZone", options: PARCEL_FORCE_ZONES },
  { field: "discount", options: null },
  { field: "isParcelForce", options: null },
  { field: "active", options: null },
] as const;

// Fields set to yes or no.
const YES_NO_FIELDS = new Set<BulkField>(["isParcelForce", "active"]);

type BulkField = (typeof BULK_FIELDS)[number]["field"];

// Placeholder option: no value chosen yet ("" is a real value: empty).
const UNSET = "__unset";

type BulkEditBarProps = {
  selectedCount: number;
  busy: boolean;
  onApply: (changes: BulkChanges) => void;
  onClear: () => void;
};

export function BulkEditBar({
  selectedCount,
  busy,
  onApply,
  onClear,
}: BulkEditBarProps) {
  const t = useT();
  const [field, setField] = useState<BulkField>("calendar");
  const [value, setValue] = useState<string | null>(null);

  const config = BULK_FIELDS.find((item) => item.field === field)!;
  const valid =
    value !== null && (field !== "discount" || isValidDiscount(value));

  function changeField(next: BulkField) {
    setField(next);
    setValue(null);
  }

  function apply() {
    if (value === null) {
      return;
    }

    const yesNo = YES_NO_FIELDS.has(field);
    const changes: BulkChanges = yesNo
      ? { [field]: value === "yes" }
      : { [field]: value };
    const shown = yesNo
      ? t(value === "yes" ? "common.yes" : "common.no")
      : value || t("bulk.emptyValue");

    if (
      window.confirm(
        t("bulk.confirm", {
          field: { key: `postcode.${config.field}` },
          value: shown,
          count: selectedCount,
        }),
      )
    ) {
      onApply(changes);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
      <span className="font-medium">
        {t("bulk.selected", { count: selectedCount })}
      </span>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("bulk.set")}</span>
        <NativeSelect
          value={field}
          onChange={(event) => changeField(event.target.value as BulkField)}
        >
          {BULK_FIELDS.map((item) => (
            <option key={item.field} value={item.field}>
              {t(`postcode.${item.field}`)}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("bulk.to")}</span>
        {field === "discount" ? (
          <Input
            className="w-28"
            inputMode="decimal"
            placeholder="0-100"
            title={t(DISCOUNT_HINT)}
            value={value ?? ""}
            aria-invalid={value !== null && !valid ? true : undefined}
            onChange={(event) =>
              setValue(sanitizeDiscountInput(event.target.value))
            }
          />
        ) : (
          <NativeSelect
            value={value ?? UNSET}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value={UNSET} disabled>
              {t("bulk.chooseValue")}
            </option>
            {YES_NO_FIELDS.has(field) ? (
              <>
                <option value="yes">{t("common.yes")}</option>
                <option value="no">{t("common.no")}</option>
              </>
            ) : (
              <>
                <option value="">{t("bulk.emptyOption")}</option>
                {config.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </>
            )}
          </NativeSelect>
        )}
      </label>
      <Button size="sm" disabled={!valid || busy} onClick={apply}>
        {t("bulk.applyTo", { count: selectedCount })}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>
        {t("bulk.clearSelection")}
      </Button>
    </div>
  );
}
