import type { ConnectorDriver } from "@/core/connectors/types";

/**
 * Browser channel: user messages hit POST /api/chat; assistant bubbles are delivered
 * via the workflow UI stream (`data-chat-bubble`), not `outbound.send`.
 */
export const webDriver = {
  kind: "web",
} as const satisfies ConnectorDriver;
