import { DurableAgent } from "@workflow/ai/agent";
import { gateway } from "@workflow/ai/gateway";
import {
  convertToModelMessages,
  tool,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getWritable, sleep } from "workflow";
import { z } from "zod";
import {
  CHANNEL_AGENT_INSTRUCTIONS,
  MESSENGER_AGENT_BASE_INSTRUCTIONS,
} from "@/core/agents/channel-instructions";
import { injectUserMessageContextForModel } from "@/core/agents/inject-user-message-context";
import { optionalReplyToMessageIdSchema } from "@/core/agents/tool-schemas";
import {
  webChatBubbleDataPartToTextPart,
  webChatReactionDataPartToTextPart,
} from "@/core/agents/web-chat-model-parts";
import { appendAssistantBubble } from "@/core/conversations/store";
import { dispatchOutbound } from "@/core/outbound/dispatch";

const WEB_UI_INSTRUCTIONS = `${MESSENGER_AGENT_BASE_INSTRUCTIONS} You are in a web chat in the browser. Each user turn starts with [User message id=…]. Each assistant bubble in history appears as a line starting with [Assistant bubble id=…]. For send_chat_message.replyToMessageId, copy that exact id string only (user message id or assistant bubble id). Never invent ids or quoted text the user did not send; omit replyToMessageId when not threading. You may call set_message_reaction with externalMessageId from [Conversation context] (the user's external message id line) when a single emoji reaction fits; use one Unicode emoji only.`;

function resolveModelId(): string {
  return process.env.AGENT_MODEL?.trim() || "openai/gpt-4o-mini";
}

export type MessengerAgentTurnInput = {
  installationId: string;
  externalChatId: string;
  messages: UIMessage[];
};

/** Tool steps must not close over workflow locals — Workflow extracts each tool execute body as its own step. */
async function messengerSendChatMessageStep(params: {
  streamUiBubbles: boolean;
  installationId: string;
  externalChatId: string;
  text: string;
  replyToMessageId?: string;
  toolCallId: string;
}): Promise<{ ok: true }> {
  "use step";
  const {
    streamUiBubbles,
    installationId,
    externalChatId,
    text,
    replyToMessageId,
    toolCallId,
  } = params;
  if (streamUiBubbles) {
    const w = getWritable<UIMessageChunk>();
    const writer = w.getWriter();
    const bubbleData: { text: string; replyToMessageId?: string } = { text };
    if (replyToMessageId != null) {
      bubbleData.replyToMessageId = replyToMessageId;
    }
    const chunk: UIMessageChunk = {
      type: "data-chat-bubble",
      id: toolCallId + "-" + crypto.randomUUID(),
      data: bubbleData,
    };
    await writer.write(chunk);
    writer.releaseLock();
  } else {
    await dispatchOutbound({
      installationId,
      target: { externalChatId },
      payload: {
        kind: "text",
        text,
        ...(replyToMessageId != null
          ? { replyToExternalMessageId: replyToMessageId }
          : {}),
      },
    });
    appendAssistantBubble(installationId, externalChatId, text);
  }
  return { ok: true as const };
}

async function messengerSetMessageReactionStep(params: {
  streamUiBubbles: boolean;
  installationId: string;
  externalChatId: string;
  externalMessageId: string;
  emoji: string;
  toolCallId: string;
}): Promise<{ ok: true }> {
  "use step";
  const {
    streamUiBubbles,
    installationId,
    externalChatId,
    externalMessageId,
    emoji,
    toolCallId,
  } = params;
  if (streamUiBubbles) {
    const w = getWritable<UIMessageChunk>();
    const writer = w.getWriter();
    const chunk: UIMessageChunk = {
      type: "data-chat-reaction",
      id: toolCallId + "-" + crypto.randomUUID(),
      data: {
        targetUserMessageId: externalMessageId,
        emoji: emoji.trim(),
      },
    };
    await writer.write(chunk);
    writer.releaseLock();
  } else {
    await dispatchOutbound({
      installationId,
      target: { externalChatId },
      payload: {
        kind: "reaction",
        externalMessageId,
        emoji,
      },
    });
  }
  return { ok: true as const };
}

function typingPauseTool() {
  return tool({
    description:
      "Pause like a human thinking or typing before the next bubble. Call before most send_chat_message calls.",
    inputSchema: z.object({
      durationMs: z
        .number()
        .int()
        .min(250)
        .max(15000)
        .describe("How long to wait in milliseconds."),
    }),
    execute: async ({ durationMs }) => {
      await sleep(durationMs);
      return { ok: true as const, pausedMs: durationMs };
    },
  });
}

/** Web channel: bubbles via UI stream (data-chat-bubble chunks). */
export async function runWebMessengerAgentTurn(input: MessengerAgentTurnInput) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();
  const tools = {
    typing_pause: typingPauseTool(),
    send_chat_message: tool({
      description:
        "Send one chat bubble to the user. Call once per bubble; use multiple calls for multiple bubbles.",
      inputSchema: z.object({
        text: z
          .string()
          .min(1)
          .max(4096)
          .describe("A single short message bubble."),
        replyToMessageId: optionalReplyToMessageIdSchema.describe(
          "Exact target id: from [Conversation context] or [Assistant bubble id=…] only.",
        ),
      }),
      execute: async ({ text, replyToMessageId }, { toolCallId }) =>
        messengerSendChatMessageStep({
          streamUiBubbles: true,
          installationId: input.installationId,
          externalChatId: input.externalChatId,
          text,
          ...(replyToMessageId != null ? { replyToMessageId } : {}),
          toolCallId,
        }),
    }),
    set_message_reaction: tool({
      description:
        "Set or remove an emoji reaction on the user's message. Use the external message id from [Conversation context].",
      inputSchema: z.object({
        externalMessageId: z
          .string()
          .min(1)
          .describe(
            "Target message id from [Conversation context] (external message id line).",
          ),
        emoji: z
          .string()
          .describe(
            "One standard emoji to set, or empty string to remove your reaction on that message.",
          ),
      }),
      execute: async ({ externalMessageId, emoji }, { toolCallId }) =>
        messengerSetMessageReactionStep({
          streamUiBubbles: true,
          installationId: input.installationId,
          externalChatId: input.externalChatId,
          externalMessageId,
          emoji,
          toolCallId,
        }),
    }),
  };

  const agent = new DurableAgent({
    model: gateway(resolveModelId()),
    instructions: WEB_UI_INSTRUCTIONS,
    tools,
  });

  const baseMessages = injectUserMessageContextForModel(input.messages);
  const modelMessages = await convertToModelMessages(baseMessages, {
    convertDataPart: (part) =>
      webChatBubbleDataPartToTextPart(part) ??
      webChatReactionDataPartToTextPart(part),
  });

  await agent.stream({
    messages: modelMessages,
    writable,
    maxSteps: 28,
  });
}

/** External channel (e.g. Telegram): dispatchOutbound + server message store. */
export async function runChannelMessengerAgentTurn(input: MessengerAgentTurnInput) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();
  const tools = {
    typing_pause: typingPauseTool(),
    send_chat_message: tool({
      description:
        "Send one chat bubble to the user. Call once per bubble; use multiple calls for multiple bubbles.",
      inputSchema: z.object({
        text: z
          .string()
          .min(1)
          .max(4096)
          .describe("A single short message bubble."),
        replyToMessageId: optionalReplyToMessageIdSchema.describe(
          "Optional id to thread this bubble (from [Conversation context] on the user message). Use exact values only.",
        ),
      }),
      execute: async ({ text, replyToMessageId }, { toolCallId }) =>
        messengerSendChatMessageStep({
          streamUiBubbles: false,
          installationId: input.installationId,
          externalChatId: input.externalChatId,
          text,
          ...(replyToMessageId != null ? { replyToMessageId } : {}),
          toolCallId,
        }),
    }),
    set_message_reaction: tool({
      description:
        "Set or remove an emoji reaction on the user's message. Use the external message id from [Conversation context].",
      inputSchema: z.object({
        externalMessageId: z
          .string()
          .min(1)
          .describe(
            "Target message id from [Conversation context] (external message id line).",
          ),
        emoji: z
          .string()
          .describe(
            "One standard emoji to set, or empty string to remove your reaction on that message.",
          ),
      }),
      execute: async ({ externalMessageId, emoji }, { toolCallId }) =>
        messengerSetMessageReactionStep({
          streamUiBubbles: false,
          installationId: input.installationId,
          externalChatId: input.externalChatId,
          externalMessageId,
          emoji,
          toolCallId,
        }),
    }),
  };

  const agent = new DurableAgent({
    model: gateway(resolveModelId()),
    instructions: CHANNEL_AGENT_INSTRUCTIONS,
    tools,
  });

  const baseMessages = injectUserMessageContextForModel(input.messages);
  const modelMessages = await convertToModelMessages(baseMessages);

  await agent.stream({
    messages: modelMessages,
    writable,
    maxSteps: 28,
  });
}
