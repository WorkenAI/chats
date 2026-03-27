import { z } from "zod";

/** One .xlsx workbook; `sheets[i]` = worksheet tab i (tabs left-to-right). */
export const createSpreadsheetFileInputSchema = z.object({
  filename: z
    .string()
    .max(200)
    .optional()
    .describe("Suggested download name (e.g. report.xlsx)."),
  sheets: z
    .array(
      z.object({
        name: z
          .string()
          .max(31)
          .describe("Worksheet tab label (Excel max 31 characters)."),
        rows: z
          .array(
            z.array(
              z.union([z.string(), z.number(), z.boolean(), z.null()]),
            ),
          )
          .max(2000)
          .describe(
            "Rows top-to-bottom; each row is cells left-to-right. null = empty cell.",
          ),
      }),
    )
    .min(1)
    .max(12)
    .describe(
      "Ordered list of worksheets inside this single file. Length = number of tabs.",
    ),
});

export type CreateSpreadsheetFileInput = z.infer<
  typeof createSpreadsheetFileInputSchema
>;
