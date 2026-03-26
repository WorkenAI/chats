import type { UIMessage } from "ai";
import type { AgentUserMessageMetadata } from "@/core/agents/message-metadata";

function key(installationId: string, externalChatId: string): string {
  return `${installationId}:${externalChatId}`;
}

const messagesByConversation = new Map<string, UIMessage[]>();

const MAX_MESSAGES = 80;

function trim(list: UIMessage[]): UIMessage[] {
  if (list.length <= MAX_MESSAGES) {
    return list;
  }
  return list.slice(list.length - MAX_MESSAGES);
}

export function appendUserMessage(
  installationId: string,
  externalChatId: string,
  text: string,
  messageId: string,
  options?: { replyToExternalMessageId?: string },
): UIMessage[] {
  const k = key(installationId, externalChatId);
  const list = trim([...(messagesByConversation.get(k) ?? [])]);
  const metadata: AgentUserMessageMetadata = {
    externalMessageId: messageId,
    ...(options?.replyToExternalMessageId != null
      ? { replyToExternalMessageId: options.replyToExternalMessageId }
      : {}),
  };
  const msg: UIMessage = {
    id: messageId,
    role: "user",
    metadata,
    parts: [{ type: "text", text }],
  };
  list.push(msg);
  messagesByConversation.set(k, list);
  return list.slice(-30);
}

export function appendAssistantBubble(
  installationId: string,
  externalChatId: string,
  text: string,
): void {
  const k = key(installationId, externalChatId);
  const list = trim([...(messagesByConversation.get(k) ?? [])]);
  list.push({
    id: `asst-${crypto.randomUUID()}`,
    role: "assistant",
    parts: [{ type: "text", text }],
  });
  messagesByConversation.set(k, list);
}
