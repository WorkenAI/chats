import type { WebChatParticipant } from "@/core/agents/web-chat-participant";

export async function postWebChatReaction(input: {
  threadId: string;
  bubbleId: string;
  emoji: string;
  remove: boolean;
  participant: WebChatParticipant;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/chat/reaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return res.ok;
  } catch {
    return false;
  }
}
