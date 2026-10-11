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
import {
  applyImportChanges,
  type ImportConflict,
  type PriceImportResult,
} from "@/lib/price-import";
import type { Category } from "@/lib/price-types";
import { categorySchema, importBodySchema } from "@/lib/validation/price";
import { recordChange } from "@/lib/change-log";
import { priceFieldLabel, sheetText } from "@/lib/change-log-diff";

function toCategory(doc: Category): Category {
  const { value, label, sheet, order, subCategories, pricing } = doc;
  return { value, label, sheet, order, subCategories, pricing };
}

/**
 * Applies the changes picked in the import preview. All of them or none: if
 * any value changed since the preview, the answer is 409 with the conflicts.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const unauthorized = await requireAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  const unsupported = requireJson(request);
  if (unsupported) {
    return unsupported;
  }

  const parsed = importBodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const { changes } = parsed.data;

  const mongoose = await connectDB();
  const session = await mongoose.startSession();
  let conflicts: ImportConflict[] = [];
  let invalid: string[] = [];
  const categorySheets = new Map<string, string>();

  try {
    await session.withTransaction(async () => {
      const docs = await PriceCategory.find({
        value: { $in: [...new Set(changes.map((change) => change.category))] },
      })
        .session(session)
        .lean();

      docs.forEach((doc) => categorySheets.set(doc.value, doc.sheet));
      const outcome = applyImportChanges(docs.map(toCategory), changes);
      conflicts = outcome.conflicts;
      invalid = outcome.updated.flatMap((category) => {
        const result = categorySchema.safeParse(category);
        return result.success
          ? []
          : result.error.issues.map(
              (issue) => `${category.value}: ${issue.message}`,
            );
      });
      if (conflicts.length > 0 || invalid.length > 0) {
        return;
      }

      for (const category of outcome.updated) {
        await PriceCategory.updateOne(
          { value: category.value },
          {
            $set: {
              subCategories: category.subCategories,
              pricing: category.pricing,
            },
          },
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }

  if (conflicts.length > 0) {
    return errorJson(
      409,
      "Prices changed since the preview. Choose the file again.",
      { code: "prices_import_conflict", details: { conflicts } },
    );
  }
  if (invalid.length > 0) {
    return errorJson(400, "Import makes prices invalid", {
      code: "prices_import_invalid",
      details: { messages: invalid },
    });
  }

  await recordChange({
    page: "prices",
    summary: { key: "log.importedPrices", params: { count: changes.length } },
    changes: changes.map((change) => ({
      record: `${categorySheets.get(change.category) ?? change.category} · ${sheetText(change.sheet)}`,
      field: priceFieldLabel(change.field),
      from: change.from,
      to: change.to,
    })),
  });

  const result: PriceImportResult = { updated: changes.length };
  return NextResponse.json(result);
});
