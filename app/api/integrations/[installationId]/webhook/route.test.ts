import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

const { POST } = await import("./route");

describe("POST /api/integrations/[installationId]/webhook", () => {
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

  test("404 when installation not found", async () => {
    const req = new Request("http://localhost/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, {
      params: Promise.resolve({ installationId: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  test("200 and processes demo-telegram payload", async () => {
    const rawBody = JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 1,
        date: 1_700_000_000,
        text: "from webhook test",
        chat: { id: 42 },
        from: { id: 7 },
      },
    });

    const req = new Request("http://localhost/webhook", {
      method: "POST",
      body: rawBody,
    });

    const res = await POST(req, {
      params: Promise.resolve({ installationId: "demo-telegram" }),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(infoSpy).toHaveBeenCalled();
  });
});
