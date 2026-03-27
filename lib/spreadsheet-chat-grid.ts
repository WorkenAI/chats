import type * as XLSXNS from "xlsx";

const MAX_SHEETS = 10;
const MAX_ROWS = 48;
const MAX_COLS = 16;

function looksLikeZipOrOle(buf: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buf);
  if (u8.length < 2) {
    return false;
  }
  if (u8[0] === 0x50 && u8[1] === 0x4b) {
    return true;
  }
  if (u8[0] === 0xd0 && u8[1] === 0xcf) {
    return true;
  }
  return false;
}

/** JSZip errors when the xlsx zip is truncated or our bytes are wrong after bad base64 repair. */
function rethrowIfLikelyTruncatedXlsx(e: unknown, buf: ArrayBuffer): never {
  if (!looksLikeZipOrOle(buf)) {
    throw e instanceof Error ? e : new Error(String(e));
  }
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();
  if (
    lower.includes("bad compressed size") ||
    lower.includes("compressed size") ||
    lower.includes("central directory") ||
    lower.includes("invalid stored block") ||
    lower.includes("unsupported zip") ||
    lower.includes("end of data") ||
    lower.includes("corrupt") ||
    lower.includes("invalid local header")
  ) {
    throw new Error(
      "This .xlsx is incomplete or corrupted — the attachment bytes don’t match a full workbook (models often truncate long data: URLs or base64). Prefer a same-origin https link to the file, or include the entire base64 with no cut-off.",
    );
  }
  throw e instanceof Error ? e : new Error(raw);
}

function sheetToGridClipped(
  XLSX: typeof XLSXNS,
  ws: XLSXNS.WorkSheet,
): { grid: string[][]; truncated: boolean } {
  const ref = ws["!ref"];
  if (!ref) {
    return { grid: [[""]], truncated: false };
  }
  const full = XLSX.utils.decode_range(ref);
  const rowTrunc = full.e.r - full.s.r + 1 > MAX_ROWS;
  const colTrunc = full.e.c - full.s.c + 1 > MAX_COLS;
  const limE = {
    r: Math.min(full.e.r, full.s.r + MAX_ROWS - 1),
    c: Math.min(full.e.c, full.s.c + MAX_COLS - 1),
  };
  const limRef = XLSX.utils.encode_range({ s: full.s, e: limE });
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
    range: limRef,
  }) as string[][];
  if (!raw.length) {
    return { grid: [[""]], truncated: rowTrunc || colTrunc };
  }
  const maxCol = Math.min(
    MAX_COLS,
    Math.max(...raw.map((r) => r.length), 1),
  );
  const grid = raw.map((row) => {
    const cells = row.map((c) => (c == null ? "" : String(c)));
    while (cells.length < maxCol) {
      cells.push("");
    }
    return cells.slice(0, MAX_COLS);
  });
  return { grid, truncated: rowTrunc || colTrunc };
}

export type SpreadsheetChatGridResult = {
  sheetNames: string[];
  grids: Record<string, string[][]>;
  truncated: boolean;
};

/**
 * Parse xlsx/xls/CSV-ish bytes for the in-chat spreadsheet viewer.
 */
export async function parseSpreadsheetBufferForChat(
  buf: ArrayBuffer,
): Promise<SpreadsheetChatGridResult> {
  const XLSX = await import("xlsx");
  let wb: XLSXNS.WorkBook;
  try {
    wb = XLSX.read(buf, {
      type: "array",
      cellDates: true,
      sheetRows: MAX_ROWS + 1,
    });
  } catch (firstErr) {
    if (looksLikeZipOrOle(buf)) {
      rethrowIfLikelyTruncatedXlsx(firstErr, buf);
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const trimmed = text.replace(/^\uFEFF/, "").trim();
    if (!trimmed) {
      throw firstErr;
    }
    try {
      wb = XLSX.read(trimmed, {
        type: "string",
        cellDates: true,
        sheetRows: MAX_ROWS + 1,
      });
    } catch (csvErr) {
      rethrowIfLikelyTruncatedXlsx(csvErr, buf);
    }
  }

  const names = wb.SheetNames.slice(0, MAX_SHEETS);
  const grids: Record<string, string[][]> = {};
  let truncated = false;
  for (const name of names) {
    const ws = wb.Sheets[name];
    if (!ws) {
      continue;
    }
    const { grid, truncated: t } = sheetToGridClipped(XLSX, ws);
    if (t) {
      truncated = true;
    }
    grids[name] = grid;
  }
  if (Object.keys(grids).length === 0) {
    grids["Sheet1"] = [[""]];
  }
  return {
    sheetNames: Object.keys(grids),
    grids,
    truncated,
  };
}
