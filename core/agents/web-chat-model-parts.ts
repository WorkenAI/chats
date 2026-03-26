import type { DataUIPart, TextPart } from "ai";

/**
 * Turns streamed assistant bubbles into model-visible text so the LLM sees stable bubble ids
 * for threading (convertToModelMessages ignores data parts unless converted).
 */
export function webChatBubbleDataPartToTextPart(
  part: DataUIPart<Record<string, unknown>> | unknown,
): TextPart | undefined {
  if (
    typeof part !== "object" ||
    part === null ||
    (part as DataUIPart<Record<string, unknown>>).type !== "data-chat-bubble"
  ) {
    return undefined;
  }
  const p = part as DataUIPart<Record<string, unknown>>;
  const d = p.data as {
    text?: unknown;
    replyToMessageId?: unknown;
    userReactions?: unknown;
  };
  if (typeof d.text !== "string") {
    return undefined;
  }
  const bubbleId =
    typeof p.id === "string" && p.id.length > 0 ? p.id : "pending";
  const threadsTo =
    typeof d.replyToMessageId === "string" && d.replyToMessageId.length > 0
      ? ` threadsToBubbleOrMessageId=${d.replyToMessageId}`
      : "";
  const reactionEmojis: string[] = Array.isArray(d.userReactions)
    ? d.userReactions.flatMap((x) => {
        if (typeof x === "string") {
          return [x];
        }
        if (
          typeof x === "object" &&
          x !== null &&
          typeof (x as { emoji?: unknown }).emoji === "string"
        ) {
          return [(x as { emoji: string }).emoji];
        }
        return [];
      })
    : [];
  const userReactions =
    reactionEmojis.length > 0
      ? ` userReactions=${reactionEmojis.join(",")}`
      : "";
  return {
    type: "text",
    text: `[Assistant bubble id=${bubbleId}${threadsTo}${userReactions}] ${d.text}`,
  };
}

export function webChatReactionDataPartToTextPart(
  part: unknown,
): TextPart | undefined {
  if (
    typeof part !== "object" ||
    part === null ||
    (part as { type?: string }).type !== "data-chat-reaction"
  ) {
    return undefined;
  }
  const p = part as {
    data?: { targetUserMessageId?: unknown; emoji?: unknown };
  };
  const uid = p.data?.targetUserMessageId;
  const emoji = p.data?.emoji;
  if (typeof uid !== "string" || typeof emoji !== "string") {
    return undefined;
  }
  return {
    type: "text",
    text: `[Agent reaction emoji=${emoji} onUserMessageId=${uid}]`,
  };
}
