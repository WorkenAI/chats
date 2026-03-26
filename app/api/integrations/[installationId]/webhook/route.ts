import { getInstallationById } from "@/core/installations/repo";
import { WebhookError, runInboundPipeline } from "@/core/inbound/pipeline";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ installationId: string }> },
) {
  const { installationId } = await ctx.params;
  const installation = await getInstallationById(installationId);
  if (!installation) {
    return new Response("not found", { status: 404 });
  }

  const rawBody = await request.text();

  try {
    await runInboundPipeline({
      installation,
      headers: request.headers,
      rawBody,
    });
  } catch (e) {
    if (e instanceof WebhookError) {
      return new Response(e.message, { status: e.status });
    }
    console.error("[webhook]", e);
    return new Response("internal error", { status: 500 });
  }

  return new Response("ok");
}
