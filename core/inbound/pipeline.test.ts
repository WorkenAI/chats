import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";

const { runInboundPipeline } = await import("@/core/inbound/pipeline");

const telegramInstallation = {
  id: "inst-pipe",
  workspaceId: "ws-pipe",
  connectorKind: "telegram",
  config: {},
};

describe("runInboundPipeline (INGRESS_SYNC)", () => {
  let infoSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "";
    delete process.env.VERCEL;
    process.env.INGRESS_SYNC = "1";
    infoSpy = spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test("normalizes and runs ingest for telegram text message", async () => {
    const rawBody = JSON.stringify({
      update_id: Math.floor(Math.random() * 1_000_000_000),
      message: {
        message_id: 1,
        date: 1_700_000_000,
        text: "pipeline",
        chat: { id: 1 },
        from: { id: 2 },
      },
    });

    await runInboundPipeline({
      installation: { ...telegramInstallation },
      headers: new Headers(),
      rawBody,
    });

    expect(infoSpy).toHaveBeenCalled();
    const first = infoSpy.mock.calls[0]!;
    expect(first[0]).toBe("[ingress]");
    expect(first[1]).toBe("message.created");
    expect(first[2]).toBe("telegram");
  });

  test("throws when connector kind is unknown", async () => {
    await expect(
      runInboundPipeline({
        installation: {
          id: "x",
          workspaceId: "w",
          connectorKind: "unknown-channel",
          config: {},
        },
        headers: new Headers(),
        rawBody: "{}",
      }),
    ).rejects.toThrow("Unknown connector kind");
  });
});
