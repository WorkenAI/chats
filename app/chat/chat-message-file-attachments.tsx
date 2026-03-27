"use client";

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  type AttachmentData,
} from "@/components/ai-elements/attachments";
import { getChatFileUIPartKind } from "@/lib/chat-file-ui-part-kind";
import { cn } from "@/lib/utils";
import type { FileUIPart } from "ai";
import { FileSpreadsheet, FileText } from "lucide-react";
import { useMemo } from "react";
import { useChatFileViewer } from "./chat-file-viewer-context";

/** Visual / interaction hint for the attachment chip. */
type AttachmentRowKind = "spreadsheet" | "text" | "image" | "file";

function rowKind(part: FileUIPart): AttachmentRowKind {
  const k = getChatFileUIPartKind(part);
  if (k === "spreadsheet") {
    return "spreadsheet";
  }
  if (k === "text") {
    return "text";
  }
  if (k === "image") {
    return "image";
  }
  return "file";
}

/**
 * Attachment chips only — opens the right-hand file panel on activate (no inline
 * editors inside the message bubble).
 */
export function ChatMessageFileAttachments({
  parts,
  className,
}: {
  parts: FileUIPart[];
  className?: string;
}) {
  const { openFile } = useChatFileViewer();

  const list = useMemo(
    () =>
      parts.map((p, i) => {
        const rk = rowKind(p);
        const data = {
          ...p,
          id: `${i}-${p.url}`,
        } satisfies AttachmentData;
        return {
          key: data.id,
          part: p,
          data,
          kind: rk,
        };
      }),
    [parts],
  );

  if (list.length === 0) {
    return null;
  }

  return (
    <Attachments className={cn("justify-end", className)} variant="inline">
      {list.map(({ key, part, data, kind }) => (
        <Attachment
          key={key}
          className={cn(
            (kind === "spreadsheet" || kind === "text") &&
              "ring-primary/20 ring-1",
          )}
          data={data}
          onClick={() => openFile(part)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openFile(part);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <AttachmentPreview
            fallbackIcon={
              kind === "spreadsheet" ? (
                <FileSpreadsheet className="size-3 text-muted-foreground" />
              ) : kind === "text" ? (
                <FileText className="size-3 text-muted-foreground" />
              ) : undefined
            }
          />
          <AttachmentInfo />
        </Attachment>
      ))}
    </Attachments>
  );
}
