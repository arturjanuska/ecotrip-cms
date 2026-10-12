import { NextResponse, type NextRequest } from "next/server";
import {
  duplicateMonth,
  errorJson,
  isDuplicateKeyError,
  isValidId,
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { DateOverrideModel } from "@/lib/models/date-override";
import { putDateOverrideBodySchema } from "@/lib/validation/date-override";
import { recordChange } from "@/lib/change-log";
import { dateOverrideRecord, diffDateOverride } from "@/lib/change-log-diff";

type Context = { params: Promise<{ id: string }> };

function notFound() {
  return errorJson(404, "Dates not found", {
    code: "date_override_not_found",
  });
}

/**
 * Replaces the month. `updatedAt` is the version the client read: if the
 * month changed since then (another tab), the answer is 409 and nothing is
 * written.
 */
export const PUT = withErrorHandling(
  async (request: NextRequest, { params }: Context) => {
    const unauthorized = await requireAdmin();
    if (unauthorized) {
      return unauthorized;
    }

    const { id } = await params;
    if (!isValidId(id)) {
      return notFound();
    }

    const unsupported = requireJson(request);
    if (unsupported) {
      return unsupported;
    }

    const parsed = putDateOverrideBodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const { override, updatedAt } = parsed.data;

    await connectDB();

    const before = await DateOverrideModel.findById(id).lean();
    if (!before) {
      return notFound();
    }

    const { direction, year, month } = override;
    if (
      await DateOverrideModel.exists({
        direction,
        year,
        month,
        _id: { $ne: id },
      })
    ) {
      return duplicateMonth();
    }

    try {
      const saved = await DateOverrideModel.findOneAndUpdate(
        { _id: id, updatedAt: new Date(updatedAt) },
        { $set: override },
        { returnDocument: "after" },
      ).lean();

      if (!saved) {
        return errorJson(
          409,
          "Dates changed since you opened the page. Reload it.",
          { code: "date_override_changed" },
        );
      }

      await recordChange({
        page: "dates",
        summary: {
          key: "log.savedDates",
          params: { month: dateOverrideRecord(saved) },
        },
        changes: diffDateOverride(before, saved),
      });
      return NextResponse.json(saved);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return duplicateMonth();
      }
      throw error;
    }
  },
);

// The month goes back to the dates the site calculates.
export const DELETE = withErrorHandling(
  async (_request: NextRequest, { params }: Context) => {
    const unauthorized = await requireAdmin();
    if (unauthorized) {
      return unauthorized;
    }

    const { id } = await params;
    if (!isValidId(id)) {
      return notFound();
    }

    await connectDB();

    const deleted = await DateOverrideModel.findByIdAndDelete(id).lean();
    if (!deleted) {
      return notFound();
    }

    await recordChange({
      page: "dates",
      summary: {
        key: "log.deletedDates",
        params: { month: dateOverrideRecord(deleted) },
      },
      changes: diffDateOverride(deleted, null),
    });
    return NextResponse.json(deleted);
  },
);
