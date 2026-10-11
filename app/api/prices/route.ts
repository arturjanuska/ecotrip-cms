import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders, preflight, withErrorHandling } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PriceCategory } from "@/lib/models/price-category";

// The whole catalog in one response: about 180 prices, no paging needed.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const cors = corsHeaders(request);

  await connectDB();
  const categories = await PriceCategory.find()
    .sort({ order: 1, value: 1 })
    .lean();

  return NextResponse.json({ categories }, { headers: cors });
});

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}
