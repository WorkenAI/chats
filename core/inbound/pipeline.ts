import { getConnectorDriver } from "@/core/connectors/registry";
import type { Installation } from "@/core/connectors/types";
import { enqueueInboundEvents } from "./enqueue";
import { ingestInboundEvent } from "./ingest";

export class WebhookError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "WebhookError";
  }
}

type InboundContext = {
  installation: Installation;
  headers: Headers;
  rawBody: string;
};

/**
 * verify → normalize → enqueue (async) or optional sync ingest for tests.
 */
export async function runInboundPipeline(ctx: InboundContext): Promise<void> {
  const driver = getConnectorDriver(ctx.installation.connectorKind);
  if (!driver.inbound) {
    throw new WebhookError("connector has no inbound support", 400);
  }

  if (driver.inbound.verifyWebhook) {
    await driver.inbound.verifyWebhook({
      headers: ctx.headers,
      rawBody: ctx.rawBody,
      config: ctx.installation.config,
      installation: ctx.installation,
    });
  }

  const events = await driver.inbound.normalize({
    headers: ctx.headers,
    rawBody: ctx.rawBody,
    config: ctx.installation.config,
    installation: ctx.installation,
  });

  if (process.env.INGRESS_SYNC === "1") {
    for (const event of events) {
      await ingestInboundEvent(event);
    }
    return;
  }

  await enqueueInboundEvents(events);
}
