import { afterEach, describe, expect, spyOn, test } from "bun:test";

const { POST } = await import("./route");

describe("POST /api/chat/reaction", () => {
  let errorSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    errorSpy?.mockRestore();
    delete process.env.WEB_CHAT_REACTION_OUTBOUND_INSTALLATION_ID;
    delete process.env.WEB_CHAT_REACTION_OUTBOUND_EXTERNAL_CHAT_ID;
  });

  test("400 on invalid JSON", async () => {
    const req = new Request("http://localhost/api/chat/reaction", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("400 on invalid body", async () => {
    const req = new Request("http://localhost/api/chat/reaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("200 add reaction with normalized avatar", async () => {
    const req = new Request("http://localhost/api/chat/reaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "t1",
        bubbleId: "b1",
        emoji: "🔥",
        remove: false,
        participant: {
          userId: "u1",
          displayName: "Tester",
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      reaction: { emoji: string; userId: string; avatarUrl: string };
    };
    expect(body.ok).toBe(true);
    expect(body.reaction.emoji).toBe("🔥");
    expect(body.reaction.userId).toBe("u1");
    expect(body.reaction.avatarUrl).toContain("dicebear.com");
  });

  test("200 remove returns null reaction", async () => {
    const req = new Request("http://localhost/api/chat/reaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "t1",
        bubbleId: "b1",
        emoji: "🔥",
        remove: true,
        participant: { userId: "u1" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; reaction: null };
    expect(body.ok).toBe(true);
    expect(body.reaction).toBeNull();
  });

  test("502 when outbound env set but installation missing", async () => {
    process.env.WEB_CHAT_REACTION_OUTBOUND_INSTALLATION_ID = "no-such-install";
    process.env.WEB_CHAT_REACTION_OUTBOUND_EXTERNAL_CHAT_ID = "42";
    errorSpy = spyOn(console, "error").mockImplementation(() => {});

    const req = new Request("http://localhost/api/chat/reaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "t1",
        bubbleId: "b1",
        emoji: "👍",
        remove: false,
        participant: { userId: "u1" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });
});
