import { NextResponse, type NextRequest } from "next/server";
import {
  errorJson,
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PriceCategory } from "@/lib/models/price-category";
import { putCategoryBodySchema } from "@/lib/validation/price";
import { recordChange } from "@/lib/change-log";
import { diffPriceCategory } from "@/lib/change-log-diff";

type Context = { params: Promise<{ category: string }> };

/**
 * Replaces one category. `updatedAt` is the version the client read: if the
 * category changed since then (another tab, an import), the answer is 409 and
 * nothing is written. `value` and `sheet` are structure set by the seed script:
 * `value` must match the path and `sheet` is never changed here.
 */
export const PUT = withErrorHandling(
  async (request: NextRequest, { params }: Context) => {
    const unauthorized = await requireAdmin();
    if (unauthorized) {
      return unauthorized;
    }

    const unsupported = requireJson(request);
    if (unsupported) {
      return unsupported;
    }

    const { category: value } = await params;
    const parsed = putCategoryBodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { category, updatedAt } = parsed.data;
    if (category.value !== value) {
      return errorJson(400, "Category value cannot change", {
        code: "category_value_changed",
      });
    }

    await connectDB();

    const before = await PriceCategory.findOne({ value }).lean();
    const saved = await PriceCategory.findOneAndUpdate(
      { value, updatedAt: new Date(updatedAt) },
      {
        $set: {
          label: category.label,
          order: category.order,
          subCategories: category.subCategories,
          pricing: category.pricing,
        },
      },
      { returnDocument: "after" },
    ).lean();

    if (saved) {
      if (before) {
        await recordChange({
          page: "prices",
          summary: { key: "log.savedPrices", params: { sheet: before.sheet } },
          changes: diffPriceCategory(before, category),
        });
      }
      return NextResponse.json(saved);
    }

    return (await PriceCategory.exists({ value }))
      ? errorJson(409, "Prices changed since you opened the page. Reload it.", {
          code: "prices_changed",
        })
      : errorJson(404, "Category not found", { code: "category_not_found" });
  },
);
