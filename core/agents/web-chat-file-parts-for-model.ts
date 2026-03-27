import type { UIMessage } from "ai";
import { isFileUIPart, type FileUIPart } from "ai";
import { getChatFileUIPartKind } from "@/lib/chat-file-ui-part-kind";
import { readFileUrlToArrayBuffer } from "@/lib/file-url-to-buffer";

const MAX_SPREADSHEET_CHARS = 50_000;
const MAX_SHEETS = 5;
/** Same cap as in-app spreadsheet preview (xlsx can expand in memory). */
const MAX_SPREADSHEET_BYTES = 4 * 1024 * 1024;

const MAX_TEXT_FILE_CHARS = 100_000;
/** Avoid loading huge binaries that were mislabeled as text. */
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

async function spreadsheetFilePartToText(part: FileUIPart): Promise<string> {
  const buf = await readFileUrlToArrayBuffer(part.url, MAX_SPREADSHEET_BYTES);
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array" });
  const chunks: string[] = [];
  for (const name of wb.SheetNames.slice(0, MAX_SHEETS)) {
    const sheet = wb.Sheets[name];
    if (!sheet) {
      continue;
    }
    const csv = XLSX.utils.sheet_to_csv(sheet);
    chunks.push(`### ${name}\n${csv}`);
  }
  let body = chunks.join("\n\n").trim();
  if (body.length === 0) {
    body = "(empty workbook)";
  }
  if (body.length > MAX_SPREADSHEET_CHARS) {
    body = `${body.slice(0, MAX_SPREADSHEET_CHARS)}\n… [truncated]`;
  }
  const label = part.filename?.trim() || "spreadsheet";
  return `[User attached spreadsheet: ${label}]\n${body}`;
}

async function textFilePartToText(part: FileUIPart): Promise<string> {
  const buf = await readFileUrlToArrayBuffer(part.url, MAX_TEXT_FILE_BYTES);
  if (buf.byteLength > MAX_TEXT_FILE_BYTES) {
    throw new Error("file too large");
  }
  const body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  let text = body;
  if (text.length > MAX_TEXT_FILE_CHARS) {
    text = `${text.slice(0, MAX_TEXT_FILE_CHARS)}\n… [truncated]`;
  }
  const label = part.filename?.trim() || "file";
  return `[User attached file: ${label}]\n${text}`;
}

async function filePartToModelParts(part: FileUIPart): Promise<UIMessage["parts"]> {
  switch (getChatFileUIPartKind(part)) {
    case "image":
      return [part];
    case "spreadsheet":
      try {
        const text = await spreadsheetFilePartToText(part);
        return [{ type: "text", text }];
      } catch {
        return [
          {
            type: "text",
            text: `[User attached spreadsheet: ${part.filename?.trim() || "file"} — could not read contents.]`,
          },
        ];
      }
    case "text":
      try {
        const text = await textFilePartToText(part);
        return [{ type: "text", text }];
      } catch {
        return [
          {
            type: "text",
            text: `[User attached file: ${part.filename?.trim() || "file"} — could not read text contents (file may be too large or unreadable).]`,
          },
        ];
      }
    case "binary":
      return [
        {
          type: "text",
          text: `[User attached file: ${part.filename?.trim() || "attachment"} (${part.mediaType?.trim() || "unknown type"}). Binary content is not passed to the model; ask the user if you need details.]`,
        },
      ];
  }
}

/**
 * AI Gateway rejects some `file` media types (e.g. Excel). Images are kept as file parts;
 * spreadsheets are inlined as CSV text; text-like files (e.g. .md, .txt, code) are inlined as UTF-8;
 * remaining binaries become a short text placeholder.
 */
export async function expandFilePartsForAiGateway(
  messages: UIMessage[],
): Promise<UIMessage[]> {
  const out: UIMessage[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") {
      out.push(m);
      continue;
    }
    const nextParts: UIMessage["parts"] = [];
    for (const p of m.parts) {
      if (isFileUIPart(p)) {
        const replacement = await filePartToModelParts(p);
        nextParts.push(...replacement);
      } else {
        nextParts.push(p);
      }
    }
    out.push({ ...m, parts: nextParts });
  }
  return out;
}
