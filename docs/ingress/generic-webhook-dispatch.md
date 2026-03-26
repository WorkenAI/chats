# Generic webhook and outbound dispatch

If every channel change touches a dedicated route **and** connector code, the design is still **connector-shaped**. Target shape:

- **1** generic inbound route  
- **1** generic outbound dispatcher  
- **N** connector drivers  
- Shared platform pipeline around drivers  

Not **N** inbound routes × **N** send handlers × **N** copy-paste edits.

## Inbound route

Example: `POST /api/integrations/webhook/:installationId` or `POST /api/integrations/:installationId/inbound`.

The route only:

1. Loads **installation** from DB  
2. Reads `connectorKind`  
3. Gets driver from **registry**  
4. Optional `verifyWebhook`, then `normalize`  
5. Passes normalized events to shared **`ingestInboundEvent`** (or equivalent)  

The route does **not** branch on Telegram vs WhatsApp vs email.

### Capability-shaped driver (inbound)

```ts
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
```

Prefer **optional capabilities** (`inbound?`, `outbound?`, …) so new features do not break every driver.

## Outbound dispatcher

Not `sendTelegramMessage`, `sendWhatsappMessage`, … scattered everywhere.

```ts
await outbound.dispatch({
  installationId,
  conversationId,
  message: {
    kind: "text",
    text: "Your order is on the way",
  },
});
```

Dispatcher: resolve installation → driver → `driver.outbound.send(...)`.

```ts
type ConnectorDriver = {
  kind: string;
  normalizeInbound: (...) => Promise<InboundEvent[]>;
  send: (input: {
    config: ConnectorConfig;
    target: ChannelTarget;
    payload: OutboundPayload;
  }) => Promise<SendResult>;
};
```

(Real code may nest `inbound` / `outbound` objects — see [connector-archetypes.md](../architecture/connector-archetypes.md).)

## Folder shape

Prefer:

```
core/connectors/registry.ts
core/inbound/ingest.ts
core/outbound/dispatch.ts
drivers/telegram.ts
drivers/whatsapp.ts
```

Avoid:

```
connectors/telegram/webhook.ts
connectors/telegram/send.ts
connectors/whatsapp/webhook.ts
...
```

One file per driver unless the integration is unusually large.

## Platform middleware

Cross-cutting concerns belong **around** the driver, not copy-pasted inside each one:

- Idempotency, logging, tracing  
- Rate limits, retries, audit  
- Feature flags, policy, metrics, DLQ  

```ts
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
```

## Example: one inbound route

```ts
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
```

## Example: dispatcher

```ts
// core/outbound/dispatch.ts

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
```

Workflows call a **generic** `sendMessageStep({ installationId, target, text })`, not Telegram-specific steps.

## Change types

1. **Platform-wide** (e.g. audit trail) → one change in inbound/outbound pipeline.  
2. **New channel** → one new driver.  
3. **New optional capability** → extend contract; old drivers unchanged.  

## Principle

**Platform pipeline wraps the driver** — platform code is not duplicated into every connector. A connector is a **driver** (capability contract), not a mini-app with its own routing surface.
