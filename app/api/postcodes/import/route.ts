import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  errorJson,
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Postcode } from "@/lib/models/postcode";
import {
  CSV_COLUMNS,
  IMPORT_MAX_ROWS,
  duplicatePostcodes,
  existingByPostcode,
  importKey,
  toImportRecord,
  validateImportValues,
  type CsvColumn,
  type ImportResult,
  type ImportRowErrors,
  type ImportValues,
} from "@/lib/postcode-csv";
import { recordChange } from "@/lib/change-log";
import { diffPostcode } from "@/lib/change-log-diff";

// Rows as the import preview sends them: every column as text.
const importBodySchema = z.object({
  rows: z
    .array(
      z.object(
        Object.fromEntries(
          CSV_COLUMNS.map((column) => [column, z.string()]),
        ) as Record<CsvColumn, z.ZodString>,
      ),
    )
    .min(1)
    .max(IMPORT_MAX_ROWS),
});

/**
 * Creates new postcodes and updates existing ones (matched by postcode).
 * Every row is checked first; if any row is invalid nothing is written. The
 * writes run in one transaction, so the import is applied fully or not at all.
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

  const rows: ImportValues[] = parsed.data.rows;

  const mongoose = await connectDB();

  const existing = existingByPostcode(
    await Postcode.find({
      postcode: { $in: rows.map((values) => importKey(values.postcode)) },
    }).lean(),
  );
  const duplicates = duplicatePostcodes(rows.map((values) => ({ values })));

  const rowErrors: ImportRowErrors[] = [];
  rows.forEach((values, index) => {
    const key = importKey(values.postcode);
    const errors = validateImportValues(
      values,
      existing.get(key),
      duplicates.has(key),
    );
    if (Object.keys(errors).length > 0) {
      rowErrors.push({ index, errors });
    }
  });

  if (rowErrors.length > 0) {
    return errorJson(400, "Import has invalid rows", {
      details: { rows: rowErrors },
    });
  }

  const operations = rows.map((values) => {
    const record = toImportRecord(values);
    return {
      updateOne: {
        filter: { postcode: record.postcode },
        update: { $set: record },
        upsert: true,
      },
    };
  });

  const session = await mongoose.startSession();
  let result: ImportResult = { inserted: 0, updated: 0, unchanged: 0 };
  try {
    await session.withTransaction(async () => {
      const write = await Postcode.bulkWrite(operations, { session });
      result = {
        inserted: write.upsertedCount,
        updated: write.modifiedCount,
        unchanged: write.matchedCount - write.modifiedCount,
      };
    });
  } finally {
    await session.endSession();
  }

  const changes = rows.flatMap((values) => {
    const record = toImportRecord(values);
    return diffPostcode(existing.get(record.postcode) ?? null, record);
  });
  await recordChange({
    page: "postcodes",
    summary: `Imported postcodes: ${result.inserted} new, ${result.updated} updated`,
    changes,
  });

  return NextResponse.json(result);
});
