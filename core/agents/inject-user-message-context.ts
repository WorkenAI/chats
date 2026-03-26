import type { UIMessage } from "ai";
import type { AgentUserMessageMetadata } from "@/core/agents/message-metadata";

function buildContextPrefix(meta: AgentUserMessageMetadata): string | null {
  const segments: string[] = [];
  if (meta.externalMessageId != null) {
    segments.push(`User message external message id=${meta.externalMessageId}.`);
  }
  if (meta.replyToExternalMessageId != null) {
    segments.push(
      `This message replies to external message id=${meta.replyToExternalMessageId}.`,
    );
  }
  if (meta.replyToMessageId != null && meta.externalMessageId == null) {
    segments.push(
      `User is replying to id=${meta.replyToMessageId} (use the exact string as send_chat_message.replyToMessageId: either a user message id or an assistant bubble id from [Assistant bubble id=…] lines).`,
    );
  }
  if (segments.length === 0) {
    return null;
  }
  return `[Conversation context] ${segments.join(" ")}`;
}

/**
 * Prepends a short text prefix so the model sees ids from `metadata` (AI SDK does not pass metadata to the model).
 * Only for use immediately before `convertToModelMessages`.
 */
export function injectUserMessageContextForModel(
  messages: UIMessage[],
): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== "user") {
      return m;
    }
    const meta = m.metadata as AgentUserMessageMetadata | undefined;
    const userLine = `[User message id=${m.id}]`;
    const ctx = meta != null ? buildContextPrefix(meta) : null;
    const header =
      ctx != null ? `${userLine}\n${ctx}\n\n` : `${userLine}\n\n`;
    return {
      ...m,
      parts: [{ type: "text", text: header }, ...m.parts],
    };
  });
}
