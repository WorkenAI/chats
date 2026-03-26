import type { AppWebUIMessage } from "@/core/agents/web-chat-ui-types";

const STORAGE_KEY = "chat:workspace-threads:v1";

/** Same shape as `ThreadItem` in the sidebar (kept here so `lib` does not import `app`). */
export type StoredThreadItem = {
  id: string;
  title: string;
  previewAvatarUrl?: string;
};

export type PersistedChatWorkspaceV1 = {
  version: 1;
  activeId: string;
  threads: StoredThreadItem[];
  threadMessages: Record<string, AppWebUIMessage[]>;
};

function isThreadItem(x: unknown): x is StoredThreadItem {
  if (typeof x !== "object" || x === null) {
    return false;
  }
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.length > 0 &&
    typeof o.title === "string" &&
    (o.previewAvatarUrl === undefined || typeof o.previewAvatarUrl === "string")
  );
}

function isMessageArray(x: unknown): x is AppWebUIMessage[] {
  return Array.isArray(x);
}

export function loadPersistedChatWorkspace(): PersistedChatWorkspaceV1 | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) {
      return null;
    }
    const data = JSON.parse(raw) as unknown;
    if (typeof data !== "object" || data === null) {
      return null;
    }
    const o = data as Record<string, unknown>;
    if (o.version !== 1) {
      return null;
    }
    if (typeof o.activeId !== "string" || o.activeId.length === 0) {
      return null;
    }
    if (!Array.isArray(o.threads) || !o.threads.every(isThreadItem)) {
      return null;
    }
    if (typeof o.threadMessages !== "object" || o.threadMessages === null) {
      return null;
    }
    const threadMessages: Record<string, AppWebUIMessage[]> = {};
    for (const [k, v] of Object.entries(o.threadMessages)) {
      if (typeof k !== "string" || !isMessageArray(v)) {
        return null;
      }
      threadMessages[k] = v;
    }
    const threads = o.threads as StoredThreadItem[];
    if (!threads.some((t) => t.id === o.activeId)) {
      return null;
    }
    return {
      version: 1,
      activeId: o.activeId,
      threads,
      threadMessages,
    };
  } catch {
    return null;
  }
}

export function savePersistedChatWorkspace(snapshot: PersistedChatWorkspaceV1): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.warn("[chat-threads-storage] persist failed", e);
  }
}
