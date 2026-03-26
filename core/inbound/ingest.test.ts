import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { ingestInboundEvent } from "@/core/inbound/ingest";
import type { InboundEvent } from "@/core/connectors/types";

function sampleEvent(externalEventId: string): InboundEvent {
  return {
    workspaceId: "w",
    connector: { kind: "telegram", installationId: "i-ingest" },
    conversation: { externalChatId: "c" },
    actor: { externalUserId: "u", role: "customer" },
    event: {
      kind: "message.created",
      externalEventId,
      occurredAt: new Date().toISOString(),
      text: "x",
    },
  };
}

describe("ingestInboundEvent", () => {
  let infoSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "";
    delete process.env.VERCEL;
    infoSpy = spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test("second call with same id is deduped (no extra logs)", async () => {
    const id = `ev-${crypto.randomUUID()}`;
    const event = sampleEvent(id);

    await ingestInboundEvent(event);
    const logsAfterFirst = infoSpy.mock.calls.length;
    await ingestInboundEvent(event);

    expect(infoSpy.mock.calls.length).toBe(logsAfterFirst);
  });
});
