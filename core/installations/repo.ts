import type { Installation } from "@/core/connectors/types";
import { WEB_CHAT_INSTALLATION_ID } from "@/lib/web-chat-installation";

/**
 * Replace with DB (Prisma, Drizzle, etc.). Seeded demo row for local / webhook tests.
 */
const byId = new Map<string, Installation>([
  [
    WEB_CHAT_INSTALLATION_ID,
    {
      id: WEB_CHAT_INSTALLATION_ID,
      workspaceId: "ws-demo",
      connectorKind: "web",
      config: {},
    },
  ],
  [
    "demo-telegram",
    {
      id: "demo-telegram",
      workspaceId: "ws-demo",
      connectorKind: "telegram",
      config: {
        botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
      },
    },
  ],
]);

export async function getInstallationById(
  id: string,
): Promise<Installation | null> {
  return byId.get(id) ?? null;
}
