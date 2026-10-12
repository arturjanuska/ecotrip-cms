import { z } from "zod";
import {
  ADDITIONAL_CHARGES_HINT,
  CALENDAR_VALUES,
  DISCOUNT_HINT,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  PARCEL_FORCE_ZONES,
  NUMBER_DEFAULT,
  isValidAdditionalCharges,
  isValidDiscount,
  orNumberDefault,
} from "@/lib/postcode-options";
import { EMPTY_FILTER } from "@/lib/postcode-filters";
import { SORT_DIRECTIONS, SORT_FIELDS } from "@/lib/postcode-sort";

export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
export const BULK_MAX_IDS = 5000;

const text = z.string().trim();
// Custom messages are message keys (lib/i18n), translated by the CMS.
const requiredText = text.min(1, "validation.required");
const postcodeValue = requiredText.transform((value) => value.toUpperCase());

// Empty string is allowed for all three: the value is optional.
const calendarValue = z.enum(["", ...CALENDAR_VALUES]);
const parcelForceZoneValue = z.enum(["", ...PARCEL_FORCE_ZONES]);
// Never empty: "" is taken as 0.
const discountValue = text
  .transform(orNumberDefault)
  .pipe(z.string().refine(isValidDiscount, DISCOUNT_HINT));
const additionalChargesValue = text
  .transform(orNumberDefault)
  .pipe(z.string().refine(isValidAdditionalCharges, ADDITIONAL_CHARGES_HINT));

export const createPostcodeSchema = z.object({
  postcode: postcodeValue,
  town: requiredText,
  country: requiredText,
  region: text.default(""),
  countryString: text.default(""),
  basicPrice: text.default(""),
  additionalCharges: additionalChargesValue.default(NUMBER_DEFAULT),
  isParcelForce: z.boolean().default(false),
  parcelForceZone: parcelForceZoneValue.default(""),
  discount: discountValue.default(NUMBER_DEFAULT),
  calendar: calendarValue.default(""),
  active: z.boolean().default(true),
});

export const updatePostcodeSchema = z
  .object({
    postcode: postcodeValue.optional(),
    town: requiredText.optional(),
    country: requiredText.optional(),
    region: text.optional(),
    countryString: text.optional(),
    basicPrice: text.optional(),
    additionalCharges: additionalChargesValue.optional(),
    isParcelForce: z.boolean().optional(),
    parcelForceZone: parcelForceZoneValue.optional(),
    discount: discountValue.optional(),
    calendar: calendarValue.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "validation.atLeastOneField",
  });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(LIST_DEFAULT_LIMIT)
    .transform((value) => Math.min(value, LIST_MAX_LIMIT)),
  // "all" returns active and deleted records together.
  active: z
    .enum(["true", "false", "all"])
    .default("true")
    .transform((value) => (value === "all" ? undefined : value === "true")),
  // Prefix match. Letters and digits only, so it is safe inside a regex.
  postcode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,8}$/, "validation.postcodePrefix")
    .optional(),
  // EMPTY_FILTER ("none") selects records where the field is empty.
  calendar: z
    .enum([...CALENDAR_VALUES, EMPTY_FILTER])
    .optional()
    .transform((value) => (value === EMPTY_FILTER ? "" : value)),
  parcelForceZone: z
    .enum([...PARCEL_FORCE_ZONES, EMPTY_FILTER])
    .optional()
    .transform((value) => (value === EMPTY_FILTER ? "" : value)),
  isParcelForce: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? value : value === "true")),
  // Without `sort` the list is ordered by postcode; `order` defaults to asc.
  sort: z.enum(SORT_FIELDS).optional(),
  order: z.enum(SORT_DIRECTIONS).optional(),
});

// One change applied to many records. Only fields that make sense in bulk;
// unknown fields are rejected instead of silently dropped.
export const bulkUpdateSchema = z.object({
  ids: z
    .array(z.string().regex(OBJECT_ID_PATTERN, "validation.invalidId"))
    .min(1)
    .max(BULK_MAX_IDS)
    .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]),
  changes: z
    .strictObject({
      isParcelForce: z.boolean().optional(),
      parcelForceZone: parcelForceZoneValue.optional(),
      discount: discountValue.optional(),
      calendar: calendarValue.optional(),
      active: z.boolean().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "validation.atLeastOneField",
    }),
});

export type BulkChanges = z.input<typeof bulkUpdateSchema>["changes"];

export type BulkUpdateResult = {
  matched: number;
  modified: number;
  notFound: string[];
};
