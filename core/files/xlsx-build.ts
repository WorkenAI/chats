export type SpreadsheetSheetInput = {
  /** Excel sheet name, max 31 chars (enforced here). */
  name: string;
  /** Row-major AoA; cells stringified for display. */
  rows: (string | number | boolean | null | undefined)[][];
};

/**
 * Build a real .xlsx (OOXML zip) with SheetJS — not hand-written base64.
 */
export async function buildXlsxBufferFromSheets(
  sheets: SpreadsheetSheetInput[],
): Promise<Uint8Array> {
  if (sheets.length === 0) {
    throw new Error("At least one sheet is required");
  }
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const safeName = (s.name.trim().slice(0, 31) || "Sheet").replace(
      /[:\\/?*[\]]/g,
      "_",
    );
    const aoa = s.rows.map((row) =>
      row.map((c) =>
        c === null || c === undefined ? "" : c,
      ),
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  const out = XLSX.write(wb, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer;
  return new Uint8Array(out);
}
