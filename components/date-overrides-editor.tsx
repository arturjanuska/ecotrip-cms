"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  NETWORK_ERROR,
  loadProblem,
  problemText,
  writeProblem,
  type Problem,
} from "@/lib/api-errors";
import { readCache, writeCache } from "@/lib/client-cache";
import {
  DIRECTIONS,
  calculatedTrips,
  isEvenWeek,
  isoDate,
  parcelForceDeliveryOf,
  type DateOverride,
  type DateRange,
  type Direction,
  type StoredDateOverride,
  type Trip,
} from "@/lib/date-override-types";
import {
  createDateOverride,
  deleteDateOverride,
  fetchDateOverrides,
  saveDateOverride,
} from "@/lib/dates-client";
import type { Locale } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/client";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { cn } from "@/lib/utils";
import { dateOverrideSchema } from "@/lib/validation/date-override";

const CACHE_KEY = "dateOverrides";

const RANGE_ENDS = ["from", "to"] as const;
const PARTS = ["pickup", "delivery", "parcelForceDelivery"] as const;

// A trip as edited: the ParcelForce dates are always there, empty when not
// set (then ParcelForce delivers a week after the delivery).
type DraftTrip = Required<Trip>;

// A new object each time: trips must not share one (structuredClone keeps
// shared objects shared).
function noDates(): DateRange {
  return { from: "", to: "" };
}

function toDraft(trip: Trip): DraftTrip {
  return {
    ...trip,
    parcelForceDelivery: trip.parcelForceDelivery ?? noDates(),
  };
}

function toTrip({ pickup, delivery, parcelForceDelivery }: DraftTrip): Trip {
  return parcelForceDelivery.from || parcelForceDelivery.to
    ? { pickup, delivery, parcelForceDelivery }
    : { pickup, delivery };
}

// "29 Dec – 31 Dec".
function rangeText(locale: Locale, { from, to }: DateRange) {
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const day = (date: string) => format.format(Date.parse(`${date}T00:00:00Z`));
  return `${day(from)} – ${day(to)}`;
}

function monthName(locale: Locale, year: number, month: number) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(year, month - 1, 1));
}

function thisMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function isPast({ year, month }: { year: number; month: number }) {
  const now = thisMonth();
  return year * 12 + month < now.year * 12 + now.month;
}

function order(items: StoredDateOverride[]) {
  return [...items].sort(
    (a, b) =>
      a.year - b.year ||
      a.month - b.month ||
      a.direction.localeCompare(b.direction),
  );
}

// "trips.0.pickup.from" → message key, from the same schema the API uses.
function tripErrors(override: DateOverride) {
  const result = dateOverrideSchema.safeParse(override);
  const errors: Record<string, string> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors[issue.path.join(".")] ??= issue.message;
    }
  }
  return errors;
}

// A trip a week after the last one, or the first calculated one.
function nextTrip(override: DateOverride): DraftTrip {
  const last = override.trips[override.trips.length - 1];
  if (!last) {
    return toDraft(
      calculatedTrips(override.direction, override.year, override.month)[0],
    );
  }
  const week = (date: string) =>
    date && isoDate(new Date(Date.parse(`${date}T00:00:00Z`) + 7 * 86_400_000));
  const shift = (range: DateRange = noDates()) => ({
    from: week(range.from),
    to: week(range.to),
  });
  return {
    pickup: shift(last.pickup),
    delivery: shift(last.delivery),
    parcelForceDelivery: shift(last.parcelForceDelivery),
  };
}

function MonthEditor({
  saved,
  onSaved,
  onDeleted,
  onDirtyChange,
}: {
  saved: StoredDateOverride;
  onSaved: (saved: StoredDateOverride) => void;
  onDeleted: (saved: StoredDateOverride) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const { getToken } = useAuth();
  const [trips, setTrips] = useState<DraftTrip[]>(() =>
    saved.trips.map(toDraft),
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // A save or a reload replaces `saved`: the editor starts from it again.
  const [shown, setShown] = useState(saved);
  if (shown !== saved) {
    setShown(saved);
    setTrips(saved.trips.map(toDraft));
  }
  const savedTrips = saved.trips.map(toDraft);

  const draft: DateOverride = {
    direction: saved.direction,
    year: saved.year,
    month: saved.month,
    trips: trips.map(toTrip),
  };
  const dirty = JSON.stringify(trips) !== JSON.stringify(savedTrips);
  const errors = tripErrors(draft);
  const invalid = Object.keys(errors).length > 0;
  const title = `${monthName(locale, saved.year, saved.month)} · ${t(
    `dates.${saved.direction}`,
  )}`;

  useEffect(() => {
    onDirtyChange(saved._id, dirty);
  }, [saved._id, dirty, onDirtyChange]);
  useEffect(
    () => () => onDirtyChange(saved._id, false),
    [saved._id, onDirtyChange],
  );

  const edit = (next: DraftTrip[]) => {
    setTrips(next);
    setJustSaved(false);
  };
  const setDate = (
    index: number,
    part: (typeof PARTS)[number],
    end: (typeof RANGE_ENDS)[number],
    value: string,
  ) => {
    const next = structuredClone(trips);
    next[index][part][end] = value;
    edit(next);
  };
  const refreshToken = () => getToken({ skipCache: true });

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await saveDateOverride(saved, draft, refreshToken);
      if (!result.ok) {
        setProblem(writeProblem(result.failure, "errors.requestFailed"));
        return;
      }
      onSaved(result.body);
      setJustSaved(true);
    } catch {
      setProblem(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(t("datesPage.confirmReset", { month: title }))) {
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await deleteDateOverride(saved, refreshToken);
      if (!result.ok) {
        setProblem(writeProblem(result.failure, "errors.requestFailed"));
        return;
      }
      onDeleted(saved);
    } catch {
      setProblem(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold first-letter:uppercase">
          {title}
        </h2>
        {isPast(saved) && (
          <span className="text-sm text-muted-foreground">
            ({t("datesPage.past")})
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {dirty && (
            <span className="text-sm text-muted-foreground">
              {t("common.unsaved", { count: 1 })}
            </span>
          )}
          {justSaved && !dirty && (
            <span className="text-sm text-muted-foreground">
              {t("common.saved")}
            </span>
          )}
          <Button variant="outline" disabled={busy} onClick={reset}>
            {t("datesPage.reset")}
          </Button>
          <Button disabled={!dirty || busy || invalid} onClick={save}>
            {busy ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
      {problem && (
        <p className="text-sm text-destructive">{problemText(t, problem)}</p>
      )}

      <fieldset disabled={busy} className="space-y-3">
        {trips.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("datesPage.noTrips")}
          </p>
        )}
        {trips.map((trip, index) => (
          <div key={index} className="flex flex-wrap items-start gap-4">
            <span className="w-6 pt-1.5 text-sm text-muted-foreground">
              {index + 1}.
            </span>
            {PARTS.map((part) => (
              <div key={part} className="space-y-1">
                <p className="text-xs font-medium">{t(`dates.${part}`)}</p>
                <div className="flex items-start gap-1">
                  {RANGE_ENDS.map((end) => {
                    const path = `trips.${index}.${part}.${end}`;
                    const changed =
                      savedTrips[index]?.[part][end] !== trip[part][end];
                    return (
                      <div key={end} className="space-y-1">
                        <Input
                          type="date"
                          value={trip[part][end]}
                          aria-label={t("datesPage.tripField", {
                            n: index + 1,
                            field: t(`dates.${part}`),
                            end: t(`datesPage.${end}`),
                          })}
                          aria-invalid={errors[path] ? true : undefined}
                          className={cn("w-36", changed && "bg-brand/10")}
                          onChange={(event) =>
                            setDate(index, part, end, event.target.value)
                          }
                        />
                        {errors[path] && (
                          <p className="max-w-36 text-xs text-destructive">
                            {t(errors[path])}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {part === "parcelForceDelivery" &&
                  !trip.parcelForceDelivery.from &&
                  !trip.parcelForceDelivery.to &&
                  trip.delivery.from &&
                  trip.delivery.to && (
                    <p className="text-xs text-muted-foreground">
                      {t("datesPage.parcelForceAuto", {
                        range: rangeText(
                          locale,
                          parcelForceDeliveryOf(toTrip(trip)),
                        ),
                      })}
                    </p>
                  )}
              </div>
            ))}
            <span className="pt-6 text-xs text-muted-foreground">
              {t("datesPage.week", {
                parity: t(
                  isEvenWeek(trip.pickup.from)
                    ? "datesPage.even"
                    : "datesPage.odd",
                ),
              })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="mt-5"
              onClick={() => edit(trips.filter((_, i) => i !== index))}
            >
              {t("common.remove")}
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => edit([...trips, nextTrip(draft)])}
        >
          {t("datesPage.addTrip")}
        </Button>
      </fieldset>
    </section>
  );
}

function AddMonth({
  existing,
  onCreated,
}: {
  existing: StoredDateOverride[];
  onCreated: (created: StoredDateOverride) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const { getToken } = useAuth();
  const now = thisMonth();
  const [direction, setDirection] = useState<Direction>("LT-UK");
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const taken = existing.some(
    (item) =>
      item.direction === direction &&
      item.year === year &&
      item.month === month,
  );

  const add = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await createDateOverride(
        {
          direction,
          year,
          month,
          trips: calculatedTrips(direction, year, month),
        },
        () => getToken({ skipCache: true }),
      );
      if (!result.ok) {
        setProblem(writeProblem(result.failure, "errors.requestFailed"));
        return;
      }
      onCreated(result.body);
    } catch {
      setProblem(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">{t("datesPage.addTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("datesPage.addHelp")}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium">
            {t("dates.direction")}
          </span>
          <NativeSelect
            value={direction}
            onChange={(event) => setDirection(event.target.value as Direction)}
          >
            {DIRECTIONS.map((value) => (
              <option key={value} value={value}>
                {t(`dates.${value}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">
            {t("datesPage.year")}
          </span>
          <NativeSelect
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {[now.year, now.year + 1].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">
            {t("datesPage.month")}
          </span>
          <NativeSelect
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => (
              <option key={value} value={value}>
                {new Intl.DateTimeFormat(locale, {
                  month: "long",
                  timeZone: "UTC",
                }).format(Date.UTC(2026, value - 1, 1))}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button disabled={busy || taken} onClick={add}>
          {t("datesPage.add")}
        </Button>
      </div>
      {taken && (
        <p className="text-sm text-muted-foreground">
          {t("apiErrors.date_override_duplicate")}
        </p>
      )}
      {problem && (
        <p className="text-sm text-destructive">{problemText(t, problem)}</p>
      )}
    </section>
  );
}

export function DateOverridesEditor() {
  const t = useT();
  const [items, setItems] = useState<StoredDateOverride[] | undefined>(() =>
    readCache<StoredDateOverride[]>(CACHE_KEY),
  );
  const [loadError, setLoadError] = useState<Problem | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    fetchDateOverrides(controller.signal)
      .then((loaded) => setItems(order(loaded)))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(loadProblem(error, "errors.loadDates"));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (items) {
      writeCache(CACHE_KEY, items);
    }
  }, [items]);

  const onDirtyChange = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((current) => {
      if (current.has(id) === dirty) {
        return current;
      }
      const next = new Set(current);
      if (dirty) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  useUnsavedChanges(dirtyIds.size > 0);

  const replace = (saved: StoredDateOverride) =>
    setItems((current) =>
      order([
        ...(current ?? []).filter((item) => item._id !== saved._id),
        saved,
      ]),
    );
  const remove = (saved: StoredDateOverride) =>
    setItems((current) => current?.filter((item) => item._id !== saved._id));

  const sorted = useMemo(() => items ?? [], [items]);

  if (loadError) {
    return (
      <p className="text-sm text-destructive">{problemText(t, loadError)}</p>
    );
  }

  if (items === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AddMonth existing={sorted} onCreated={replace} />
      {sorted.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("datesPage.noMonths")}
        </p>
      )}
      {sorted.map((saved) => (
        <MonthEditor
          key={saved._id}
          saved={saved}
          onSaved={replace}
          onDeleted={remove}
          onDirtyChange={onDirtyChange}
        />
      ))}
    </div>
  );
}
