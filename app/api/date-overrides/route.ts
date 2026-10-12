import { NextResponse, type NextRequest } from "next/server";
import {
  corsHeaders,
  duplicateMonth,
  isDuplicateKeyError,
  preflight,
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { DateOverrideModel } from "@/lib/models/date-override";
import { dateOverrideSchema } from "@/lib/validation/date-override";
import { recordChange } from "@/lib/change-log";
import { dateOverrideRecord, diffDateOverride } from "@/lib/change-log-diff";

// Every month set by hand, in date order. The site reads it (CORS).
export const GET = withErrorHandling(async (request: NextRequest) => {
  const cors = corsHeaders(request);

  await connectDB();
  const items = await DateOverrideModel.find()
    .sort({ year: 1, month: 1, direction: 1 })
    .lean();

  return NextResponse.json({ items }, { headers: cors });
});

// Sets the dates of a month that has none set yet.
export const POST = withErrorHandling(async (request: NextRequest) => {
  const unauthorized = await requireAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  const unsupported = requireJson(request);
  if (unsupported) {
    return unsupported;
  }

  const parsed = dateOverrideSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  await connectDB();

  const { direction, year, month } = parsed.data;
  // The unique index also refuses it, once Mongo has built it.
  if (await DateOverrideModel.exists({ direction, year, month })) {
    return duplicateMonth();
  }

  try {
    const created = (await DateOverrideModel.create(parsed.data)).toObject();
    await recordChange({
      page: "dates",
      summary: {
        key: "log.createdDates",
        params: { month: dateOverrideRecord(created) },
      },
      changes: diffDateOverride(null, created),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return duplicateMonth();
    }
    throw error;
  }
});

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}
