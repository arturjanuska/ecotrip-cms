"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
import {
  NETWORK_ERROR,
  loadProblem,
  problemText,
  writeProblem,
  type Problem,
} from "@/lib/api-errors";
import { readCache, writeCache } from "@/lib/client-cache";
import { useT } from "@/lib/i18n/client";
import { fetchFeeSettings, saveFeeSettings } from "@/lib/fees-client";
import { parseCellNumber } from "@/lib/price-drafts";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";

// Help texts agreed with the owner (docs/superpowers/specs/2026-10-11-fees-design.md),
// in messages under feesPage.help.
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
  const t = useT();
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
      {error && <p className="text-xs text-destructive">{t(error)}</p>}
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
  const t = useT();
  return (
    <>
      <NumberField
        state={state}
        path={[...path, "percent"]}
        label={t("fees.percent")}
        suffix="%"
      />
      <NumberField
        state={state}
        path={[...path, "min"]}
        label={t("fees.min")}
        suffix={MONEY}
        placeholder={t("common.noLimit")}
      />
      <NumberField
        state={state}
        path={[...path, "max"]}
        label={t("fees.max")}
        suffix={MONEY}
        placeholder={t("common.noLimit")}
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
  const t = useT();
  const error = state.errors[path];
  return error ? <p className="text-xs text-destructive">{t(error)}</p> : null;
}

const FEES_CACHE_KEY = "fees";

export function FeesForm() {
  const { getToken } = useAuth();
  const t = useT();
  // undefined: loading; null: not seeded yet.
  const [saved, setSaved] = useState<StoredFeeSettings | null | undefined>(() =>
    readCache<StoredFeeSettings>(FEES_CACHE_KEY),
  );
  const [form, setForm] = useState<FeeForm | null>(() => {
    const cached = readCache<StoredFeeSettings>(FEES_CACHE_KEY);
    return cached ? toForm(cached) : null;
  });
  const [loadError, setLoadError] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<Problem | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchFeeSettings(controller.signal)
      .then((settings) => {
        // Same version as the cached one shown: keep the form, it may
        // already be edited.
        const cached = readCache<StoredFeeSettings>(FEES_CACHE_KEY);
        if (settings && cached && settings.updatedAt === cached.updatedAt) {
          return;
        }
        setSaved(settings);
        setForm(settings && toForm(settings));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(loadProblem(error, "errors.loadFees"));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (saved) {
      writeCache(FEES_CACHE_KEY, saved);
    }
  }, [saved]);

  const savedForm = useMemo(() => saved && toForm(saved), [saved]);
  const changed = useMemo(
    () =>
      savedForm && form ? changedFields(savedForm, form) : new Set<string>(),
    [savedForm, form],
  );
  const applied = useMemo(() => form && applyForm(form), [form]);
  const fields = useMemo(() => (form ? formFields(form) : {}), [form]);
  const unsaved = changed.size;

  useUnsavedChanges(unsaved > 0);

  if (loadError) {
    return (
      <p className="text-sm text-destructive">{problemText(t, loadError)}</p>
    );
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
      <p className="text-sm text-muted-foreground">{t("feesPage.noFees")}</p>
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
        setSaveError(writeProblem(result.failure, "errors.requestFailed"));
        return;
      }
      setSaved(result.body);
      setForm(toForm(result.body));
      setJustSaved(true);
    } catch {
      setSaveError(NETWORK_ERROR);
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
              {t("common.unsaved", { count: unsaved })}
            </span>
          )}
          {justSaved && unsaved === 0 && (
            <span className="text-sm text-muted-foreground">
              {t("common.saved")}
            </span>
          )}
          <Button disabled={unsaved === 0 || saving || invalid} onClick={save}>
            {saving && <Spinner />}
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
        {saveError && (
          <p className="text-right text-sm text-destructive">
            {problemText(t, saveError)}
          </p>
        )}
        {applied.formErrors.length > 0 && (
          <ul className="space-y-0.5 text-right text-sm text-destructive">
            {applied.formErrors.map((message) => (
              <li key={message}>{t(message)}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Disabled while saving: the saved document replaces the form. */}
      <fieldset disabled={saving} className="space-y-6">
        <Section title={t("fees.addressService")}>
          <FieldGroup
            label={t("fees.fee")}
            help={t("feesPage.help.addressFee")}
          >
            <NumberField
              state={state}
              path={["addressService", "fee"]}
              label={t("fees.fee")}
              showLabel={false}
              suffix={MONEY}
            />
          </FieldGroup>
        </Section>

        <Section
          title={t("fees.purchaseService")}
          subtitle={t("feesPage.purchaseSubtitle")}
        >
          <FieldGroup
            label={t("fees.threshold")}
            help={t("feesPage.help.threshold")}
          >
            <NumberField
              state={state}
              path={["purchaseService", "threshold"]}
              label={t("fees.threshold")}
              showLabel={false}
              suffix={MONEY}
            />
          </FieldGroup>
          <FieldGroup
            label={t("fees.ownMoney")}
            help={t("feesPage.help.ownMoney")}
          >
            <PercentFeeFields
              state={state}
              path={["purchaseService", "ownMoney"]}
            />
          </FieldGroup>
          <FieldGroup
            label={t("fees.clientMoney")}
            help={t("feesPage.help.clientMoney")}
          >
            <PercentFeeFields
              state={state}
              path={["purchaseService", "clientMoney"]}
            />
          </FieldGroup>
        </Section>

        <Section
          title={t("fees.salesService")}
          subtitle={t("feesPage.salesSubtitle")}
        >
          <FieldGroup
            label={t("fees.fee")}
            help={t("feesPage.help.salesService")}
          >
            <PercentFeeFields state={state} path={["salesService"]} />
          </FieldGroup>
        </Section>

        <Section
          title={t("feesPage.parcelForceTitle")}
          subtitle={t("feesPage.parcelForceSubtitle")}
        >
          <FieldGroup
            label={t("fees.small")}
            help={t("feesPage.help.smallParcel")}
          >
            <NumberField
              state={state}
              path={["parcelForce", "small", "maxSide"]}
              label={t("fees.maxSide")}
              suffix={t("feesPage.cm")}
            />
            <NumberField
              state={state}
              path={["parcelForce", "small", "maxWeight"]}
              label={t("fees.maxWeight")}
              suffix={t("feesPage.kg")}
            />
            <NumberField
              state={state}
              path={["parcelForce", "small", "fee"]}
              label={t("fees.fee")}
              suffix={MONEY}
            />
          </FieldGroup>

          <FieldGroup
            label={t("fees.medium")}
            help={t("feesPage.help.mediumParcel")}
          >
            <div className="space-y-3">
              <NumberField
                state={state}
                path={["parcelForce", "medium", "maxSide"]}
                label={t("fees.maxSide")}
                suffix={t("feesPage.cm")}
              />
              <div className="space-y-2">
                <p className="text-xs font-medium">
                  {t("feesPage.weightTiers")}
                </p>
                {tiers.map((_, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="pt-1.5 text-sm">{t("feesPage.upTo")}</span>
                    <NumberField
                      state={state}
                      path={[
                        "parcelForce",
                        "medium",
                        "tiers",
                        index,
                        "upToWeight",
                      ]}
                      label={t("feesPage.tierLimit", { n: index + 1 })}
                      showLabel={false}
                      suffix={`${t("feesPage.kg")} →`}
                    />
                    <NumberField
                      state={state}
                      path={["parcelForce", "medium", "tiers", index, "fee"]}
                      label={t("feesPage.tierFee", { n: index + 1 })}
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
                      {t("common.remove")}
                    </Button>
                  </div>
                ))}
                <ListError state={state} path="parcelForce.medium.tiers" />
                <Button variant="outline" size="sm" onClick={addTier}>
                  {t("feesPage.addTier")}
                </Button>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("fees.zones")} help={t("feesPage.help.zones")}>
            <div className="space-y-2">
              {form.parcelForce.zones.map((row, index) => (
                <div key={row.zone} className="flex items-start gap-2">
                  <span className="w-16 pt-1.5 text-sm">{row.zone}</span>
                  <NumberField
                    state={state}
                    path={["parcelForce", "zones", index, "fee"]}
                    label={t("feesPage.zoneFee", { zone: row.zone })}
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
          title={t("fees.quantityDiscounts")}
          subtitle={t("feesPage.quantitySubtitle")}
        >
          <FieldGroup
            label={t("feesPage.discountRows")}
            help={t("feesPage.help.quantityDiscounts")}
          >
            <div className="space-y-2">
              {discounts.map((row, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="pt-1.5 text-sm">{t("feesPage.from")}</span>
                  {index === 0 ? (
                    // The first row always starts from 1 parcel.
                    <span className="w-24 px-2.5 pt-1.5 text-sm">
                      {row.fromParcels}
                    </span>
                  ) : (
                    <NumberField
                      state={state}
                      path={["quantityDiscounts", index, "fromParcels"]}
                      label={t("feesPage.rowParcels", { n: index + 1 })}
                      showLabel={false}
                    />
                  )}
                  <span className="pt-1.5 text-sm">
                    {t("feesPage.parcels")}
                  </span>
                  <NumberField
                    state={state}
                    path={["quantityDiscounts", index, "percent"]}
                    label={t("feesPage.rowDiscount", { n: index + 1 })}
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
                      {t("common.remove")}
                    </Button>
                  )}
                </div>
              ))}
              <ListError state={state} path="quantityDiscounts" />
              <Button variant="outline" size="sm" onClick={addDiscount}>
                {t("feesPage.addRow")}
              </Button>
            </div>
          </FieldGroup>
        </Section>
      </fieldset>
    </div>
  );
}
