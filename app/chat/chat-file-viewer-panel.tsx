"use client";

import { SpreadsheetEditorPanel } from "@/app/chat/spreadsheet-editor-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FileUIPart } from "ai";
import { XIcon } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useChatFileViewer } from "./chat-file-viewer-context";

const TEXT_MAX_CHARS = 600_000;

function PanelChrome({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-border flex h-full min-h-0 flex-col border-l bg-[color-mix(in_srgb,var(--card)_92%,transparent)] backdrop-blur-sm">
      <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 truncate font-medium text-sm">{title}</h2>
        <Button
          aria-label="Close file panel"
          className="size-8 shrink-0 p-0"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        {children}
      </div>
    </div>
  );
}

function TextFileViewer({ file }: { file: FileUIPart }) {
  const title = file.filename?.trim() || "Text file";
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [text, setText] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!file.url) {
      setPhase("error");
      return;
    }
    let cancelled = false;
    setPhase("loading");
    setLoadError(null);

    (async () => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const raw = await res.text();
        if (cancelled) {
          return;
        }
        const cut = raw.length > TEXT_MAX_CHARS;
        setText(cut ? raw.slice(0, TEXT_MAX_CHARS) : raw);
        setTruncated(cut);
        setPhase("ready");
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Load failed");
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file.url]);

  const download = useCallback(() => {
    const mt = file.mediaType?.trim() || "text/plain";
    const blob = new Blob([text], { type: `${mt};charset=utf-8` });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.filename?.trim() || "edited.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [file, text]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-muted-foreground text-xs leading-snug">
        {phase === "loading"
          ? "Loading…"
          : phase === "error"
            ? loadError
              ? `Could not load: ${loadError}.`
              : "Could not load this file."
            : truncated
              ? `Showing first ${TEXT_MAX_CHARS.toLocaleString()} characters only.`
              : "Edit and download a copy; the chat attachment URL is not updated."}
      </p>
      {phase === "error" && file.url ? (
        <a
          className={cn(buttonVariants({ variant: "outline" }), "w-fit text-xs")}
          href={file.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open in new tab
        </a>
      ) : null}
      {phase === "ready" ? (
        <Textarea
          className="min-h-[min(60vh,480px)] flex-1 resize-y font-mono text-sm"
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          value={text}
        />
      ) : null}
      {phase === "loading" ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : null}
      {phase === "ready" ? (
        <Button className="w-fit" onClick={download} size="sm" type="button">
          Download edited file
        </Button>
      ) : null}
    </div>
  );
}

function ImageFileViewer({ file }: { file: FileUIPart }) {
  const title = file.filename?.trim() || "Image";
  const url = file.url ?? "";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        Preview only — open in a new tab for full size or other tools.
      </p>
      {url ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-border bg-muted/20 p-2">
          <img
            alt={title}
            className="max-h-full max-w-full object-contain"
            src={url}
          />
        </div>
      ) : null}
      {url ? (
        <a
          className={cn(buttonVariants({ variant: "outline" }), "w-fit text-xs")}
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open in new tab
        </a>
      ) : null}
    </div>
  );
}

function BinaryFileViewer({ file }: { file: FileUIPart }) {
  const title = file.filename?.trim() || "File";
  const url = file.url ?? "";
  const mt = file.mediaType?.trim() || "unknown type";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        This format cannot be edited here ({mt}). Open or download in your
        browser.
      </p>
      {url ? (
        <div className="flex flex-col gap-2">
          <a
            className={cn(buttonVariants({ variant: "default" }), "w-full")}
            href={url}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open in new tab
          </a>
          <a
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            download={title}
            href={url}
            rel="noopener noreferrer"
          >
            Download
          </a>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Right-side attachment viewer (desktop: column; narrow screens: overlay).
 * Renders outside message bubbles — opened from attachment chips only.
 */
export function ChatFileViewerPanel() {
  const { open, close } = useChatFileViewer();

  if (!open) {
    return null;
  }

  const title =
    open.file.filename?.trim() ||
    (open.mode === "image" ? "Image" : "Attachment");

  return (
    <>
      <button
        aria-label="Close file viewer"
        className="bg-background/60 fixed inset-0 z-40 md:hidden"
        onClick={close}
        type="button"
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full min-h-0 w-full max-w-lg flex-col shadow-2xl",
          "md:static md:z-auto md:max-w-[min(100%,26rem)] md:shrink-0 md:shadow-none",
        )}
      >
        <PanelChrome onClose={close} title={title}>
          {open.mode === "spreadsheet" ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <SpreadsheetEditorPanel
                file={open.file}
                onClose={close}
                variant="sidebar"
              />
            </div>
          ) : null}
          {open.mode === "text" ? <TextFileViewer file={open.file} /> : null}
          {open.mode === "image" ? <ImageFileViewer file={open.file} /> : null}
          {open.mode === "binary" ? <BinaryFileViewer file={open.file} /> : null}
        </PanelChrome>
      </aside>
    </>
  );
}
