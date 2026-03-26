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
  MESSENGER_AGENT_BASE_INSTRUCTIONS,
} from "@/core/agents/channel-instructions";
import { injectUserMessageContextForModel } from "@/core/agents/inject-user-message-context";
import { optionalReplyToMessageIdSchema } from "@/core/agents/tool-schemas";
import {
  webChatBubbleDataPartToTextPart,
  webChatReactionDataPartToTextPart,
} from "@/core/agents/web-chat-model-parts";

const WEB_AGENT_INSTRUCTIONS = `${MESSENGER_AGENT_BASE_INSTRUCTIONS} You are in a web chat in the browser. Each user turn starts with [User message id=…]. Each assistant bubble in history appears as a line starting with [Assistant bubble id=…]. For send_chat_message.replyToMessageId, copy that exact id string only (user message id or assistant bubble id). Never invent ids or quoted text the user did not send; omit replyToMessageId when not threading. You may call set_message_reaction with targetUserMessageId from [Conversation context] (the user's external message id line) when a single emoji reaction fits; use one Unicode emoji only.`;

function resolveModelId(): string {
  return process.env.AGENT_MODEL?.trim() || "openai/gpt-4o-mini";
}

/**
 * Single-turn web chat: same durable agent pattern as channel workflows (Gateway, typing_pause, multi-bubble),
 * but assistant text is streamed as `data-chat-bubble` chunks for the UI.
 */
export async function runWebChatTurn(messages: UIMessage[]) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  const tools = {
    typing_pause: tool({
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
    }),

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
      execute: async ({ text, replyToMessageId }, { toolCallId }) => {
        "use step";
        const w = getWritable<UIMessageChunk>();
        const writer = w.getWriter();
        const chunk: UIMessageChunk = {
          type: "data-chat-bubble",
          id: `${toolCallId}-${crypto.randomUUID()}`,
          data: {
            text,
            ...(replyToMessageId != null ? { replyToMessageId } : {}),
          },
        };
        await writer.write(chunk);
        writer.releaseLock();
        return { ok: true as const };
      },
    }),

    set_message_reaction: tool({
      description:
        "Set an emoji reaction on the user's message in the web UI. Use targetUserMessageId from [Conversation context].",
      inputSchema: z.object({
        targetUserMessageId: z
          .string()
          .min(1)
          .describe(
            "User message id from the [User message id=…] line or [Conversation context] (external message id).",
          ),
        emoji: z
          .string()
          .min(1)
          .max(16)
          .describe("One emoji character or sequence (e.g. 👍)."),
      }),
      execute: async ({ targetUserMessageId, emoji }, { toolCallId }) => {
        "use step";
        const w = getWritable<UIMessageChunk>();
        const writer = w.getWriter();
        const chunk: UIMessageChunk = {
          type: "data-chat-reaction",
          id: `${toolCallId}-${crypto.randomUUID()}`,
          data: {
            targetUserMessageId,
            emoji: emoji.trim(),
          },
        };
        await writer.write(chunk);
        writer.releaseLock();
        return { ok: true as const };
      },
    }),
  };

  const agent = new DurableAgent({
    model: gateway(resolveModelId()),
    instructions: WEB_AGENT_INSTRUCTIONS,
    tools,
  });

  await agent.stream({
    messages: await convertToModelMessages(
      injectUserMessageContextForModel(messages),
      {
        convertDataPart: (part) =>
          webChatBubbleDataPartToTextPart(part) ??
          webChatReactionDataPartToTextPart(part),
      },
    ),
    writable,
    maxSteps: 28,
  });
}
