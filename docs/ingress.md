Да. И это значит, что предыдущая схема всё ещё была слишком connector-shaped.

Если при любом изменении нужно трогать route + connector для каждого канала, то архитектура уже проиграла.

Правильная цель такая:

1 generic inbound route
1 generic outbound dispatcher
N connector drivers

А не:

N inbound routes
N outbound handlers
N*N мест для изменений

Как должно быть на самом деле

Не 2 x 300 файлов, а:
	•	один общий webhook endpoint
	•	один общий sender service
	•	один driver на коннектор
	•	общий platform pipeline вокруг driver

То есть добавление новой общей логики не должно требовать менять 300 коннекторов.

⸻

Правильная форма

1. Один общий inbound route

Например:

POST /api/integrations/webhook/:installationId

или

POST /api/integrations/:installationId/inbound

Route делает только это:
	1.	находит installation в БД
	2.	понимает connectorKind
	3.	берёт нужный driver из registry
	4.	вызывает verify + normalize
	5.	передаёт результат в общий ingestInboundEvent()

То есть route вообще не знает, Telegram это, WhatsApp или email.

type ConnectorDriver = {
  kind: string;

  verifyWebhook?: (input: {
    headers: Headers;
    rawBody: string;
    config: ConnectorConfig;
  }) => Promise<void>;

  normalizeInbound: (input: {
    headers: Headers;
    rawBody: string;
    config: ConnectorConfig;
  }) => Promise<InboundEvent[]>;
};


⸻

2. Один общий outbound dispatcher

Не sendTelegramMessage, sendWhatsappMessage, sendInstagramMessage по всему коду.

А так:

await outbound.dispatch({
  installationId,
  conversationId,
  message: {
    kind: "text",
    text: "Ваш заказ уже в пути",
  },
});

И уже dispatcher сам:
	1.	находит installation
	2.	находит driver
	3.	вызывает driver.send(...)

type ConnectorDriver = {
  kind: string;
  normalizeInbound: (...) => Promise<InboundEvent[]>;
  send: (input: {
    config: ConnectorConfig;
    target: ChannelTarget;
    payload: OutboundPayload;
  }) => Promise<SendResult>;
};


⸻

Тогда структура становится такой

src/
  core/
    connectors/
      registry.ts
      types.ts
    inbound/
      ingest.ts
      dedupe.ts
    outbound/
      dispatch.ts
    conversations/
      resolver.ts
    workflow/
      sales.workflow.ts

  drivers/
    telegram.ts
    whatsapp.ts
    instagram.ts
    email.ts

То есть не:

connectors/telegram/webhook.ts
connectors/telegram/send.ts
connectors/whatsapp/webhook.ts
connectors/whatsapp/send.ts
...

а один файл на драйвер, максимум маленькая папка, если интеграция реально сложная.

⸻

Самое важное: общая логика должна жить вокруг driver, а не внутри него

Например, ты хочешь добавить:
	•	идемпотентность
	•	логирование
	•	tracing
	•	rate limiting
	•	retries
	•	audit
	•	feature flags
	•	policy checks
	•	metrics
	•	dead letter queue

Если архитектура правильная, это всё добавляется в одном месте:

export async function ingestViaDriver(ctx: {
  installation: Installation;
  headers: Headers;
  rawBody: string;
}) {
  const driver = registry.get(ctx.installation.connectorKind);

  await withTracing(ctx.installation, async () => {
    await withRateLimit(ctx.installation, async () => {
      await verifyIfNeeded(driver, ctx);
      const events = await driver.normalizeInbound(ctx);

      for (const event of events) {
        await ingestInboundEvent(event);
      }
    });
  });
}

Вот это platform-shaped архитектура.

⸻

А если завтра нужно “что-то добавить в коннекторный API”?

Тогда нельзя делать жёсткий интерфейс, который ломает все 300 драйверов.

Нужен capability-based contract.

Плохо:

type ConnectorDriver = {
  normalizeInbound: ...
  send: ...
  parseCallback: ...
  verifyWebhook: ...
  refreshToken: ...
  resolveThread: ...
  uploadFile: ...
  sendTyping: ...
}

Потому что любое новое поле ломает всех.

Нормально:

type ConnectorDriver = {
  kind: string;
  inbound?: InboundCapability;
  outbound?: OutboundCapability;
  media?: MediaCapability;
  oauth?: OAuthCapability;
  callbacks?: CallbackCapability;
};

Тогда новый feature не требует менять старые драйверы.

⸻

Пример registry

// core/connectors/registry.ts
import { telegramDriver } from "@/drivers/telegram";
import { whatsappDriver } from "@/drivers/whatsapp";
import { instagramDriver } from "@/drivers/instagram";

const drivers = new Map([
  [telegramDriver.kind, telegramDriver],
  [whatsappDriver.kind, whatsappDriver],
  [instagramDriver.kind, instagramDriver],
]);

export function getConnectorDriver(kind: string) {
  const driver = drivers.get(kind);
  if (!driver) {
    throw new Error(`Unknown connector kind: ${kind}`);
  }
  return driver;
}


⸻

Один inbound route

// app/api/integrations/[installationId]/webhook/route.ts
import { getInstallationById } from "@/core/installations/repo";
import { getConnectorDriver } from "@/core/connectors/registry";
import { ingestInboundEvent } from "@/core/inbound/ingest";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ installationId: string }> }
) {
  const { installationId } = await ctx.params;
  const installation = await getInstallationById(installationId);
  if (!installation) return new Response("not found", { status: 404 });

  const rawBody = await request.text();
  const driver = getConnectorDriver(installation.connectorKind);

  if (!driver.inbound) {
    return new Response("connector has no inbound support", { status: 400 });
  }

  if (driver.inbound.verifyWebhook) {
    await driver.inbound.verifyWebhook({
      headers: request.headers,
      rawBody,
      config: installation.config,
    });
  }

  const events = await driver.inbound.normalize({
    headers: request.headers,
    rawBody,
    config: installation.config,
    installation,
  });

  for (const event of events) {
    await ingestInboundEvent(event);
  }

  return new Response("ok");
}

Вот. Один route на все 300 каналов.

⸻

Один outbound dispatcher

// core/outbound/dispatch.ts
import { getInstallationById } from "@/core/installations/repo";
import { getConnectorDriver } from "@/core/connectors/registry";

export async function dispatchOutbound(input: {
  installationId: string;
  target: ChannelTarget;
  payload: OutboundPayload;
}) {
  const installation = await getInstallationById(input.installationId);
  if (!installation) throw new Error("Installation not found");

  const driver = getConnectorDriver(installation.connectorKind);
  if (!driver.outbound) {
    throw new Error(`Connector ${installation.connectorKind} has no outbound`);
  }

  return driver.outbound.send({
    config: installation.config,
    installation,
    target: input.target,
    payload: input.payload,
  });
}

И workflow уже вызывает не Telegram-specific step, а общий step:

await sendMessageStep({
  installationId,
  target,
  text: "Ваш заказ уже в пути",
});


⸻

А драйвер Telegram тогда выглядит просто

// drivers/telegram.ts
export const telegramDriver = {
  kind: "telegram",

  inbound: {
    async verifyWebhook({ headers, rawBody, config }) {
      // optional
    },

    async normalize({ rawBody, installation }) {
      const update = JSON.parse(rawBody);

      const msg = update.message;
      if (!msg?.text) return [];

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
            role: "customer",
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

      const res = await fetch(
        `https://api.telegram.org/bot${config.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: target.externalChatId,
            text: payload.text,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Telegram send failed: ${res.status}`);
      }

      return { ok: true };
    },
  },
} as const;


⸻

Что это даёт

Теперь изменения бывают 3 типов.

1. Общеплатформенное изменение

Например, добавить audit trail.

Меняется одно место: inbound/outbound pipeline.

2. Новый канал

Добавляется один driver.

3. Новый optional feature

Добавляется новая capability, старые драйверы не ломаются.

⸻

Главный принцип

Не должно быть:

platform code copied into each connector

Должно быть:

platform pipeline wraps connector driver

Это и есть правильная граница.

⸻

Ещё жёстче скажу

Для 300+ коннекторов route вообще не должен существовать на уровне коннектора.

Коннектор — это не mini-app.
Коннектор — это драйвер, как драйвер устройства в ОС.

У драйвера нет своего роутинга приложения.
У него есть capability contract.

⸻

Итог

Да, ты прав: если архитектура заставляет менять 600 файлов при эволюции платформы, значит это не платформа, а копипастный зоопарк адаптеров.

Правильный базис для тебя:

1 generic inbound route
1 generic outbound dispatcher
1 registry
1 driver per connector
capability-based interface
platform middleware around drivers
