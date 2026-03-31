import { z } from "zod";

/**
 * Planner output: routing and side effects (reactions, targeting). No user-visible copy here.
 */
export const messengerPlannerOutputSchema = z.object({
  action: z
    .enum(["ignore", "reply", "follow_up", "react_only"])
    .describe(
      "ignore = no assistant text; reply = one main bubble (may split lightly); follow_up = 2–4 short bubbles; react_only = optional reaction only.",
    ),
  reaction: z
    .object({
      externalMessageId: z
        .string()
        .min(1)
        .describe("User message id from [Conversation context]."),
      emoji: z
        .string()
        .describe("One emoji, or empty string to remove your reaction."),
    })
    .optional()
    .describe("Optional reaction on a user message."),
  replyTargeting: z
    .enum(["latest_only", "address_each", "single_threaded_reply"])
    .optional()
    .describe(
      "How to relate to multiple recent user lines: latest_only, address_each, or one threaded reply.",
    ),
});

export type MessengerPlannerOutput = z.infer<typeof messengerPlannerOutputSchema>;
