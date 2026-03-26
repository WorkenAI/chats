/**
 * Vercel AI Gateway (your Vercel account / team billing).
 *
 * - Local: create a key in the Vercel dashboard → AI Gateway → API keys, then set
 *   `AI_GATEWAY_API_KEY` in `.env.local`.
 * - Deployed on Vercel: OIDC is used automatically when `AI_GATEWAY_API_KEY` is unset.
 *
 * @see https://vercel.com/docs/ai-gateway
 */
export function isAiGatewayAvailable(): boolean {
  if (process.env.AI_GATEWAY_API_KEY?.trim()) {
    return true;
  }
  if (process.env.VERCEL === "1") {
    return true;
  }
  return false;
}
