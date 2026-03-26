import type { ConnectorDriver } from "@/core/connectors/types";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number };
    reply_to_message?: { message_id: number };
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
            ...(msg.reply_to_message != null
              ? {
                  replyToExternalMessageId: String(
                    msg.reply_to_message.message_id,
                  ),
                }
              : {}),
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
      const botToken = config.botToken;
      if (typeof botToken !== "string" || !botToken) {
        throw new Error("Missing botToken in connector config");
      }

      if (payload.kind === "reaction") {
        const messageId = Number.parseInt(payload.externalMessageId, 10);
        if (
          !Number.isFinite(messageId) ||
          String(messageId) !== payload.externalMessageId.trim()
        ) {
          throw new Error(
            `Invalid externalMessageId for reaction: expected integer message id, got "${payload.externalMessageId}"`,
          );
        }

        const reaction =
          payload.emoji.trim() === ""
            ? []
            : [{ type: "emoji" as const, emoji: payload.emoji.trim() }];

        const body = {
          chat_id: target.externalChatId,
          message_id: messageId,
          reaction,
        };

        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/setMessageReaction`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );

        if (!res.ok) {
          throw new Error(`Telegram setMessageReaction failed: ${res.status}`);
        }

        return { ok: true };
      }

      const body: Record<string, unknown> = {
        chat_id: target.externalChatId,
        text: payload.text,
      };
      if (payload.replyToExternalMessageId != null) {
        const id = Number.parseInt(payload.replyToExternalMessageId, 10);
        if (
          !Number.isFinite(id) ||
          String(id) !== payload.replyToExternalMessageId.trim()
        ) {
          throw new Error(
            `Invalid replyToExternalMessageId: expected integer message id, got "${payload.replyToExternalMessageId}"`,
          );
        }
        body.reply_to_message_id = id;
      }

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        throw new Error(`Telegram send failed: ${res.status}`);
      }

      return { ok: true };
    },
  },
} as const satisfies ConnectorDriver;
