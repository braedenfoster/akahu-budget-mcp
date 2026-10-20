import { z } from "zod";

/** A Period key, "YYYY-MM". Shared so tools don't re-inline the regex. */
export const periodKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "Period key must be YYYY-MM");

/** Optional Period key input; defaults to the current Period when omitted. */
export const optionalPeriod = periodKeySchema
  .optional()
  .describe("Period key YYYY-MM; defaults to the current Period");

/** A calendar date, "YYYY-MM-DD", that exists. */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((d) => new Date(`${d}T00:00:00.000Z`).toISOString().startsWith(d), "Date must exist");
