# Connector driver examples

Reference implementations: one driver module per integration; register in a single bootstrap.

## Telegram (ChannelDriver)

```ts
// drivers/telegram.ts

import type { ChannelDriver } from "../core/integrations/channel";

type TelegramConfig = {
  botToken: string;
};

export const telegramDriver: ChannelDriver<TelegramConfig> = {
  archetype: "channel",
  kind: "telegram",

  inbound: {
    async normalize({ rawBody, scope }) {
      const update = JSON.parse(rawBody);
      const msg = update.message;
      if (!msg?.text) return [];

      return [
        {
          type: "message.created",
          raw: update,
          occurredAt: new Date(msg.date * 1000).toISOString(),
          externalEventId: String(update.update_id),
          externalMessageId: String(msg.message_id),
          conversation: {
            externalChatId: String(msg.chat.id),
          },
          actor: {
            externalUserId: String(msg.from?.id ?? "unknown"),
            displayName: msg.from?.username ?? msg.from?.first_name,
            role: "customer",
          },
          text: msg.text,
        },
      ];
    },
  },

  outbound: {
    async sendMessage({ config, target, message }) {
      if (message.kind !== "text") {
        throw new Error("Telegram driver supports only text for now");
      }

      const res = await fetch(
        `https://api.telegram.org/bot${config.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: target.conversation.externalChatId,
            text: message.text,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Telegram send failed: ${res.status}`);
      }

      const body = await res.json();
      return {
        externalMessageId: String(body.result?.message_id ?? ""),
      };
    },
  },
};
```

## CRM (ResourceConnector)

```ts
// drivers/hubspot-like-crm.ts

import type { ResourceConnector } from "../core/integrations/resource";

type CrmConfig = {
  accessToken: string;
  baseUrl: string;
};

export const crmConnector: ResourceConnector<CrmConfig> = {
  archetype: "resource",
  kind: "generic-crm",

  resources: {
    order: {
      async search({ config, query, limit = 10 }) {
        const res = await fetch(`${config.baseUrl}/orders/search`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ query, limit }),
        });

        if (!res.ok) throw new Error(`CRM order search failed: ${res.status}`);
        const body = await res.json();

        return (body.items ?? []).map((x: any) => ({
          id: String(x.id),
          fields: {
            number: x.number,
            status: x.status,
            customerName: x.customerName,
          },
          raw: x,
        }));
      },
    },

    ticket: {
      async create({ config, fields }) {
        const res = await fetch(`${config.baseUrl}/tickets`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(fields),
        });

        if (!res.ok) throw new Error(`CRM ticket create failed: ${res.status}`);
        const body = await res.json();

        return {
          id: String(body.id),
          fields: body,
          raw: body,
        };
      },
    },
  },
};
```

## ATS (ResourceConnector)

```ts
// drivers/ats.ts

import type { ResourceConnector } from "../core/integrations/resource";

type AtsConfig = {
  token: string;
  baseUrl: string;
};

export const atsConnector: ResourceConnector<AtsConfig> = {
  archetype: "resource",
  kind: "generic-ats",

  resources: {
    candidate: {
      async search({ config, query, filters, limit = 20 }) {
        const res = await fetch(`${config.baseUrl}/candidates/search`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            query,
            vacancyId: filters?.vacancyId,
            limit,
          }),
        });

        if (!res.ok) throw new Error(`ATS candidate search failed: ${res.status}`);
        const body = await res.json();

        return (body.items ?? []).map((x: any) => ({
          id: String(x.id),
          fields: {
            name: x.name,
            email: x.email,
            score: x.score,
          },
          raw: x,
        }));
      },
    },
  },
};
```

## S3 (FileConnector)

```ts
// drivers/s3.ts

import type { FileConnector } from "../core/integrations/file";

type S3Config = {
  bucket: string;
};

export const s3Connector: FileConnector<S3Config> = {
  archetype: "file",
  kind: "s3",

  files: {
    async put({ config, name, mimeType, bytes }) {
      const fileId = `s3://${config.bucket}/${name}`;
      // Real upload would go here
      void mimeType;
      void bytes;

      return {
        id: fileId,
        name,
        mimeType,
      };
    },

    async get({ fileId }) {
      return {
        file: {
          id: fileId,
          name: fileId.split("/").pop() ?? "file",
        },
        bytes: new Uint8Array(),
      };
    },
  },
};
```

## OCR (ServiceConnector)

```ts
// drivers/ocr.ts

import type { ServiceConnector } from "../core/integrations/service";

type OcrConfig = {
  endpoint: string;
  apiKey: string;
};

export const ocrConnector: ServiceConnector<OcrConfig> = {
  archetype: "service",
  kind: "ocr-service",

  procedures: {
    extractText: {
      async invoke({ config, payload }) {
        const res = await fetch(`${config.endpoint}/extract-text`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`OCR failed: ${res.status}`);
        return await res.json();
      },
    },
  },
};
```

## Registry bootstrap

```ts
// app/bootstrap/connectors.ts

import { ConnectorRegistry } from "../core/integrations/registry";
import { telegramDriver } from "../drivers/telegram";
import { crmConnector } from "../drivers/hubspot-like-crm";
import { atsConnector } from "../drivers/ats";
import { s3Connector } from "../drivers/s3";
import { ocrConnector } from "../drivers/ocr";

export const registry = new ConnectorRegistry();

registry.register(telegramDriver);
registry.register(crmConnector);
registry.register(atsConnector);
registry.register(s3Connector);
registry.register(ocrConnector);
```
