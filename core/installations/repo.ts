import type { Installation } from "@/core/connectors/types";

/**
 * Replace with DB (Prisma, Drizzle, etc.). Seeded demo row for local / webhook tests.
 */
const byId = new Map<string, Installation>([
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
