import { NextResponse, type NextRequest } from "next/server";
import type { PipelineStage, QueryFilter } from "mongoose";
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
import { NUMERIC_SORT_FIELDS, type SortField } from "@/lib/postcode-sort";
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
    sort,
    order,
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

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    sort
      ? sortedPage(filter, sort, order === "desc" ? -1 : 1, skip, limit)
      : Postcode.find(filter)
          .sort({ postcode: 1, _id: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
    Postcode.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, limit }, { headers: cors });
});

const SORT_KEY = "_sortKey";

// One page ordered by a column. Equal values keep postcode order, so offset
// pages neither repeat nor skip records. Text compares case-insensitively with
// numbers inside it by value ("M4" before "M40"); additional charges and
// discount compare as numbers.
function sortedPage(
  filter: QueryFilter<PostcodeRecord>,
  field: SortField,
  direction: 1 | -1,
  skip: number,
  limit: number,
) {
  const numeric = NUMERIC_SORT_FIELDS.includes(field);
  const pipeline: PipelineStage[] = [
    { $match: filter },
    ...(numeric
      ? [
          {
            $addFields: {
              [SORT_KEY]: {
                $convert: {
                  input: `$${field}`,
                  to: "double",
                  onError: null,
                  onNull: null,
                },
              },
            },
          },
        ]
      : []),
    {
      $sort: {
        [numeric ? SORT_KEY : field]: direction,
        ...(field === "postcode" ? {} : { postcode: 1 }),
        _id: 1,
      },
    },
    { $skip: skip },
    { $limit: limit },
    ...(numeric ? [{ $project: { [SORT_KEY]: 0 } }] : []),
  ];

  return Postcode.aggregate(pipeline).collation({
    locale: "en",
    strength: 2,
    numericOrdering: true,
  });
}

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
