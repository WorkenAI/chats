import { handleCallback } from "@vercel/queue";
import type { InboundEvent } from "@/core/connectors/types";
import { ingestInboundEvent } from "@/core/inbound/ingest";

export const POST = handleCallback(
  async (message: InboundEvent) => {
    await ingestInboundEvent(message);
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (_error, metadata) => {
      if (metadata.deliveryCount > 5) {
        return { acknowledge: true };
      }
      const delay = Math.min(300, 2 ** metadata.deliveryCount * 5);
      return { afterSeconds: delay };
    },
  },
);
