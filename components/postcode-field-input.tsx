"use client";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  CALENDAR_VALUES,
  DISCOUNT_HINT,
  ADDITIONAL_CHARGES_HINT,
  PARCEL_FORCE_ZONES,
  sanitizeAdditionalChargesInput,
  sanitizeDiscountInput,
} from "@/lib/postcode-options";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type PostcodeTextField =
  | "postcode"
  | "town"
  | "region"
  | "country"
  | "countryString"
  | "basicPrice"
  | "additionalCharges"
  | "parcelForceZone"
  | "discount"
  | "calendar";

// Fields restricted to a fixed list (plus empty).
const SELECT_OPTIONS: Partial<Record<PostcodeTextField, readonly string[]>> = {
  parcelForceZone: PARCEL_FORCE_ZONES,
  calendar: CALENDAR_VALUES,
};

// Number-only fields: what the input keeps while typing, and its tooltip.
const NUMBER_FIELDS: Partial<
  Record<PostcodeTextField, { sanitize: (raw: string) => string; hint: string }>
> = {
  discount: { sanitize: sanitizeDiscountInput, hint: DISCOUNT_HINT },
  additionalCharges: {
    sanitize: sanitizeAdditionalChargesInput,
    hint: ADDITIONAL_CHARGES_HINT,
  },
};

type PostcodeFieldInputProps = {
  field: PostcodeTextField;
  value: string;
  invalid?: boolean;
  className?: string;
  onChange: (value: string) => void;
};

// Editor for one postcode field: a select for fixed lists, a number-only input
// for discount and additional charges, a text input otherwise. Shared by the
// table and the import preview.
export function PostcodeFieldInput({
  field,
  value,
  invalid,
  className,
  onChange,
}: PostcodeFieldInputProps) {
  const t = useT();
  const options = SELECT_OPTIONS[field];

  if (options) {
    // A stored value outside the list (legacy data) stays visible and selectable.
    const legacy = value !== "" && !options.includes(value);

    return (
      <NativeSelect
        className={cn("w-full", className)}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">—</option>
        {legacy && <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelect>
    );
  }

  const numeric = NUMBER_FIELDS[field];

  return (
    <Input
      className={cn("w-full", className)}
      value={value}
      aria-invalid={invalid || undefined}
      inputMode={numeric ? "decimal" : undefined}
      title={numeric ? t(numeric.hint) : undefined}
      onChange={(event) => {
        const next = event.target.value;
        onChange(
          numeric
            ? numeric.sanitize(next)
            : field === "postcode"
              ? next.toUpperCase()
              : next,
        );
      }}
    />
  );
}
