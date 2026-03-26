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
import { CHANNEL_AGENT_INSTRUCTIONS } from "@/core/agents/channel-instructions";

const WEB_AGENT_INSTRUCTIONS = `${CHANNEL_AGENT_INSTRUCTIONS} You are in a web chat in the browser; the same human texting rules apply.`;

function resolveModelId(): string {
  return process.env.AGENT_MODEL?.trim() || "openai/gpt-4o-mini";
}

/**
 * Single-turn web chat: same durable agent as Telegram (Gateway, typing_pause, multi-bubble),
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
      }),
      execute: async ({ text }, { toolCallId }) => {
        "use step";
        const w = getWritable<UIMessageChunk>();
        const writer = w.getWriter();
        const chunk: UIMessageChunk = {
          type: "data-chat-bubble",
          id: `${toolCallId}-${crypto.randomUUID()}`,
          data: { text },
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
    messages: await convertToModelMessages(messages),
    writable,
    maxSteps: 28,
  });
}
