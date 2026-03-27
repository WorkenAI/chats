"use client";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import { Paperclip } from "lucide-react";
import type { FormEvent } from "react";

function PromptAttachmentHeader() {
  const { files, remove } = usePromptInputAttachments();
  if (files.length === 0) {
    return null;
  }
  return (
    <PromptInputHeader className="border-border/60 min-h-0 border-b px-1 py-1.5">
      <div className="flex flex-wrap gap-1.5">
        {files.map((f) => (
          <span
            key={f.id}
            className="border-border bg-muted/40 inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
          >
            <span className="max-w-[200px] truncate">
              {f.filename?.trim() || "File"}
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0 px-0.5"
              onClick={() => remove(f.id)}
              aria-label={`Remove ${f.filename ?? "file"}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </PromptInputHeader>
  );
}

function ConversationChatPromptInner({
  busy,
  className,
  status,
  onStop,
  onSubmit,
}: {
  busy: boolean;
  className?: string;
  status: ChatStatus;
  onStop: () => void;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
}) {
  const { textInput, attachments } = usePromptInputController();
  const canSend =
    textInput.value.trim().length > 0 || attachments.files.length > 0;

  return (
    <PromptInput
      className={cn("relative w-full shrink-0", className)}
      globalDrop={false}
      multiple
      onSubmit={onSubmit}
    >
      <PromptAttachmentHeader />
      <PromptInputBody>
        <PromptInputTextarea
          aria-label="Message"
          className="pr-12"
          disabled={busy}
          placeholder="Message…"
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputButton
            type="button"
            disabled={busy}
            onClick={() => attachments.openFileDialog()}
            tooltip="Attach file"
          >
            <Paperclip className="size-4" />
          </PromptInputButton>
        </PromptInputTools>
        <PromptInputSubmit
          className="shrink-0"
          disabled={busy || !canSend}
          onStop={() => void onStop()}
          status={status}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}

export function ConversationChatPrompt({
  chatId,
  busy,
  className,
  status,
  onStop,
  onSubmit,
}: {
  chatId: string;
  busy: boolean;
  className?: string;
  status: ChatStatus;
  onStop: () => void;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
}) {
  return (
    <PromptInputProvider key={chatId}>
      <ConversationChatPromptInner
        busy={busy}
        className={className}
        onStop={onStop}
        onSubmit={onSubmit}
        status={status}
      />
    </PromptInputProvider>
  );
}
