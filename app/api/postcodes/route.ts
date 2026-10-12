import { NextResponse, type NextRequest } from "next/server";
import type { QueryFilter } from "mongoose";
import {
  corsHeaders,
  duplicate,
  isDuplicateKeyError,
  preflight,
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Postcode, type PostcodeRecord } from "@/lib/models/postcode";
import {
  createPostcodeSchema,
  listQuerySchema,
} from "@/lib/validation/postcode";
import { recordChange } from "@/lib/change-log";
import { diffPostcode } from "@/lib/change-log-diff";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const cors = corsHeaders(request);

  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return validationError(parsed.error, cors);
  }

  const {
    page,
    limit,
    active,
    postcode,
    calendar,
    parcelForceZone,
    isParcelForce,
  } = parsed.data;

  const filter: QueryFilter<PostcodeRecord> = {};
  if (active !== undefined) {
    filter.active = active;
  }
  if (postcode) {
    // Anchored prefix on the uppercase field, so the unique index is used.
    filter.postcode = { $regex: `^${postcode}` };
  }
  if (calendar !== undefined) {
    filter.calendar = calendar;
  }
  if (parcelForceZone !== undefined) {
    filter.parcelForceZone = parcelForceZone;
  }
  if (isParcelForce !== undefined) {
    filter.isParcelForce = isParcelForce;
  }

  await connectDB();

  const [items, total] = await Promise.all([
    Postcode.find(filter)
      .sort({ postcode: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Postcode.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, limit }, { headers: cors });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const unauthorized = await requireAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  const unsupported = requireJson(request);
  if (unsupported) {
    return unsupported;
  }

  const parsed = createPostcodeSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  await connectDB();

  if (await Postcode.exists({ postcode: parsed.data.postcode })) {
    return duplicate();
  }

  try {
    const created = await Postcode.create(parsed.data);
    await recordChange({
      page: "postcodes",
      summary: {
        key: "log.createdPostcode",
        params: { postcode: created.postcode },
      },
      changes: diffPostcode(null, created.toJSON()),
    });
    return NextResponse.json(created.toJSON(), { status: 201 });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return duplicate();
    }
    throw error;
  }
});

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}
