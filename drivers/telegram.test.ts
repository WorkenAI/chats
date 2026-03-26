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

  test("sets replyToExternalMessageId when message is a reply", async () => {
    const rawBody = JSON.stringify({
      update_id: 43,
      message: {
        message_id: 8,
        date: 1_700_000_000,
        text: "replying",
        chat: { id: 99 },
        reply_to_message: { message_id: 3 },
        from: { id: 1 },
      },
    });

    const events = await telegramDriver.inbound!.normalize({
      headers: new Headers(),
      rawBody,
      config: {},
      installation: { ...baseInstallation },
    });

    expect(events[0]!.event.externalMessageId).toBe("8");
    expect(events[0]!.event.replyToExternalMessageId).toBe("3");
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

  test("includes reply_to_message_id when payload has replyToExternalMessageId", async () => {
    const fetchMock = mock(
      (_url: string | URL, _init?: RequestInit) =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await telegramDriver.outbound!.send({
      config: { botToken: "secret" },
      installation: { ...baseInstallation },
      target: { externalChatId: "99" },
      payload: {
        kind: "text",
        text: "threaded",
        replyToExternalMessageId: "42",
      },
    });

    const first = fetchMock.mock.calls[0] as [
      string | URL,
      RequestInit | undefined,
    ];
    const body = JSON.parse(String(first[1]?.body)) as {
      chat_id: string;
      text: string;
      reply_to_message_id: number;
    };
    expect(body.reply_to_message_id).toBe(42);
  });

  test("throws on invalid replyToExternalMessageId", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("{}", { status: 200 })),
    ) as unknown as typeof fetch;

    await expect(
      telegramDriver.outbound!.send({
        config: { botToken: "t" },
        installation: { ...baseInstallation },
        target: { externalChatId: "1" },
        payload: {
          kind: "text",
          text: "x",
          replyToExternalMessageId: "not-a-number",
        },
      }),
    ).rejects.toThrow("Invalid replyToExternalMessageId");
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

  test("POSTs setMessageReaction with emoji", async () => {
    const fetchMock = mock(
      (_url: string | URL, _init?: RequestInit) =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await telegramDriver.outbound!.send({
      config: { botToken: "secret" },
      installation: { ...baseInstallation },
      target: { externalChatId: "99" },
      payload: { kind: "reaction", externalMessageId: "5", emoji: "👍" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const first = fetchMock.mock.calls[0] as [
      string | URL,
      RequestInit | undefined,
    ];
    expect(String(first[0])).toBe(
      "https://api.telegram.org/botsecret/setMessageReaction",
    );
    const body = JSON.parse(String(first[1]?.body)) as {
      chat_id: string;
      message_id: number;
      reaction: Array<{ type: string; emoji: string }>;
    };
    expect(body.chat_id).toBe("99");
    expect(body.message_id).toBe(5);
    expect(body.reaction).toEqual([{ type: "emoji", emoji: "👍" }]);
  });

  test("setMessageReaction sends empty reaction array when emoji is blank", async () => {
    const fetchMock = mock(
      (_url: string | URL, _init?: RequestInit) =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await telegramDriver.outbound!.send({
      config: { botToken: "secret" },
      installation: { ...baseInstallation },
      target: { externalChatId: "99" },
      payload: { kind: "reaction", externalMessageId: "5", emoji: "   " },
    });

    const first = fetchMock.mock.calls[0] as [
      string | URL,
      RequestInit | undefined,
    ];
    const body = JSON.parse(String(first[1]?.body)) as {
      reaction: unknown[];
    };
    expect(body.reaction).toEqual([]);
  });

  test("throws on invalid externalMessageId for reaction", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("{}", { status: 200 })),
    ) as unknown as typeof fetch;

    await expect(
      telegramDriver.outbound!.send({
        config: { botToken: "t" },
        installation: { ...baseInstallation },
        target: { externalChatId: "1" },
        payload: { kind: "reaction", externalMessageId: "nope", emoji: "👍" },
      }),
    ).rejects.toThrow("Invalid externalMessageId for reaction");
  });

  test("throws on non-OK setMessageReaction response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("", { status: 400 })),
    ) as unknown as typeof fetch;

    await expect(
      telegramDriver.outbound!.send({
        config: { botToken: "t" },
        installation: { ...baseInstallation },
        target: { externalChatId: "1" },
        payload: { kind: "reaction", externalMessageId: "1", emoji: "🔥" },
      }),
    ).rejects.toThrow("Telegram setMessageReaction failed: 400");
  });
});
