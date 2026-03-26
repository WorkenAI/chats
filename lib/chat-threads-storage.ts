import type { AppWebUIMessage } from "@/core/agents/web-chat-ui-types";
import { WEB_CHAT_INSTALLATION_ID } from "@/lib/web-chat-installation";

const STORAGE_KEY_V2 = "chat:workspace-threads:v2";
const STORAGE_KEY_V1 = "chat:workspace-threads:v1";

export type ThreadRow = {
  id: string;
  title: string;
  previewAvatarUrl?: string;
};

export type PersistedChatWorkspace = {
  version: 2;
  /** Channel installation for this workspace (`Thread.external.installationId` for web UI). */
  webInstallationId: string;
  activeId: string;
  threads: ThreadRow[];
  threadMessages: Record<string, AppWebUIMessage[]>;
};

function isThreadRow(x: unknown): x is ThreadRow {
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

function parseThreadMessages(o: Record<string, unknown>): Record<
  string,
  AppWebUIMessage[]
> | null {
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
  return threadMessages;
}

function parseV2Payload(data: unknown): PersistedChatWorkspace | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const o = data as Record<string, unknown>;
  if (o.version !== 2) {
    return null;
  }
  if (typeof o.webInstallationId !== "string" || !o.webInstallationId.trim()) {
    return null;
  }
  if (typeof o.activeId !== "string" || o.activeId.length === 0) {
    return null;
  }
  if (!Array.isArray(o.threads) || !o.threads.every(isThreadRow)) {
    return null;
  }
  const threadMessages = parseThreadMessages(o);
  if (!threadMessages) {
    return null;
  }
  const threads = o.threads as ThreadRow[];
  if (!threads.some((t) => t.id === o.activeId)) {
    return null;
  }
  return {
    version: 2,
    webInstallationId: o.webInstallationId.trim(),
    activeId: o.activeId,
    threads,
    threadMessages,
  };
}

function parseV1Payload(data: unknown): PersistedChatWorkspace | null {
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
  if (!Array.isArray(o.threads) || !o.threads.every(isThreadRow)) {
    return null;
  }
  const threadMessages = parseThreadMessages(o);
  if (!threadMessages) {
    return null;
  }
  const threads = o.threads as ThreadRow[];
  if (!threads.some((t) => t.id === o.activeId)) {
    return null;
  }
  return {
    version: 2,
    webInstallationId: WEB_CHAT_INSTALLATION_ID,
    activeId: o.activeId,
    threads,
    threadMessages,
  };
}

export function loadPersistedChatWorkspace(): PersistedChatWorkspace | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2?.trim()) {
      const parsed = parseV2Payload(JSON.parse(rawV2) as unknown);
      if (parsed) {
        return parsed;
      }
    }
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1?.trim()) {
      const migrated = parseV1Payload(JSON.parse(rawV1) as unknown);
      if (migrated) {
        savePersistedChatWorkspace(migrated);
        return migrated;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function savePersistedChatWorkspace(snapshot: PersistedChatWorkspace): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(snapshot));
  } catch (e) {
    console.warn("[chat-threads-storage] persist failed", e);
  }
}
