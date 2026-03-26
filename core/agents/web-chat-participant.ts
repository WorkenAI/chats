/**
 * Stable browser identity for web chat reactions (client-only storage).
 * Server echoes these fields from POST /api/chat/reaction.
 */

export type WebChatParticipant = {
  userId: string;
  displayName: string;
  avatarUrl: string;
};

const STORAGE_KEY = "chat:web-participant:v1";

export function defaultAvatarUrlForUserId(userId: string): string {
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(userId)}`;
}

function createParticipant(userId: string): WebChatParticipant {
  return {
    userId,
    displayName: "You",
    avatarUrl: defaultAvatarUrlForUserId(userId),
  };
}

/**
 * Returns persisted participant in the browser; creates and stores one on first use.
 * On the server / SSR, returns a deterministic placeholder (not persisted).
 */
export function getWebChatParticipant(): WebChatParticipant {
  if (typeof window === "undefined") {
    return createParticipant("ssr-placeholder");
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<WebChatParticipant>;
      if (typeof p.userId === "string" && p.userId.length > 0) {
        return {
          userId: p.userId,
          displayName:
            typeof p.displayName === "string" && p.displayName.trim()
              ? p.displayName.trim()
              : "You",
          avatarUrl:
            typeof p.avatarUrl === "string" && p.avatarUrl.trim()
              ? p.avatarUrl.trim()
              : defaultAvatarUrlForUserId(p.userId),
        };
      }
    }
  } catch {
    /* ignore */
  }
  const fresh = createParticipant(crypto.randomUUID());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    /* ignore */
  }
  return fresh;
}
