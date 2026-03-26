import { start } from "workflow/api";
import type { InboundEvent } from "@/core/connectors/types";
import { isAiGatewayAvailable } from "@/core/agents/gateway-env";
import { appendUserMessage } from "@/core/conversations/store";
import { runChannelAgentTurn } from "@/workflows/channel-agent-turn";
import { tryMarkProcessed } from "./dedupe";

/**
 * Durable path: invoked from the queue consumer after dequeue.
 */
export async function ingestInboundEvent(event: InboundEvent): Promise<void> {
  const key = `${event.connector.installationId}:${event.event.externalEventId}`;
  if (!tryMarkProcessed(key)) {
    return;
  }

  await dispatchToConversationPipeline(event);
}

async function dispatchToConversationPipeline(event: InboundEvent): Promise<void> {
  console.info(
    "[ingress]",
    event.event.kind,
    event.connector.kind,
    event.conversation.externalChatId,
    event.event.text?.slice(0, 80),
  );

  await maybeStartChannelAgent(event);
}

async function maybeStartChannelAgent(event: InboundEvent): Promise<void> {
  if (event.event.kind !== "message.created") {
    return;
  }

  const text = event.event.text?.trim();
  if (!text) {
    return;
  }

  if (!isAiGatewayAvailable()) {
    console.info(
      "[ingress] agent skipped: set AI_GATEWAY_API_KEY locally, or run on Vercel for OIDC",
    );
    return;
  }

  const userMessageId =
    event.event.externalMessageId ?? event.event.externalEventId;

  const messages = appendUserMessage(
    event.connector.installationId,
    event.conversation.externalChatId,
    text,
    userMessageId,
    event.event.replyToExternalMessageId != null
      ? { replyToExternalMessageId: event.event.replyToExternalMessageId }
      : undefined,
  );

  await start(runChannelAgentTurn, [
    {
      installationId: event.connector.installationId,
      externalChatId: event.conversation.externalChatId,
      messages,
    },
  ]);
}
