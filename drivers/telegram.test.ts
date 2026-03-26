import { describe, expect, mock, test } from "bun:test";
import { telegramDriver } from "@/drivers/telegram";

const baseInstallation = {
  id: "inst-1",
  workspaceId: "ws-1",
  connectorKind: "telegram",
  config: { botToken: "test-token" },
} as const;

describe("telegramDriver.inbound.normalize", () => {
  test("returns one InboundEvent for text message", async () => {
    const rawBody = JSON.stringify({
      update_id: 42,
      message: {
        message_id: 7,
        date: 1_700_000_000,
        text: "hello",
        chat: { id: 99 },
        from: { id: 1, username: "alice" },
      },
    });

    const events = await telegramDriver.inbound!.normalize({
      headers: new Headers(),
      rawBody,
      config: {},
      installation: { ...baseInstallation },
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.workspaceId).toBe("ws-1");
    expect(events[0]!.connector.installationId).toBe("inst-1");
    expect(events[0]!.conversation.externalChatId).toBe("99");
    expect(events[0]!.actor.externalUserId).toBe("1");
    expect(events[0]!.actor.displayName).toBe("alice");
    expect(events[0]!.event.kind).toBe("message.created");
    expect(events[0]!.event.externalEventId).toBe("42");
    expect(events[0]!.event.externalMessageId).toBe("7");
    expect(events[0]!.event.text).toBe("hello");
  });

  test("returns empty array for invalid JSON", async () => {
    const events = await telegramDriver.inbound!.normalize({
      headers: new Headers(),
      rawBody: "not-json",
      config: {},
      installation: { ...baseInstallation },
    });
    expect(events).toEqual([]);
  });

  test("returns empty when message has no text", async () => {
    const rawBody = JSON.stringify({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 1 },
      },
    });
    const events = await telegramDriver.inbound!.normalize({
      headers: new Headers(),
      rawBody,
      config: {},
      installation: { ...baseInstallation },
    });
    expect(events).toEqual([]);
  });

  test("uses unknown user id when from is missing", async () => {
    const rawBody = JSON.stringify({
      update_id: 2,
      message: {
        message_id: 1,
        date: 1,
        text: "x",
        chat: { id: 1 },
      },
    });
    const events = await telegramDriver.inbound!.normalize({
      headers: new Headers(),
      rawBody,
      config: {},
      installation: { ...baseInstallation },
    });
    expect(events[0]!.actor.externalUserId).toBe("unknown");
  });
});

describe("telegramDriver.outbound.send", () => {
  test("POSTs to Telegram sendMessage with bot token", async () => {
    const fetchMock = mock(
      (_url: string | URL, _init?: RequestInit) =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await telegramDriver.outbound!.send({
      config: { botToken: "secret" },
      installation: { ...baseInstallation },
      target: { externalChatId: "99" },
      payload: { kind: "text", text: "hi" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const first = fetchMock.mock.calls[0] as [
      string | URL,
      RequestInit | undefined,
    ];
    expect(String(first[0])).toBe(
      "https://api.telegram.org/botsecret/sendMessage",
    );
    expect(first[1]?.method).toBe("POST");
    const body = JSON.parse(String(first[1]?.body)) as {
      chat_id: string;
      text: string;
    };
    expect(body.chat_id).toBe("99");
    expect(body.text).toBe("hi");
  });

  test("throws when botToken is missing", async () => {
    await expect(
      telegramDriver.outbound!.send({
        config: {},
        installation: { ...baseInstallation },
        target: { externalChatId: "1" },
        payload: { kind: "text", text: "x" },
      }),
    ).rejects.toThrow("Missing botToken");
  });

  test("throws on non-OK response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("", { status: 500 })),
    ) as unknown as typeof fetch;

    await expect(
      telegramDriver.outbound!.send({
        config: { botToken: "t" },
        installation: { ...baseInstallation },
        target: { externalChatId: "1" },
        payload: { kind: "text", text: "x" },
      }),
    ).rejects.toThrow("Telegram send failed: 500");
  });
});
