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

const BULK_FIELDS = [
  { field: "calendar", label: "Calendar", options: CALENDAR_VALUES },
  {
    field: "parcelForceZone",
    label: "Parcel Force zone",
    options: PARCEL_FORCE_ZONES,
  },
  { field: "discount", label: "Discount %", options: null },
  { field: "active", label: "Active", options: null },
] as const;

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

    const changes: BulkChanges =
      field === "active" ? { active: value === "yes" } : { [field]: value };
    const shown =
      field === "active" ? (value === "yes" ? "Yes" : "No") : value || "empty";
    const noun = selectedCount === 1 ? "postcode" : "postcodes";

    if (
      window.confirm(
        `Set ${config.label} to "${shown}" for ${selectedCount} ${noun}?`,
      )
    ) {
      onApply(changes);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
      <span className="font-medium">Selected: {selectedCount}</span>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Set</span>
        <NativeSelect
          value={field}
          onChange={(event) => changeField(event.target.value as BulkField)}
        >
          {BULK_FIELDS.map((item) => (
            <option key={item.field} value={item.field}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">to</span>
        {field === "discount" ? (
          <Input
            className="w-28"
            inputMode="decimal"
            placeholder="0-100"
            title={DISCOUNT_HINT}
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
              Choose value
            </option>
            {field === "active" ? (
              <>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </>
            ) : (
              <>
                <option value="">— (empty)</option>
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
        Apply to {selectedCount}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
