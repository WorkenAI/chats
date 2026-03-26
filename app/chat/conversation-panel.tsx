"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import {
  getToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import { MessageSquare, X } from "lucide-react";
import {
  forwardRef,
  Fragment,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from "react";
import {
  defaultAvatarUrlForUserId,
  getWebChatParticipant,
  type WebChatParticipant,
} from "@/core/agents/web-chat-participant";
import {
  normalizeUserReactions,
  toggleUserReactionOnBubble,
  userWillRemoveReaction,
} from "@/core/agents/web-chat-reactions";
import { postReaction } from "@/app/chat/reaction-sync";
import { useSetHeaderStatus } from "./shell-header";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import type { AgentUserMessageMetadata } from "@/core/agents/message-metadata";
import { cn } from "@/lib/utils";
import {
  type AppWebUIMessage,
  type WebChatUserReaction,
  collectAgentReactionsOnUserMessage,
  isWebChatBubblePart,
} from "@/core/agents/web-chat-ui-types";
import { WEB_CHAT_INSTALLATION_ID } from "@/lib/web-chat-installation";

/** Quick emoji row under assistant bubbles (human → agent message). */
const USER_REACTION_PICKER = ["👍", "❤️", "😂", "🙏", "🔥"] as const;

/** Vertical step between thread rows and between bubble / toolbars inside a message. */
const CHAT_MESSAGE_V_GAP = "gap-2";

/** Same max width + vertical rhythm for user/assistant shells and plain bubble wrappers. */
const CHAT_MESSAGE_BUBBLE_WRAP = cn(
  "flex w-full max-w-[min(100%,42rem)] flex-col",
  CHAT_MESSAGE_V_GAP,
);

/** Full-width row so inner `CHAT_MESSAGE_BUBBLE_WRAP` + alignment control the column (not `Message`’s default max-w-[95%]). */
const CHAT_MESSAGE_ROW = "w-full max-w-full";

/** Preview for a whole user message (message id reply). */
function previewForUserMessage(m: AppWebUIMessage): string {
  const textParts = m.parts.filter(
    (p): p is { type: "text"; text: string } => p.type === "text",
  );
  const combined = textParts.map((p) => p.text).join("").trim();
  if (!combined) {
    return "Message";
  }
  return combined.length > 120 ? `${combined.slice(0, 120)}…` : combined;
}

/**
 * Resolve quote text for replyToMessageId: prefer assistant bubble part id, then user message id,
 * then legacy whole-assistant message id (join bubbles).
 */
function findQuotePreview(
  targetId: string,
  allMessages: AppWebUIMessage[],
): string | undefined {
  for (const m of allMessages) {
    for (const p of m.parts) {
      if (
        isWebChatBubblePart(p) &&
        typeof p.id === "string" &&
        p.id === targetId
      ) {
        const t = p.data.text.trim();
        return t.length > 120 ? `${t.slice(0, 120)}…` : t;
      }
    }
  }

  const msg = allMessages.find((x) => x.id === targetId);
  if (!msg) {
    return undefined;
  }
  if (msg.role === "user") {
    return previewForUserMessage(msg);
  }

  const bubbles = msg.parts.filter(isWebChatBubblePart);
  if (bubbles.length === 0) {
    return undefined;
  }
  const joined = bubbles
    .map((b) => b.data.text.trim())
    .filter(Boolean)
    .join(" · ");
  return joined.length > 120 ? `${joined.slice(0, 120)}…` : joined;
}

function removeAssistantBubbleFromMessages(
  messages: AppWebUIMessage[],
  assistantMessageId: string,
  bubbleId: string,
): AppWebUIMessage[] {
  return messages
    .map((m) => {
      if (m.id !== assistantMessageId || m.role !== "assistant") {
        return m;
      }
      const parts = m.parts.filter(
        (p) => !isWebChatBubblePart(p) || p.id !== bubbleId,
      );
      if (!parts.some(isWebChatBubblePart)) {
        return null;
      }
      return { ...m, parts };
    })
    .filter((m): m is AppWebUIMessage => m != null);
}

const reactionChipClassName =
  "bg-background/90 text-foreground ring-border/50 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[15px] leading-none shadow-sm ring-1 backdrop-blur-sm";

function ReactionChips({
  emojis,
  label,
  className,
  onToggleEmoji,
  disabled,
}: {
  emojis: readonly string[];
  label: string;
  className?: string;
  /** When set, each chip is a control that toggles this emoji (e.g. remove your reaction). */
  onToggleEmoji?: (emoji: string) => void;
  disabled?: boolean;
}) {
  if (emojis.length === 0) {
    return null;
  }
  return (
    <div
      aria-label={label}
      className={cn(
        "mt-1.5 flex flex-wrap gap-1",
        className,
      )}
      role="group"
    >
      {emojis.map((e) =>
        onToggleEmoji ? (
          <button
            aria-label={`Remove reaction ${e}`}
            className={cn(
              reactionChipClassName,
              "hover:bg-background cursor-pointer transition-colors",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              disabled && "pointer-events-none opacity-50",
            )}
            disabled={disabled}
            key={e}
            onClick={() => onToggleEmoji(e)}
            title="Remove reaction"
            type="button"
          >
            {e}
          </button>
        ) : (
          <span className={reactionChipClassName} key={e}>
            {e}
          </span>
        ),
      )}
    </div>
  );
}

function groupReactionsByUser(
  reactions: WebChatUserReaction[],
): [string, WebChatUserReaction[]][] {
  const order: string[] = [];
  const map = new Map<string, WebChatUserReaction[]>();
  for (const r of reactions) {
    if (!map.has(r.userId)) {
      order.push(r.userId);
      map.set(r.userId, []);
    }
    map.get(r.userId)!.push(r);
  }
  return order.map((id) => [id, map.get(id)!]);
}

function reactionAvatarSrc(r: WebChatUserReaction): string {
  const u = r.avatarUrl?.trim();
  if (u) {
    return u;
  }
  return defaultAvatarUrlForUserId(r.userId);
}

function UserReactionStacks({
  reactions,
  label,
  className,
  currentUserId,
  onToggleEmoji,
  disabled,
}: {
  reactions: WebChatUserReaction[];
  label: string;
  className?: string;
  currentUserId: string;
  onToggleEmoji?: (emoji: string) => void;
  disabled?: boolean;
}) {
  const grouped = useMemo(
    () => groupReactionsByUser(reactions),
    [reactions],
  );

  if (reactions.length === 0) {
    return null;
  }

  return (
    <div
      aria-label={label}
      className={cn("mt-1.5 flex flex-col gap-2", className)}
      role="group"
    >
      {grouped.map(([userId, rs]) => (
        <div className="flex items-center gap-2" key={userId}>
          <img
            alt=""
            className="ring-border/40 size-7 shrink-0 rounded-full object-cover ring-1"
            height={28}
            src={reactionAvatarSrc(rs[0]!)}
            width={28}
          />
          <div className="flex flex-wrap gap-1">
            {rs.map((r) => {
              const canToggle =
                Boolean(onToggleEmoji) &&
                userId === currentUserId &&
                currentUserId.length > 0;
              return canToggle ? (
                <button
                  aria-label={`Remove reaction ${r.emoji}`}
                  className={cn(
                    reactionChipClassName,
                    "hover:bg-background cursor-pointer transition-colors",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    disabled && "pointer-events-none opacity-50",
                  )}
                  disabled={disabled}
                  key={`${userId}-${r.emoji}`}
                  onClick={() => onToggleEmoji?.(r.emoji)}
                  title="Remove reaction"
                  type="button"
                >
                  {r.emoji}
                </button>
              ) : (
                <span
                  className={reactionChipClassName}
                  key={`${userId}-${r.emoji}`}
                >
                  {r.emoji}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function bubbleActionBarsClass(open: boolean) {
  return open
    ? "pointer-events-auto opacity-100 transition-opacity duration-200"
    : "hidden";
}

async function copyTextToClipboard(text: string) {
  const t = text.trim();
  if (!t || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    /* ignore */
  }
}

/** Quick emoji reactions — shown above the bubble (assistant). */
function MessageBubbleReactionBar({
  align,
  busy,
  bubbleId,
  emojis,
  onPick,
  open,
}: {
  align: "start" | "end";
  busy: boolean;
  bubbleId: string;
  emojis: readonly string[];
  onPick: (bubbleId: string, emoji: string) => void;
  open: boolean;
}) {
  return (
    <div
      aria-label="Quick reactions"
      className={cn(
        "border-border/40 bg-muted/60 flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-xl border px-1 py-0.5 shadow-sm backdrop-blur-sm",
        align === "start" ? "self-start" : "self-end ml-auto",
        bubbleActionBarsClass(open),
      )}
      role="toolbar"
    >
      {emojis.map((emoji) => (
        <Button
          aria-label={`React with ${emoji}`}
          className="text-foreground/90 size-9 shrink-0 p-0 text-lg hover:bg-background/80"
          disabled={busy}
          key={emoji}
          onClick={() => onPick(bubbleId, emoji)}
          type="button"
          variant="ghost"
        >
          {emoji}
        </Button>
      ))}
    </div>
  );
}

/** Reply, Forward (copy), Delete — shown below the bubble. */
function MessageBubbleSecondaryBar({
  align,
  busy,
  forwardText,
  onDelete,
  onReply,
  open,
}: {
  align: "start" | "end";
  busy: boolean;
  forwardText: string;
  onReply: () => void;
  onDelete: () => void;
  open: boolean;
}) {
  const canForward = forwardText.trim().length > 0;

  return (
    <div
      aria-label="Message actions"
      className={cn(
        "border-border/40 bg-muted/60 flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-xl border px-1 py-0.5 shadow-sm backdrop-blur-sm",
        align === "start" ? "self-start" : "self-end ml-auto",
        bubbleActionBarsClass(open),
      )}
      role="toolbar"
    >
      <Button
        className="text-muted-foreground hover:text-foreground h-9 px-3 text-xs"
        disabled={busy}
        onClick={onReply}
        type="button"
        variant="ghost"
      >
        Reply
      </Button>
      <Button
        className="text-muted-foreground hover:text-foreground h-9 px-3 text-xs"
        disabled={busy || !canForward}
        onClick={() => void copyTextToClipboard(forwardText)}
        type="button"
        variant="ghost"
      >
        Forward
      </Button>
      <Button
        className="text-destructive hover:text-destructive h-9 px-3 text-xs hover:bg-destructive/10"
        disabled={busy}
        onClick={() => {
          if (
            typeof window !== "undefined" &&
            !window.confirm("Delete this message?")
          ) {
            return;
          }
          onDelete();
        }}
        type="button"
        variant="ghost"
      >
        Delete
      </Button>
    </div>
  );
}

/**
 * Reveals reaction / action toolbars only after a click on the bubble body (not on links, buttons, or the toolbars).
 * Closes on outside click.
 */
function MessageBubbleActionShell({
  align = "start",
  children,
  className,
  reactionBar,
  secondaryBar,
}: {
  align?: "start" | "end";
  children: React.ReactNode;
  className?: string;
  reactionBar?: (open: boolean) => React.ReactNode;
  secondaryBar?: (open: boolean) => React.ReactNode;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!shellRef.current?.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [actionsOpen]);

  return (
    <div
      ref={shellRef}
      className={cn(
        CHAT_MESSAGE_BUBBLE_WRAP,
        "outline-none",
        align === "end" && "ml-auto self-end",
        className,
      )}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (
          t.closest(
            "button, a, input, textarea, [contenteditable='true'], [role='toolbar']",
          )
        ) {
          return;
        }
        setActionsOpen((o) => !o);
      }}
      onPointerDown={focusMessageShellIfNonInteractive}
      tabIndex={-1}
    >
      {reactionBar?.(actionsOpen)}
      {children}
      {secondaryBar?.(actionsOpen)}
    </div>
  );
}

function hasAssistantToolNoise(parts: AppWebUIMessage["parts"]) {
  return parts.some((p) => {
    const t = p.type;
    return (
      t === "dynamic-tool" ||
      (typeof t === "string" && t.startsWith("tool-")) ||
      t === "step-start"
    );
  });
}

/** Bubble ids from the workflow are `${toolCallId}-${uuid}`. */
function hasDataBubbleForToolCall(
  parts: AppWebUIMessage["parts"],
  toolCallId: string,
): boolean {
  const prefix = `${toolCallId}-`;
  return parts.some(
    (p) =>
      isWebChatBubblePart(p) &&
      typeof p.id === "string" &&
      p.id.startsWith(prefix),
  );
}

function parseSendChatToolInput(part: { input: unknown }): {
  text: string;
  replyToMessageId?: string;
} {
  const input = part.input;
  if (input == null || typeof input !== "object") {
    return { text: "" };
  }
  const o = input as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text : "";
  const replyToMessageId =
    typeof o.replyToMessageId === "string" ? o.replyToMessageId : undefined;
  return { text, replyToMessageId };
}

function shouldShowStreamingSendChatBubble(
  part: ToolUIPart | DynamicToolUIPart,
  parts: AppWebUIMessage["parts"],
): boolean {
  if (getToolName(part) !== "send_chat_message") {
    return false;
  }
  if (hasDataBubbleForToolCall(parts, part.toolCallId)) {
    return false;
  }
  const s = part.state;
  return (
    s === "input-streaming" ||
    s === "input-available" ||
    s === "output-available" ||
    s === "output-error"
  );
}

function hasStreamingSendChatText(parts: AppWebUIMessage["parts"]): boolean {
  for (const p of parts) {
    if (!isToolUIPart(p) || getToolName(p) !== "send_chat_message") {
      continue;
    }
    if (hasDataBubbleForToolCall(parts, p.toolCallId)) {
      continue;
    }
    if (parseSendChatToolInput(p).text.trim().length > 0) {
      return true;
    }
  }
  return false;
}

/** Touch / stylus: focus the shell for keyboard / accessibility without toggling via hover. */
function focusMessageShellIfNonInteractive(e: PointerEvent<HTMLDivElement>) {
  if (e.pointerType !== "touch" && e.pointerType !== "pen") {
    return;
  }
  if (
    (e.target as HTMLElement).closest(
      "button, a, input, textarea, [contenteditable='true']",
    )
  ) {
    return;
  }
  e.currentTarget.focus({ preventScroll: true });
}

function MessageBlocks({
  message,
  allMessages,
  busy,
  currentUserId,
  onDeleteAssistantBubble,
  onDeleteUserMessage,
  onReplyUser,
  onReplyBubble,
  onUserReactToBubble,
}: {
  message: AppWebUIMessage;
  allMessages: AppWebUIMessage[];
  busy: boolean;
  /** Hydrated web participant id; empty until client mount. */
  currentUserId: string;
  onDeleteUserMessage: (messageId: string) => void;
  onDeleteAssistantBubble: (assistantMessageId: string, bubbleId: string) => void;
  onReplyUser: (m: AppWebUIMessage) => void;
  onReplyBubble: (bubbleId: string, preview: string) => void;
  onUserReactToBubble: (bubbleId: string, emoji: string) => void;
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (!text.trim()) {
      return null;
    }
    const meta = message.metadata;
    const replyTargetId = meta?.replyToMessageId;
    const quotePreview = replyTargetId
      ? findQuotePreview(replyTargetId, allMessages)
      : undefined;

    const agentReactions = collectAgentReactionsOnUserMessage(
      message.id,
      allMessages,
    );

    return (
      <Message className={CHAT_MESSAGE_ROW} from="user">
        <MessageBubbleActionShell
          align="end"
          secondaryBar={(open) => (
            <MessageBubbleSecondaryBar
              align="end"
              busy={busy}
              forwardText={text}
              onDelete={() => onDeleteUserMessage(message.id)}
              onReply={() => onReplyUser(message)}
              open={open}
            />
          )}
        >
          <MessageContent
            className={cn(
              "gap-1.5 rounded-xl border border-border/60 bg-linear-to-br from-secondary to-secondary/90 px-3 py-2 shadow-sm",
              "ring-border/30 ring-1",
            )}
          >
            {quotePreview ? (
              <p className="text-muted-foreground border-primary/25 line-clamp-2 border-l-2 pl-2.5 text-xs">
                {quotePreview}
              </p>
            ) : null}
            <MessageResponse className="text-[15px] leading-relaxed">
              {text}
            </MessageResponse>
            {agentReactions.length > 0 ? (
              <ReactionChips
                className="opacity-100"
                emojis={agentReactions}
                label="Reactions from assistant"
              />
            ) : null}
          </MessageContent>
        </MessageBubbleActionShell>
      </Message>
    );
  }

  if (message.role === "assistant") {
    let bubbleIndex = 0;
    const rows: ReactElement[] = [];

    for (const part of message.parts) {
      if (isWebChatBubblePart(part)) {
        const replyId = part.data.replyToMessageId;
        const quotePreview = replyId
          ? findQuotePreview(replyId, allMessages)
          : undefined;
        const bubbleId = part.id;
        const stableKey =
          bubbleId != null && bubbleId.length > 0
            ? bubbleId
            : `${message.id}-bubble-${bubbleIndex}`;
        bubbleIndex += 1;
        const userRx = normalizeUserReactions(part.data.userReactions);
        const hasBubbleControls =
          bubbleId != null && bubbleId.length > 0;

        const bubbleBody = (
          <MessageContent
            className={cn(
              "gap-1.5 rounded-xl border border-border/70 bg-card/80 px-3 py-2 shadow-sm",
              "backdrop-blur-[2px]",
            )}
          >
            {quotePreview ? (
              <p className="text-muted-foreground border-primary/20 line-clamp-2 border-l-2 pl-2.5 text-xs">
                {quotePreview}
              </p>
            ) : null}
            <MessageResponse className="text-[15px] leading-relaxed [&_.streamdown]:text-[15px]">
              {part.data.text}
            </MessageResponse>
            {userRx.length > 0 ? (
              <UserReactionStacks
                currentUserId={currentUserId}
                disabled={busy}
                label="Reactions"
                onToggleEmoji={
                  hasBubbleControls
                    ? (emoji) => onUserReactToBubble(bubbleId!, emoji)
                    : undefined
                }
                reactions={userRx}
              />
            ) : null}
          </MessageContent>
        );

        rows.push(
          <Message className={CHAT_MESSAGE_ROW} from="assistant" key={stableKey}>
            {hasBubbleControls ? (
              <MessageBubbleActionShell
                reactionBar={(open) => (
                  <MessageBubbleReactionBar
                    align="start"
                    bubbleId={bubbleId}
                    busy={busy}
                    emojis={USER_REACTION_PICKER}
                    onPick={onUserReactToBubble}
                    open={open}
                  />
                )}
                secondaryBar={(open) => (
                  <MessageBubbleSecondaryBar
                    align="start"
                    busy={busy}
                    forwardText={part.data.text}
                    onDelete={() =>
                      onDeleteAssistantBubble(message.id, bubbleId)
                    }
                    onReply={() =>
                      onReplyBubble(
                        bubbleId,
                        part.data.text.trim().length > 120
                          ? `${part.data.text.trim().slice(0, 120)}…`
                          : part.data.text.trim(),
                      )
                    }
                    open={open}
                  />
                )}
              >
                {bubbleBody}
              </MessageBubbleActionShell>
            ) : (
              <div className={CHAT_MESSAGE_BUBBLE_WRAP}>{bubbleBody}</div>
            )}
          </Message>,
        );
        continue;
      }

      if (
        isToolUIPart(part) &&
        shouldShowStreamingSendChatBubble(part, message.parts)
      ) {
        const { text, replyToMessageId } = parseSendChatToolInput(part);
        const quotePreview = replyToMessageId
          ? findQuotePreview(replyToMessageId, allMessages)
          : undefined;
        const stableKey = `${message.id}-stream-${part.toolCallId}`;
        const showTypingPlaceholder = busy && !text.trim();

        rows.push(
          <Message
            aria-busy={showTypingPlaceholder}
            className={CHAT_MESSAGE_ROW}
            from="assistant"
            key={stableKey}
          >
            <div className={CHAT_MESSAGE_BUBBLE_WRAP}>
              <MessageContent
                className={cn(
                  "gap-1.5 rounded-xl border border-border/70 bg-card/80 px-3 py-2 shadow-sm",
                  "backdrop-blur-[2px]",
                )}
              >
                {quotePreview ? (
                  <p className="text-muted-foreground border-primary/20 line-clamp-2 border-l-2 pl-2.5 text-xs">
                    {quotePreview}
                  </p>
                ) : null}
                {text.trim() ? (
                  <MessageResponse className="text-[15px] leading-relaxed [&_.streamdown]:text-[15px]">
                    {text}
                  </MessageResponse>
                ) : showTypingPlaceholder ? (
                  <p className="text-muted-foreground animate-pulse text-[15px] leading-relaxed">
                    …
                  </p>
                ) : null}
              </MessageContent>
            </div>
          </Message>,
        );
      }
    }

    return <>{rows}</>;
  }

  return null;
}

export type ConversationPanelHandle = {
  persist: () => void;
};

type ConversationPanelProps = {
  chatId: string;
  /** Web channel installation (`Thread.external.installationId`). */
  installationId?: string;
  /** Message snapshot when opening a thread (hydrates the chat after switching). */
  storedMessages: AppWebUIMessage[];
  onThreadMessagesChange?: (threadId: string, messages: AppWebUIMessage[]) => void;
  onUserMessage?: (text: string) => void;
  /** Softer chrome when nested inside product shell center column. */
  embedInShell?: boolean;
};

export const ConversationPanel = forwardRef<
  ConversationPanelHandle,
  ConversationPanelProps
>(function ConversationPanel(
  {
    chatId,
    installationId = WEB_CHAT_INSTALLATION_ID,
    storedMessages,
    onThreadMessagesChange,
    onUserMessage,
    embedInShell = false,
  },
  ref,
) {
  const [viewer, setViewer] = useState<WebChatParticipant | null>(null);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<{
    id: string;
    preview: string;
  } | null>(null);

  const transport = useMemo(
    () =>
      new WorkflowChatTransport<AppWebUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({
          id,
          messages,
          api,
          body: requestBody,
        }) => ({
          api,
          body: {
            ...requestBody,
            messages,
            installationId,
            externalChatId: id,
          },
        }),
      }),
    [installationId],
  );

  const { messages, sendMessage, status, stop, error, setMessages } =
    useChat<AppWebUIMessage>({
    id: chatId,
    messages: storedMessages,
    transport,
  });

  const setHeaderStatus = useSetHeaderStatus();

  const busy = status === "submitted" || status === "streaming";

  const lastMsg = messages[messages.length - 1];
  const topBarThinking =
    busy &&
    lastMsg?.role === "assistant" &&
    lastMsg.parts.filter(isWebChatBubblePart).length === 0 &&
    hasAssistantToolNoise(lastMsg.parts) &&
    !hasStreamingSendChatText(lastMsg.parts);

  useEffect(() => {
    if (!setHeaderStatus) {
      return;
    }
    if (!busy) {
      setHeaderStatus({ kind: "idle" });
      return;
    }
    setHeaderStatus({
      kind: "busy",
      mode: topBarThinking ? "thinking" : "typing",
    });
  }, [busy, setHeaderStatus, topBarThinking]);

  useEffect(() => {
    onThreadMessagesChange?.(chatId, messages);
  }, [chatId, messages, onThreadMessagesChange]);

  useEffect(() => {
    setReplyTo(null);
  }, [chatId]);

  useEffect(() => {
    setViewer(getWebChatParticipant());
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      persist: () => {
        onThreadMessagesChange?.(chatId, messages);
      },
    }),
    [chatId, messages, onThreadMessagesChange],
  );

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text || busy) {
      return;
    }
    setInput("");
    onUserMessage?.(text);
    const meta: AgentUserMessageMetadata | undefined = replyTo
      ? { replyToMessageId: replyTo.id }
      : undefined;
    setReplyTo(null);
    void sendMessage(
      meta != null ? { text, metadata: meta } : { text },
    );
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-col gap-5",
        embedInShell ? "px-3 py-3 sm:px-5 sm:py-4" : "px-4 py-4 sm:px-6 sm:py-5",
      )}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col gap-5">
        <Conversation
          className={cn(
            "min-h-0 min-w-0 flex-1",
            embedInShell
              ? "rounded-none border-0 bg-transparent shadow-none"
              : "rounded-xl border border-border bg-card shadow-sm",
          )}
        >
          <ConversationContent
            className={cn(CHAT_MESSAGE_V_GAP, "p-4 sm:p-6")}
          >
            {messages.length === 0 ? (
              <ConversationEmptyState
                className="min-h-48 sm:min-h-64"
                description="Send a message — replies go through Vercel AI Gateway and a durable workflow."
                icon={
                  <MessageSquare
                    aria-hidden
                    className="text-muted-foreground/70 size-11 sm:size-12"
                    strokeWidth={1.25}
                  />
                }
                title="Start a conversation"
              />
            ) : (
              messages.map((m) => (
                <Fragment key={m.id}>
                  <MessageBlocks
                    allMessages={messages}
                    busy={busy}
                    currentUserId={viewer?.userId ?? ""}
                    message={m}
                    onDeleteAssistantBubble={(assistantMessageId, bubbleId) =>
                      setMessages((prev) =>
                        removeAssistantBubbleFromMessages(
                          prev,
                          assistantMessageId,
                          bubbleId,
                        ),
                      )
                    }
                    onDeleteUserMessage={(messageId) =>
                      setMessages((prev) =>
                        prev.filter((x) => x.id !== messageId),
                      )
                    }
                    onReplyBubble={(bubbleId, preview) =>
                      setReplyTo({ id: bubbleId, preview })
                    }
                    onReplyUser={(msg) =>
                      setReplyTo({
                        id: msg.id,
                        preview: previewForUserMessage(msg),
                      })
                    }
                    onUserReactToBubble={(bubbleId, emoji) => {
                      if (typeof window === "undefined") {
                        return;
                      }
                      const p = getWebChatParticipant();
                      const remove = userWillRemoveReaction(
                        messages,
                        bubbleId,
                        p.userId,
                        emoji,
                      );
                      setMessages((prev) =>
                        toggleUserReactionOnBubble(
                          prev,
                          bubbleId,
                          emoji,
                          p,
                        ),
                      );
                      void postReaction({
                        threadId: chatId,
                        bubbleId,
                        emoji,
                        remove,
                        participant: p,
                      }).then((ok) => {
                        if (!ok) {
                          setMessages((cur) =>
                            toggleUserReactionOnBubble(
                              cur,
                              bubbleId,
                              emoji,
                              p,
                            ),
                          );
                        }
                      });
                    }}
                  />
                </Fragment>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="mt-auto flex w-full shrink-0 flex-col gap-5">
          {replyTo ? (
            <div className="border-border bg-muted/30 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="text-muted-foreground min-w-0 flex-1 truncate">
                Replying to: {replyTo.preview}
              </span>
              <Button
                aria-label="Cancel reply"
                className="size-8 shrink-0"
                onClick={() => setReplyTo(null)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : null}

          <PromptInput
            className="relative w-full shrink-0"
            onSubmit={handleSubmit}
          >
            <PromptInputTextarea
              aria-label="Message"
              className="pr-12"
              disabled={busy}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder="Message…"
              value={input}
            />
            <PromptInputSubmit
              className="absolute right-1 bottom-1"
              disabled={!input.trim() && !busy}
              onStop={() => void stop()}
              status={status}
            />
          </PromptInput>

          {error ? (
            <p
              className="text-destructive border-destructive/25 bg-destructive/5 rounded-lg border px-3 py-2 text-sm"
              role="alert"
            >
              {error.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
});
