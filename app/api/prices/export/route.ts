import { requireAdmin, withErrorHandling } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PriceCategory } from "@/lib/models/price-category";

// The whole catalog as a JSON file, in the same shape as GET /api/prices
// (`{ categories }`), so it can serve as the site's fallback snapshot.
export const GET = withErrorHandling(async () => {
  const unauthorized = await requireAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  await connectDB();

  const categories = await PriceCategory.find()
    .sort({ order: 1, value: 1 })
    .lean();
  const date = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify({ categories }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="prices-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
