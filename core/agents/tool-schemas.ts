import { z } from "zod";

/**
 * LLMs often emit `null` for omitted optional JSON fields; `z.string().optional()` rejects `null` in Zod 4.
 */
export const optionalReplyToMessageIdSchema = z.preprocess(
  (v) => (v === null || v === "" ? undefined : v),
  z.string().min(1).optional(),
);
