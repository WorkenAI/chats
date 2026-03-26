import type {
  AppWebUIMessage,
  WebChatUserReaction,
} from "@/core/agents/web-chat-ui-types";
import { isWebChatBubblePart } from "@/core/agents/web-chat-ui-types";
import type { WebChatParticipant } from "@/core/agents/web-chat-participant";
import { defaultAvatarUrlForUserId } from "@/core/agents/web-chat-participant";

const LEGACY_USER_ID = "local";

/** Migrate legacy `string[]` or partial objects to `WebChatUserReaction[]`. */
export function normalizeUserReactions(raw: unknown): WebChatUserReaction[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  if (raw.every((x) => typeof x === "string")) {
    const uid = LEGACY_USER_ID;
    return (raw as string[]).map((emoji) => ({
      emoji,
      userId: uid,
      displayName: "You",
      avatarUrl: defaultAvatarUrlForUserId(uid),
    }));
  }
  const out: WebChatUserReaction[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || x === null) {
      continue;
    }
    const o = x as Record<string, unknown>;
    if (typeof o.emoji !== "string" || typeof o.userId !== "string") {
      continue;
    }
    out.push({
      emoji: o.emoji,
      userId: o.userId,
      displayName:
        typeof o.displayName === "string" ? o.displayName : undefined,
      avatarUrl:
        typeof o.avatarUrl === "string" ? o.avatarUrl : undefined,
    });
  }
  return out;
}

export function userHasReaction(
  reactions: WebChatUserReaction[],
  userId: string,
  emoji: string,
): boolean {
  return reactions.some((r) => r.userId === userId && r.emoji === emoji);
}

export function userWillRemoveReaction(
  messages: AppWebUIMessage[],
  bubbleId: string,
  userId: string,
  emoji: string,
): boolean {
  for (const m of messages) {
    if (m.role !== "assistant") {
      continue;
    }
    for (const p of m.parts) {
      if (!isWebChatBubblePart(p) || p.id !== bubbleId) {
        continue;
      }
      return userHasReaction(
        normalizeUserReactions(p.data.userReactions),
        userId,
        emoji,
      );
    }
  }
  return false;
}

export function toggleUserReactionOnBubble(
  messages: AppWebUIMessage[],
  bubbleId: string,
  emoji: string,
  participant: WebChatParticipant,
): AppWebUIMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant") {
      return m;
    }
    return {
      ...m,
      parts: m.parts.map((p) => {
        if (!isWebChatBubblePart(p) || p.id !== bubbleId) {
          return p;
        }
        const cur = normalizeUserReactions(p.data.userReactions);
        const has = userHasReaction(cur, participant.userId, emoji);
        const next = has
          ? cur.filter(
              (r) =>
                !(r.userId === participant.userId && r.emoji === emoji),
            )
          : [
              ...cur,
              {
                emoji,
                userId: participant.userId,
                displayName: participant.displayName,
                avatarUrl: participant.avatarUrl,
              },
            ];
        const { userReactions: _drop, ...restData } = p.data;
        return {
          ...p,
          data:
            next.length > 0
              ? { ...restData, userReactions: next }
              : { ...restData },
        };
      }),
    };
  });
}

/** Latest reaction avatar in thread order (for sidebar preview). */
export function inferThreadPreviewAvatarFromMessages(
  messages: AppWebUIMessage[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "assistant") {
      continue;
    }
    for (const p of m.parts) {
      if (!isWebChatBubblePart(p)) {
        continue;
      }
      const rx = normalizeUserReactions(p.data.userReactions);
      if (rx.length === 0) {
        continue;
      }
      const last = rx[rx.length - 1]!;
      return (
        last.avatarUrl?.trim() ||
        defaultAvatarUrlForUserId(last.userId)
      );
    }
  }
  return undefined;
}
