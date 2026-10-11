import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, validationError, withErrorHandling } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ChangeLog } from "@/lib/models/change-log";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Newest first. Admin only: the log names who changed what.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const unauthorized = await requireAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const { page, limit } = parsed.data;

  await connectDB();

  const [items, total] = await Promise.all([
    ChangeLog.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ChangeLog.countDocuments(),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    limit,
  });
});
