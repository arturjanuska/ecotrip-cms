import { requireAdmin, withErrorHandling } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Postcode } from "@/lib/models/postcode";
import { toCsv } from "@/lib/postcode-csv";

// All postcodes, active and inactive, as a CSV file.
export const GET = withErrorHandling(async () => {
  const unauthorized = await requireAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  await connectDB();

  const items = await Postcode.find().sort({ postcode: 1 }).lean();
  const date = new Date().toISOString().slice(0, 10);

  return new Response(toCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="postcodes-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
