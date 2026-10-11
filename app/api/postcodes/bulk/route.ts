import { NextResponse, type NextRequest } from "next/server";
import {
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Postcode } from "@/lib/models/postcode";
import {
  bulkUpdateSchema,
  type BulkUpdateResult,
} from "@/lib/validation/postcode";
import { recordChange } from "@/lib/change-log";
import { diffPostcode } from "@/lib/change-log-diff";

// Applies the same `changes` to every record in `ids`. Each record is updated
// fully or not at all; there is no rollback across records.
export const PUT = withErrorHandling(async (request: NextRequest) => {
  const unauthorized = await requireAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  const unsupported = requireJson(request);
  if (unsupported) {
    return unsupported;
  }

  const parsed = bulkUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { ids, changes } = parsed.data;

  await connectDB();

  const before = await Postcode.find({ _id: { $in: ids } }).lean();
  const result = await Postcode.updateMany(
    { _id: { $in: ids } },
    { $set: changes },
    { runValidators: true },
  );

  let notFound: string[] = [];
  if (result.matchedCount < ids.length) {
    const found = await Postcode.find({ _id: { $in: ids } }, { _id: 1 }).lean();
    const foundIds = new Set(found.map((doc) => String(doc._id)));
    notFound = ids.filter((id) => !foundIds.has(id));
  }

  const changed = before
    .map((doc) => diffPostcode(doc, { ...doc, ...changes }))
    .filter((fields) => fields.length > 0);
  await recordChange({
    page: "postcodes",
    summary: `Bulk change of ${changed.length} postcodes: ${Object.entries(
      changes,
    )
      .map(([field, value]) => `${field} → ${value === "" ? "(empty)" : value}`)
      .join(", ")}`,
    changes: changed.flat(),
  });

  return NextResponse.json({
    matched: result.matchedCount,
    modified: result.modifiedCount,
    notFound,
  } satisfies BulkUpdateResult);
});
