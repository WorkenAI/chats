import { beforeEach, describe, expect, mock, test } from "bun:test";
import { INBOUND_EVENTS_TOPIC } from "@/core/inbound/constants";

const sendMock = mock(() => Promise.resolve({ messageId: "msg-1" }));

mock.module("@vercel/queue", () => ({
  send: sendMock,
}));

const { enqueueInboundEvents } = await import("@/core/inbound/enqueue");
const { runInboundPipeline } = await import("@/core/inbound/pipeline");

const telegramInstallation = {
  id: "inst-q",
  workspaceId: "ws-q",
  connectorKind: "telegram",
  config: {},
};

describe("enqueueInboundEvents", () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  test("sends each event with topic and idempotencyKey", async () => {
    const events = [
      {
        workspaceId: "w",
        connector: { kind: "telegram", installationId: "i1" },
        conversation: { externalChatId: "c" },
        actor: {
          externalUserId: "u",
          role: "customer" as const,
        },
        event: {
          kind: "message.created",
          externalEventId: "e1",
          occurredAt: new Date().toISOString(),
        },
      },
      {
        workspaceId: "w",
        connector: { kind: "telegram", installationId: "i1" },
        conversation: { externalChatId: "c" },
        actor: {
          externalUserId: "u",
          role: "customer" as const,
        },
        event: {
          kind: "message.created",
          externalEventId: "e2",
          occurredAt: new Date().toISOString(),
        },
      },
    ];

    await enqueueInboundEvents(events);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[0]![0]).toBe(INBOUND_EVENTS_TOPIC);
    expect(sendMock.mock.calls[0]![1]).toEqual(events[0]);
    expect(sendMock.mock.calls[0]![2]).toEqual({
      idempotencyKey: "i1:e1",
    });
    expect(sendMock.mock.calls[1]![2]).toEqual({
      idempotencyKey: "i1:e2",
    });
  });
});

describe("runInboundPipeline → enqueue (no INGRESS_SYNC)", () => {
  beforeEach(() => {
    delete process.env.INGRESS_SYNC;
    sendMock.mockClear();
  });

  test("calls send for normalized telegram events", async () => {
    const rawBody = JSON.stringify({
      update_id: 9_001_337,
      message: {
        message_id: 1,
        date: 1,
        text: "queued",
        chat: { id: 55 },
        from: { id: 1 },
      },
    });

    await runInboundPipeline({
      installation: { ...telegramInstallation },
      headers: new Headers(),
      rawBody,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]![2]).toEqual({
      idempotencyKey: "inst-q:9001337",
    });
  });
});
