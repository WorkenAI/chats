/** Metadata stored next to `.bin` on disk. */
export type AgentStoredFileMeta = {
  mediaType: string;
  filename: string;
};

/** Path segment the browser can fetch (same-origin). */
export const AGENT_FILE_API_PREFIX = "/api/chat/agent-files";
