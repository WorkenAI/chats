import type { UIMessage } from "ai";
import type { AgentUserMessageMetadata } from "@/core/agents/message-metadata";

/** One human reaction on an assistant bubble (synced via POST /api/chat/reaction). */
export type WebChatUserReaction = {
  emoji: string;
  userId: string;
  displayName?: string;
  avatarUrl?: string;
};

/** Custom data parts for web chat (`data-${key}`). */
export type WebChatDataTypes = {
  "chat-bubble": {
    text: string;
    replyToMessageId?: string;
    /** Reactions users added under this assistant bubble. */
    userReactions?: WebChatUserReaction[];
  };
  "chat-reaction": {
    targetUserMessageId: string;
    emoji: string;
  };
};

export type AppWebUIMessage = UIMessage<
  AgentUserMessageMetadata,
  WebChatDataTypes
>;

export function isWebChatBubblePart(
  part: unknown,
): part is {
  type: "data-chat-bubble";
  id?: string;
  data: WebChatDataTypes["chat-bubble"];
} {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: string }).type === "data-chat-bubble" &&
    typeof (part as { data?: { text?: unknown } }).data?.text === "string"
  );
}

export function isWebChatReactionPart(
  part: unknown,
): part is {
  type: "data-chat-reaction";
  id?: string;
  data: WebChatDataTypes["chat-reaction"];
} {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: string }).type === "data-chat-reaction" &&
    typeof (part as { data?: { targetUserMessageId?: unknown } }).data
      ?.targetUserMessageId === "string" &&
    typeof (part as { data?: { emoji?: unknown } }).data?.emoji === "string"
  );
}

export function collectAgentReactionsOnUserMessage(
  userMessageId: string,
  messages: AppWebUIMessage[],
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") {
      continue;
    }
    for (const p of m.parts) {
      if (!isWebChatReactionPart(p)) {
        continue;
      }
      if (p.data.targetUserMessageId !== userMessageId) {
        continue;
      }
      const e = p.data.emoji.trim();
      if (!e || seen.has(e)) {
        continue;
      }
      seen.add(e);
      ordered.push(e);
    }
  }
  return ordered;
}
