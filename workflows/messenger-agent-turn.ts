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
import { expandFilePartsForAiGateway } from "@/core/agents/web-chat-file-parts-for-model";
import { injectUserMessageContextForModel } from "@/core/agents/inject-user-message-context";
import { sendChatMessageToolInputSchema } from "@/core/agents/tool-schemas";
import type { WebChatBubbleFileAttachment } from "@/core/agents/web-chat-ui-types";
import {
  webChatBubbleDataPartToTextPart,
  webChatReactionDataPartToTextPart,
} from "@/core/agents/web-chat-model-parts";
import { appendAssistantBubble } from "@/core/conversations/store";
import {
  createSpreadsheetFileInputSchema,
  type CreateSpreadsheetFileInput,
} from "@/core/files/spreadsheet-schema";
import { dispatchOutbound } from "@/core/outbound/dispatch";

const WEB_UI_INSTRUCTIONS = `${MESSENGER_AGENT_BASE_INSTRUCTIONS} Web chat: user lines start with [User message id=…]; assistant history uses [Assistant bubble id=…]. Use those exact strings for send_chat_message.replyToMessageId only when threading; omit otherwise. Never invent ids. User file uploads appear as plain text blocks [User attached file: …] or [User attached spreadsheet: …] — read and use that content. set_message_reaction: target id from [Conversation context], one Unicode emoji (empty string removes your reaction).`;

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
  attachments?: WebChatBubbleFileAttachment[];
  toolCallId: string;
}): Promise<{ ok: true }> {
  "use step";
  const {
    streamUiBubbles,
    installationId,
    externalChatId,
    text,
    replyToMessageId,
    attachments,
    toolCallId,
  } = params;
  if (streamUiBubbles) {
    const w = getWritable<UIMessageChunk>();
    const writer = w.getWriter();
    const bubbleData: {
      text: string;
      replyToMessageId?: string;
      fileAttachments?: WebChatBubbleFileAttachment[];
    } = { text };
    if (replyToMessageId != null) {
      bubbleData.replyToMessageId = replyToMessageId;
    }
    if (attachments != null && attachments.length > 0) {
      bubbleData.fileAttachments = attachments;
    }
    const chunk: UIMessageChunk = {
      type: "data-chat-bubble",
      id: toolCallId + "-" + crypto.randomUUID(),
      data: bubbleData,
    };
    await writer.write(chunk);
    writer.releaseLock();
  } else {
    let outboundText = text.trim();
    if (attachments != null && attachments.length > 0) {
      const lines = attachments.map((a) => {
        const label = a.filename?.trim() || "file";
        return `${label}: ${a.url}`;
      });
      outboundText =
        outboundText.length > 0
          ? `${outboundText}\n\n${lines.join("\n")}`
          : lines.join("\n");
    }
    await dispatchOutbound({
      installationId,
      target: { externalChatId },
      payload: {
        kind: "text",
        text: outboundText,
        ...(replyToMessageId != null
          ? { replyToExternalMessageId: replyToMessageId }
          : {}),
      },
    });
    appendAssistantBubble(installationId, externalChatId, outboundText);
  }
  return { ok: true as const };
}

async function messengerCreateSpreadsheetFileStep(
  input: CreateSpreadsheetFileInput,
) {
  "use step";
  const { persistSpreadsheetAttachment } = await import(
    "@/core/files/persist-spreadsheet",
  );
  return persistSpreadsheetAttachment(input);
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

function createSpreadsheetFileTool() {
  return tool({
    description: "Build a .xlsx (input schema defines shape).",
    inputSchema: createSpreadsheetFileInputSchema,
    execute: async (input) => messengerCreateSpreadsheetFileStep(input),
  });
}

/** Web channel: bubbles via UI stream (data-chat-bubble chunks). */
export async function runWebMessengerAgentTurn(input: MessengerAgentTurnInput) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();
  const tools = {
    typing_pause: typingPauseTool(),
    create_spreadsheet_file: createSpreadsheetFileTool(),
    send_chat_message: tool({
      description:
        "Send one chat bubble to the user. Call once per bubble; use multiple calls for multiple bubbles.",
      inputSchema: sendChatMessageToolInputSchema,
      execute: async ({ text, replyToMessageId, attachments }, { toolCallId }) =>
        messengerSendChatMessageStep({
          streamUiBubbles: true,
          installationId: input.installationId,
          externalChatId: input.externalChatId,
          text,
          ...(replyToMessageId != null ? { replyToMessageId } : {}),
          ...(attachments != null ? { attachments } : {}),
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

  const baseMessages = await expandFilePartsForAiGateway(
    injectUserMessageContextForModel(input.messages),
  );
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
    create_spreadsheet_file: createSpreadsheetFileTool(),
    send_chat_message: tool({
      description:
        "Send one chat bubble to the user. Call once per bubble; use multiple calls for multiple bubbles.",
      inputSchema: sendChatMessageToolInputSchema,
      execute: async ({ text, replyToMessageId, attachments }, { toolCallId }) =>
        messengerSendChatMessageStep({
          streamUiBubbles: false,
          installationId: input.installationId,
          externalChatId: input.externalChatId,
          text,
          ...(replyToMessageId != null ? { replyToMessageId } : {}),
          ...(attachments != null ? { attachments } : {}),
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

  const baseMessages = await expandFilePartsForAiGateway(
    injectUserMessageContextForModel(input.messages),
  );
  const modelMessages = await convertToModelMessages(baseMessages);

  await agent.stream({
    messages: modelMessages,
    writable,
    maxSteps: 28,
  });
}
