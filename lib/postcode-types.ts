import type { z } from "zod";
import type { createPostcodeSchema } from "@/lib/validation/postcode";

// A postcode as the API returns it: the stored fields plus id and timestamps
// (JSON strings).
export type Postcode = z.output<typeof createPostcodeSchema> & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export type PostcodeList = {
  items: Postcode[];
  total: number;
  page: number;
  limit: number;
};
