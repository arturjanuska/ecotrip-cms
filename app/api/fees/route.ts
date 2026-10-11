import { NextResponse, type NextRequest } from "next/server";
import {
  corsHeaders,
  errorJson,
  preflight,
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { FeeSettingsModel } from "@/lib/models/fee-settings";
import { putFeesBodySchema } from "@/lib/validation/fees";

// The one fee settings document. 404 until npm run import:fees seeds it.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const cors = corsHeaders(request);

  await connectDB();
  const settings = await FeeSettingsModel.findOne().lean();

  return settings
    ? NextResponse.json(settings, { headers: cors })
    : errorJson(404, "Fees not found", { headers: cors });
});

/**
 * Replaces every fee. `updatedAt` is the version the client read: if the
 * settings changed since then (another tab), the answer is 409 and nothing is
 * written.
 */
export const PUT = withErrorHandling(async (request: NextRequest) => {
  const unauthorized = await requireAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  const unsupported = requireJson(request);
  if (unsupported) {
    return unsupported;
  }

  const parsed = putFeesBodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { settings, updatedAt } = parsed.data;

  await connectDB();

  const saved = await FeeSettingsModel.findOneAndUpdate(
    { updatedAt: new Date(updatedAt) },
    { $set: settings },
    { returnDocument: "after" },
  ).lean();

  if (saved) {
    return NextResponse.json(saved);
  }

  return (await FeeSettingsModel.exists({}))
    ? errorJson(409, "Fees changed since you opened the page. Reload it.")
    : errorJson(404, "Fees not found");
});

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}
