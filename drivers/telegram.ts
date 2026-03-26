import type { ConnectorDriver } from "@/core/connectors/types";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
    };
  };
};

export const telegramDriver = {
  kind: "telegram",

  inbound: {
    async normalize({ rawBody, installation }) {
      let update: TelegramUpdate;
      try {
        update = JSON.parse(rawBody) as TelegramUpdate;
      } catch {
        return [];
      }

      const msg = update.message;
      if (!msg?.text) {
        return [];
      }

      return [
        {
          workspaceId: installation.workspaceId,
          connector: {
            kind: "telegram",
            installationId: installation.id,
          },
          conversation: {
            externalChatId: String(msg.chat.id),
          },
          actor: {
            externalUserId: String(msg.from?.id ?? "unknown"),
            role: "customer" as const,
            displayName: msg.from?.username ?? msg.from?.first_name,
          },
          event: {
            kind: "message.created",
            externalEventId: String(update.update_id),
            externalMessageId: String(msg.message_id),
            occurredAt: new Date(msg.date * 1000).toISOString(),
            text: msg.text,
            raw: update,
          },
        },
      ];
    },
  },

  outbound: {
    async send({ config, target, payload }) {
      if (payload.kind !== "text") {
        throw new Error("Telegram driver currently supports only text");
      }

      const botToken = config.botToken;
      if (typeof botToken !== "string" || !botToken) {
        throw new Error("Missing botToken in connector config");
      }

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: target.externalChatId,
            text: payload.text,
          }),
        },
      );

      if (!res.ok) {
        throw new Error(`Telegram send failed: ${res.status}`);
      }

      return { ok: true };
    },
  },
} as const satisfies ConnectorDriver;
