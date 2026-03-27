import type { WebChatBubbleFileAttachment } from "@/core/agents/web-chat-ui-types";
import type { CreateSpreadsheetFileInput } from "@/core/files/spreadsheet-schema";
import { AGENT_FILE_API_PREFIX } from "@/core/files/types";
import { storeAgentFile } from "@/core/files/store";
import { buildXlsxBufferFromSheets } from "@/core/files/xlsx-build";

const XLSX_MEDIA =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Node-only: build .xlsx and write to disk. Loaded via dynamic import from workflow steps.
 */
export async function persistSpreadsheetAttachment(
  input: CreateSpreadsheetFileInput,
): Promise<WebChatBubbleFileAttachment> {
  const baseName = input.filename?.trim() || "workbook.xlsx";
  const filename = /\.xlsx$/i.test(baseName) ? baseName : `${baseName}.xlsx`;
  const buf = await buildXlsxBufferFromSheets(
    input.sheets.map((s) => ({
      name: s.name,
      rows: s.rows,
    })),
  );
  const { id } = await storeAgentFile(buf, {
    mediaType: XLSX_MEDIA,
    filename,
  });
  return {
    url: `${AGENT_FILE_API_PREFIX}/${id}`,
    mediaType: XLSX_MEDIA,
    filename,
  };
}
