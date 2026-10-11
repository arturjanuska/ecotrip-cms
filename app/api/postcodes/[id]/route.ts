import { NextResponse, type NextRequest } from "next/server";
import {
  corsHeaders,
  duplicate,
  isDuplicateKeyError,
  isValidId,
  notFound,
  preflight,
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Postcode } from "@/lib/models/postcode";
import { updatePostcodeSchema } from "@/lib/validation/postcode";
import { recordChange } from "@/lib/change-log";
import { diffPostcode } from "@/lib/change-log-diff";

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  async (request: NextRequest, { params }: Context) => {
    const cors = corsHeaders(request);
    const { id } = await params;

    if (!isValidId(id)) {
      return notFound(cors);
    }

    await connectDB();

    const item = await Postcode.findById(id).lean();
    if (!item) {
      return notFound(cors);
    }

    return NextResponse.json(item, { headers: cors });
  },
);

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

    const parsed = updatePostcodeSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    await connectDB();

    if (
      parsed.data.postcode &&
      (await Postcode.exists({
        postcode: parsed.data.postcode,
        _id: { $ne: id },
      }))
    ) {
      return duplicate();
    }

    const before = await Postcode.findById(id).lean();

    try {
      const updated = await Postcode.findByIdAndUpdate(
        id,
        { $set: parsed.data },
        { returnDocument: "after", runValidators: true },
      ).lean();

      if (!updated) {
        return notFound();
      }

      const restored = before?.active === false && updated.active;
      await recordChange({
        page: "postcodes",
        summary: `${restored ? "Restored" : "Edited"} postcode ${updated.postcode}`,
        changes: diffPostcode(before, updated),
      });
      return NextResponse.json(updated);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return duplicate();
      }
      throw error;
    }
  },
);

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

    const wasActive = (await Postcode.findById(id, { active: 1 }).lean())
      ?.active;
    const deleted = await Postcode.findByIdAndUpdate(
      id,
      { $set: { active: false } },
      { returnDocument: "after" },
    ).lean();

    if (!deleted) {
      return notFound();
    }

    await recordChange({
      page: "postcodes",
      summary: `Deleted postcode ${deleted.postcode}`,
      changes: wasActive
        ? diffPostcode({ ...deleted, active: true }, deleted)
        : [],
    });
    return NextResponse.json(deleted);
  },
);

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}
