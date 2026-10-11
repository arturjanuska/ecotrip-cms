"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  applyForm,
  changedFields,
  formFields,
  pathKey,
  setField,
  toForm,
  type FeeForm,
  type FieldPath,
} from "@/lib/fee-drafts";
import type { StoredFeeSettings } from "@/lib/fee-types";
import { fetchFeeSettings, saveFeeSettings } from "@/lib/fees-client";
import { parseCellNumber } from "@/lib/price-drafts";
import { cn } from "@/lib/utils";

// Help texts agreed with the owner (docs/superpowers/specs/2026-10-11-fees-design.md).
const HELP = {
  addressFee:
    "Added once to an order with the shopping address service. Example: 3 → the order total grows by £3 (or €3).",
  threshold:
    "Sum of the item prices that decides who pays for the items. Below it we pay with our money and the item prices are added to the order; from it the client pays the seller. Example: 250 → items for £249 are bought with our money, items for £250 with the client's.",
  ownMoney:
    "Fee when the items cost less than the threshold: percent of the item prices, at least min, at most max (empty = no limit). Example: 3%, min 5 → items for £100 give £5 (3% is £3, raised to the min); items for £200 give £6.",
  clientMoney:
    "Fee when the items cost the threshold or more. Example: 2%, min 15, max 50 → £500 gives £15, £1,000 gives £20, £3,000 gives £50.",
  salesService:
    "Fee from the item prices the client enters. Example: 2%, min 15, max 50 → an item for £400 gives £15, for £1,500 gives £30.",
  smallParcel:
    "Applies when at least one side is up to max side and the weight is up to max weight. Example: 45 cm, 2 kg, 4.19 → a 40×50×60 cm parcel of 1.5 kg adds £4.19.",
  mediumParcel:
    "Applies when the small rule does not and at least one side is up to max side: the first tier whose weight limit is not exceeded. Example: 61 cm; up to 10 kg → 7.59 → a 60×70×80 cm parcel of 8 kg adds £7.59. Heavier than the last tier: the zone rule below.",
  zones:
    "Applies when neither rule above does and the order's UK postcode is in a ParcelForce area: fee of that postcode's zone (set in Postcodes). Example: Zone 2 → 19 → a 25 kg parcel to a Zone 2 postcode adds £19.",
  quantityDiscounts:
    "Discount on the whole order by the number of parcels; the row with the largest N not above the count applies, the last row covers more. If the postcode has its own discount, the larger one applies. Example: from 3 → 5% → an order of 3 parcels for £200 costs £190.",
};

const MONEY = "£/€";

// What every input needs to show its value, highlight and error.
type FieldState = {
  fields: Record<string, string>;
  changed: Set<string>;
  errors: Record<string, string>;
  onChange: (path: FieldPath, text: string) => void;
};

type NumberFieldProps = {
  state: FieldState;
  path: FieldPath;
  label: string;
  // Shown above the input; without it the label is only for screen readers.
  showLabel?: boolean;
  suffix?: string;
  placeholder?: string;
};

function NumberField({
  state,
  path,
  label,
  showLabel = true,
  suffix,
  placeholder,
}: NumberFieldProps) {
  const key = pathKey(path);
  const error = state.errors[key];

  return (
    <div className="space-y-1">
      {showLabel && (
        <label htmlFor={key} className="block text-xs font-medium">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1">
        <Input
          id={key}
          inputMode="decimal"
          value={state.fields[key] ?? ""}
          placeholder={placeholder}
          aria-label={showLabel ? undefined : label}
          aria-invalid={error ? true : undefined}
          className={cn("w-24", state.changed.has(key) && "bg-brand/10")}
          onChange={(event) => state.onChange(path, event.target.value)}
        />
        {suffix && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PercentFeeFields({
  state,
  path,
}: {
  state: FieldState;
  path: FieldPath;
}) {
  return (
    <>
      <NumberField
        state={state}
        path={[...path, "percent"]}
        label="Percent"
        suffix="%"
      />
      <NumberField
        state={state}
        path={[...path, "min"]}
        label="Min"
        suffix={MONEY}
        placeholder="no limit"
      />
      <NumberField
        state={state}
        path={[...path, "max"]}
        label="Max"
        suffix={MONEY}
        placeholder="no limit"
      />
    </>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// One setting: its label, its inputs and the help text under them.
function FieldGroup({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
      <p className="max-w-3xl text-sm text-muted-foreground">{help}</p>
    </div>
  );
}

function ListError({ state, path }: { state: FieldState; path: string }) {
  const error = state.errors[path];
  return error ? <p className="text-xs text-destructive">{error}</p> : null;
}

export function FeesForm() {
  const { getToken } = useAuth();
  // undefined: loading; null: not seeded yet.
  const [saved, setSaved] = useState<StoredFeeSettings | null>();
  const [form, setForm] = useState<FeeForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchFeeSettings(controller.signal)
      .then((settings) => {
        setSaved(settings);
        setForm(settings && toForm(settings));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load fees",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const savedForm = useMemo(() => saved && toForm(saved), [saved]);
  const changed = useMemo(
    () =>
      savedForm && form ? changedFields(savedForm, form) : new Set<string>(),
    [savedForm, form],
  );
  const applied = useMemo(() => form && applyForm(form), [form]);
  const fields = useMemo(() => (form ? formFields(form) : {}), [form]);
  const unsaved = changed.size;

  useEffect(() => {
    if (unsaved === 0) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  if (saved === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (saved === null || !form || !applied) {
    return (
      <p className="text-sm text-muted-foreground">
        No fees yet. Fill them with npm run import:fees -- --write.
      </p>
    );
  }

  const invalid =
    Object.keys(applied.fieldErrors).length > 0 ||
    applied.formErrors.length > 0;

  const edit = (next: FeeForm) => {
    setForm(next);
    setJustSaved(false);
  };
  const state: FieldState = {
    fields,
    changed,
    errors: applied.fieldErrors,
    onChange: (path, text) => edit(setField(form, path, text)),
  };
  const { tiers } = form.parcelForce.medium;
  const discounts = form.quantityDiscounts;

  const addTier = () => {
    const next = structuredClone(form);
    next.parcelForce.medium.tiers.push({ upToWeight: "", fee: "" });
    edit(next);
  };
  const removeTier = (index: number) => {
    const next = structuredClone(form);
    next.parcelForce.medium.tiers.splice(index, 1);
    edit(next);
  };
  const addDiscount = () => {
    const last = parseCellNumber(discounts[discounts.length - 1].fromParcels);
    const next = structuredClone(form);
    next.quantityDiscounts.push({
      fromParcels: typeof last === "number" ? String(Math.floor(last) + 1) : "",
      percent: "",
    });
    edit(next);
  };
  const removeDiscount = (index: number) => {
    const next = structuredClone(form);
    next.quantityDiscounts.splice(index, 1);
    edit(next);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveFeeSettings(saved, applied.settings, () =>
        getToken({ skipCache: true }),
      );
      if (!result.ok) {
        // The draft stays: the admin can copy it after a reload (409).
        setSaveError(result.message);
        return;
      }
      setSaved(result.body);
      setForm(toForm(result.body));
      setJustSaved(true);
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-6 space-y-1 border-b bg-background/95 px-6 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {unsaved > 0 && (
            <span className="text-sm text-muted-foreground">
              Unsaved: {unsaved}
            </span>
          )}
          {justSaved && unsaved === 0 && (
            <span className="text-sm text-muted-foreground">Saved.</span>
          )}
          <Button disabled={unsaved === 0 || saving || invalid} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        {saveError && (
          <p className="text-right text-sm text-destructive">{saveError}</p>
        )}
        {applied.formErrors.length > 0 && (
          <ul className="space-y-0.5 text-right text-sm text-destructive">
            {applied.formErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Disabled while saving: the saved document replaces the form. */}
      <fieldset disabled={saving} className="space-y-6">
        <Section title="Address service">
          <FieldGroup label="Fee" help={HELP.addressFee}>
            <NumberField
              state={state}
              path={["addressService", "fee"]}
              label="Fee"
              showLabel={false}
              suffix={MONEY}
            />
          </FieldGroup>
        </Section>

        <Section
          title="Purchase service"
          subtitle="We buy the item for the client"
        >
          <FieldGroup label="Threshold" help={HELP.threshold}>
            <NumberField
              state={state}
              path={["purchaseService", "threshold"]}
              label="Threshold"
              showLabel={false}
              suffix={MONEY}
            />
          </FieldGroup>
          <FieldGroup label="Our money" help={HELP.ownMoney}>
            <PercentFeeFields
              state={state}
              path={["purchaseService", "ownMoney"]}
            />
          </FieldGroup>
          <FieldGroup label="Client's money" help={HELP.clientMoney}>
            <PercentFeeFields
              state={state}
              path={["purchaseService", "clientMoney"]}
            />
          </FieldGroup>
        </Section>

        <Section title="Sales service" subtitle="We sell the client's item">
          <FieldGroup label="Fee" help={HELP.salesService}>
            <PercentFeeFields state={state} path={["salesService"]} />
          </FieldGroup>
        </Section>

        <Section
          title="ParcelForce surcharges"
          subtitle="Added to each parcel of the ParcelForce service"
        >
          <FieldGroup label="Small parcel" help={HELP.smallParcel}>
            <NumberField
              state={state}
              path={["parcelForce", "small", "maxSide"]}
              label="Max side"
              suffix="cm"
            />
            <NumberField
              state={state}
              path={["parcelForce", "small", "maxWeight"]}
              label="Max weight"
              suffix="kg"
            />
            <NumberField
              state={state}
              path={["parcelForce", "small", "fee"]}
              label="Fee"
              suffix={MONEY}
            />
          </FieldGroup>

          <FieldGroup label="Medium parcel" help={HELP.mediumParcel}>
            <div className="space-y-3">
              <NumberField
                state={state}
                path={["parcelForce", "medium", "maxSide"]}
                label="Max side"
                suffix="cm"
              />
              <div className="space-y-2">
                <p className="text-xs font-medium">Weight tiers</p>
                {tiers.map((_, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="pt-1.5 text-sm">up to</span>
                    <NumberField
                      state={state}
                      path={[
                        "parcelForce",
                        "medium",
                        "tiers",
                        index,
                        "upToWeight",
                      ]}
                      label={`Tier ${index + 1} weight limit`}
                      showLabel={false}
                      suffix="kg →"
                    />
                    <NumberField
                      state={state}
                      path={["parcelForce", "medium", "tiers", index, "fee"]}
                      label={`Tier ${index + 1} fee`}
                      showLabel={false}
                      suffix={MONEY}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-0.5"
                      disabled={tiers.length === 1}
                      onClick={() => removeTier(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <ListError state={state} path="parcelForce.medium.tiers" />
                <Button variant="outline" size="sm" onClick={addTier}>
                  Add tier
                </Button>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label="Zones" help={HELP.zones}>
            <div className="space-y-2">
              {form.parcelForce.zones.map((row, index) => (
                <div key={row.zone} className="flex items-start gap-2">
                  <span className="w-16 pt-1.5 text-sm">{row.zone}</span>
                  <NumberField
                    state={state}
                    path={["parcelForce", "zones", index, "fee"]}
                    label={`${row.zone} fee`}
                    showLabel={false}
                    suffix={MONEY}
                  />
                </div>
              ))}
              <ListError state={state} path="parcelForce.zones" />
            </div>
          </FieldGroup>
        </Section>

        <Section
          title="Quantity discounts"
          subtitle="One sender to one receiver"
        >
          <FieldGroup label="Discount rows" help={HELP.quantityDiscounts}>
            <div className="space-y-2">
              {discounts.map((row, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="pt-1.5 text-sm">From</span>
                  {index === 0 ? (
                    // The first row always starts from 1 parcel.
                    <span className="w-24 px-2.5 pt-1.5 text-sm">
                      {row.fromParcels}
                    </span>
                  ) : (
                    <NumberField
                      state={state}
                      path={["quantityDiscounts", index, "fromParcels"]}
                      label={`Row ${index + 1} number of parcels`}
                      showLabel={false}
                    />
                  )}
                  <span className="pt-1.5 text-sm">parcels →</span>
                  <NumberField
                    state={state}
                    path={["quantityDiscounts", index, "percent"]}
                    label={`Row ${index + 1} discount`}
                    showLabel={false}
                    suffix="%"
                  />
                  {index > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-0.5"
                      onClick={() => removeDiscount(index)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              <ListError state={state} path="quantityDiscounts" />
              <Button variant="outline" size="sm" onClick={addDiscount}>
                Add row
              </Button>
            </div>
          </FieldGroup>
        </Section>
      </fieldset>
    </div>
  );
}
