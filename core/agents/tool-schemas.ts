import { z } from "zod";

/**
 * LLMs often emit `null` for omitted optional JSON fields; `z.string().optional()` rejects `null` in Zod 4.
 */
export const optionalReplyToMessageIdSchema = z.preprocess(
  (v) => (v === null || v === "" ? undefined : v),
  z.string().min(1).optional(),
);

const webChatBubbleAttachmentSchema = z.object({
  url: z.string().min(1).describe("Client-fetchable URL (https: or data:)."),
  filename: z.string().optional().describe("Label shown in the UI."),
  mediaType: z
    .string()
    .min(1)
    .describe("IANA media type for the bytes at url."),
});

/** Shared by web + channel `send_chat_message` tools. */
export const sendChatMessageToolInputSchema = z
  .object({
    text: z
      .string()
      .max(4096)
      .describe(
        "Bubble text. May be empty when attachments carry the message.",
      ),
    replyToMessageId: optionalReplyToMessageIdSchema.describe(
      "Threading id from [Conversation context] (user message id, assistant bubble id, or provider id). Omit when not replying in-thread.",
    ),
    attachments: z
      .array(webChatBubbleAttachmentSchema)
      .max(8)
      .optional()
      .describe(
        "Optional file parts (url + mediaType + optional filename per item).",
      ),
  })
  .refine(
    (v) => v.text.trim().length > 0 || (v.attachments?.length ?? 0) > 0,
    {
      message: "Provide non-empty text and/or at least one attachment.",
      path: ["text"],
    },
  );
