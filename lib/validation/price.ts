import { z } from "zod";
import {
  normalizeSheetText,
  sheetKeyId,
  sheetTargets,
} from "@/lib/price-sheet-key";
import { msg } from "@/lib/i18n/translate";
import { CHANGE_FIELDS } from "@/lib/price-types";

// Custom messages are message keys (lib/i18n), translated by the CMS.

const text = z.string().trim().min(1);

const optionSchema = z.object({ value: text, label: text });

const sheetKeySchema = z.object({
  type: z.string().trim(),
  size: z.string().trim(),
  spec: z.string().trim(),
});

const moneySchema = z.object({
  "UK-LT": z.number().positive(),
  "LT-UK": z.number().positive(),
});

const measureSchema = z.number().nonnegative().nullable();

const variantSchema = z.object({
  sheet: sheetKeySchema,
  size: optionSchema.nullable(),
  specification: optionSchema.nullable(),
  volume: measureSchema,
  weight: measureSchema,
  price: moneySchema,
});

const tierSchema = z.object({
  sheet: sheetKeySchema,
  upTo: z.number().positive().nullable(),
  price: moneySchema,
  perUnit: z.boolean(),
});

const tiersSchema = z
  .array(tierSchema)
  .min(1)
  .superRefine((tiers, ctx) => {
    tiers.forEach((tier, index) => {
      if (tier.upTo === null && index < tiers.length - 1) {
        ctx.addIssue({
          code: "custom",
          message: "validation.onlyLastTierOpen",
          path: [index, "upTo"],
        });
      }
      const previous = tiers[index - 1]?.upTo;
      if (
        tier.upTo !== null &&
        previous !== undefined &&
        previous !== null &&
        tier.upTo <= previous
      ) {
        ctx.addIssue({
          code: "custom",
          message: "validation.tiersAscending",
          path: [index, "upTo"],
        });
      }
    });
  });

const pricingSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("fixed"),
      variants: z.array(variantSchema).min(1),
    }),
    z.object({
      type: z.literal("measured"),
      byWeight: tiersSchema.nullable(),
      byVolume: tiersSchema.nullable(),
    }),
    z.object({ type: z.literal("callManager") }),
  ])
  .superRefine((pricing, ctx) => {
    if (pricing.type === "measured") {
      if (pricing.byWeight === null && pricing.byVolume === null) {
        ctx.addIssue({
          code: "custom",
          message: "validation.weightOrVolumeTiers",
        });
      }
    }
    if (pricing.type === "fixed") {
      const seen = new Set<string>();
      pricing.variants.forEach((variant, index) => {
        const key = `${variant.size?.value ?? ""}|${variant.specification?.value ?? ""}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            message: "validation.variantRepeats",
            path: ["variants", index],
          });
        }
        seen.add(key);
      });
    }
  });

const subCategorySchema = optionSchema.extend({ pricing: pricingSchema });

export const categorySchema = optionSchema
  .extend({
    sheet: text,
    order: z.number().int().nonnegative(),
    subCategories: z.array(subCategorySchema),
    pricing: pricingSchema.nullable(),
  })
  .superRefine((category, ctx) => {
    if (category.subCategories.length > 0 === (category.pricing !== null)) {
      ctx.addIssue({
        code: "custom",
        message: "validation.subcategoriesOrPricing",
        path: ["pricing"],
      });
    }

    const values = new Set<string>();
    category.subCategories.forEach((sub, index) => {
      if (values.has(sub.value)) {
        ctx.addIssue({
          code: "custom",
          message: msg("validation.subcategoryRepeats", { value: sub.value }),
          path: ["subCategories", index, "value"],
        });
      }
      values.add(sub.value);
    });

    const rows = new Set<string>();
    for (const target of sheetTargets(category)) {
      const id = sheetKeyId(category.sheet, target.item.sheet);
      if (rows.has(id)) {
        const { type, size, spec } = target.item.sheet;
        ctx.addIssue({
          code: "custom",
          message: msg("validation.sheetRowRepeats", {
            row: [type, size, spec].filter(Boolean).join(" · "),
          }),
          path: ["subCategories"],
        });
      }
      rows.add(id);
    }
  });

export const catalogSchema = z
  .array(categorySchema)
  .superRefine((categories, ctx) => {
    const values = new Set<string>();
    const sheets = new Set<string>();
    categories.forEach((category, index) => {
      if (values.has(category.value)) {
        ctx.addIssue({
          code: "custom",
          message: msg("validation.categoryRepeats", { value: category.value }),
          path: [index, "value"],
        });
      }
      values.add(category.value);

      // Two categories with one spreadsheet name would share their row keys.
      const sheet = normalizeSheetText(category.sheet);
      if (sheets.has(sheet)) {
        ctx.addIssue({
          code: "custom",
          message: msg("validation.sheetCategoryRepeats", { sheet }),
          path: [index, "sheet"],
        });
      }
      sheets.add(sheet);
    });
  });

// PUT /api/prices/:category. `updatedAt` is the version the client read.
export const putCategoryBodySchema = z.object({
  category: categorySchema,
  updatedAt: z.iso.datetime(),
});

export const IMPORT_MAX_CHANGES = 1000;

// POST /api/prices/import
export const importBodySchema = z.object({
  changes: z
    .array(
      z.object({
        category: text,
        sheet: sheetKeySchema,
        field: z.enum(CHANGE_FIELDS),
        from: z.number().nullable(),
        to: z.number().nullable(),
      }),
    )
    .min(1)
    .max(IMPORT_MAX_CHANGES),
});
