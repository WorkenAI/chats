import { send } from "@vercel/queue";
import type { InboundEvent } from "@/core/connectors/types";
import { INBOUND_EVENTS_TOPIC } from "./constants";

export async function enqueueInboundEvents(events: InboundEvent[]): Promise<void> {
  for (const event of events) {
    await send(INBOUND_EVENTS_TOPIC, event, {
      idempotencyKey: `${event.connector.installationId}:${event.event.externalEventId}`,
    });
  }
}
