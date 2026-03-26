/**
 * Real LLM via Vercel AI Gateway (same provider as `gateway()` in workflows).
 *
 *   bun run test:agent
 *   bun run test:agent:local   # loads AI_GATEWAY_API_KEY from .env.local
 *
 * Full `runChannelAgentTurn` runs inside Next.js (workflow transform); this
 * integration test only verifies Gateway + model access from your account.
 */
import { describe, expect, test } from "bun:test";
import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";

const integrationRequested = process.env.RUN_AGENT_INTEGRATION === "1";
const modelId =
  process.env.AGENT_MODEL?.trim() || "openai/gpt-4o-mini";

describe("real agent (Vercel AI Gateway)", () => {
  test(
    "generateText returns GATEWAY_OK when integration is requested",
    async () => {
      if (!integrationRequested) {
        return;
      }
      if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
        throw new Error(
          "RUN_AGENT_INTEGRATION=1 requires AI_GATEWAY_API_KEY (or run: bun run test:agent:local with .env.local).",
        );
      }

      const { text, finishReason } = await generateText({
        model: gateway(modelId),
        prompt:
          'Reply with exactly one line: "GATEWAY_OK" and nothing else.',
        maxOutputTokens: 32,
      });

      expect(finishReason).toBe("stop");
      expect(text.toUpperCase()).toContain("GATEWAY_OK");
    },
    { timeout: 60_000 },
  );

  test("no network when integration is off", () => {
    if (integrationRequested) {
      return;
    }
    expect(integrationRequested).toBe(false);
  });
});
