import { z } from "zod";

/** A Period key, "YYYY-MM". Shared so tools don't re-inline the regex. */
export const periodKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "Period key must be YYYY-MM");

/** Optional Period key input; defaults to the current Period when omitted. */
export const optionalPeriod = periodKeySchema
  .optional()
  .describe("Period key YYYY-MM; defaults to the current Period");
