import { DurableAgent } from "@workflow/ai/agent";
import { gateway } from "@workflow/ai/gateway";
import { convertToModelMessages, tool, type UIMessage, type UIMessageChunk } from "ai";
import { getWritable, sleep } from "workflow";
import { z } from "zod";
import { CHANNEL_AGENT_INSTRUCTIONS } from "@/core/agents/channel-instructions";
import { injectUserMessageContextForModel } from "@/core/agents/inject-user-message-context";
import { appendAssistantBubble } from "@/core/conversations/store";
import { optionalReplyToMessageIdSchema } from "@/core/agents/tool-schemas";
import { dispatchOutbound } from "@/core/outbound/dispatch";

export type ChannelAgentTurnInput = {
  installationId: string;
  externalChatId: string;
  /** Recent history including the latest user turn (max ~30). */
  messages: UIMessage[];
};

/** Gateway model id: `provider/model` (see Vercel AI Gateway model list). */
function resolveModelId(): string {
  return process.env.AGENT_MODEL?.trim() || "openai/gpt-4o-mini";
}

export async function runChannelAgentTurn(input: ChannelAgentTurnInput) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();
  const { installationId, externalChatId } = input;

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
          "Optional id to thread this bubble (from [Conversation context] on the user message). Use exact values only.",
        ),
      }),
      execute: async ({ text, replyToMessageId }) => {
        "use step";
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
        return { ok: true as const };
      },
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
      execute: async ({ externalMessageId, emoji }) => {
        "use step";
        await dispatchOutbound({
          installationId,
          target: { externalChatId },
          payload: {
            kind: "reaction",
            externalMessageId,
            emoji,
          },
        });
        return { ok: true as const };
      },
    }),
  };

  const agent = new DurableAgent({
    model: gateway(resolveModelId()),
    instructions: CHANNEL_AGENT_INSTRUCTIONS,
    tools,
  });

  await agent.stream({
    messages: await convertToModelMessages(
      injectUserMessageContextForModel(input.messages),
    ),
    writable,
    maxSteps: 28,
  });
}
