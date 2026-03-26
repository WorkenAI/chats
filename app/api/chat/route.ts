import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { isAiGatewayAvailable } from "@/core/agents/gateway-env";
import { getInstallationById } from "@/core/installations/repo";
import { WEB_CHAT_INSTALLATION_ID } from "@/lib/web-chat-installation";
import { runWebMessengerAgentTurn } from "@/workflows/messenger-agent-turn";

type ChatBody = {
  messages?: UIMessage[];
  installationId?: string;
  externalChatId?: string;
};

export async function POST(request: Request) {
  if (!isAiGatewayAvailable()) {
    return NextResponse.json(
      {
        error:
          "AI Gateway not configured. Set AI_GATEWAY_API_KEY locally or deploy on Vercel.",
      },
      { status: 503 },
    );
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const installationId =
    typeof body.installationId === "string" && body.installationId.trim()
      ? body.installationId.trim()
      : WEB_CHAT_INSTALLATION_ID;
  const externalChatId =
    typeof body.externalChatId === "string" && body.externalChatId.trim()
      ? body.externalChatId.trim()
      : null;
  if (!externalChatId) {
    return NextResponse.json(
      { error: "externalChatId required (use thread id)" },
      { status: 400 },
    );
  }

  const installation = await getInstallationById(installationId);
  if (!installation || installation.connectorKind !== "web") {
    return NextResponse.json(
      { error: "Invalid or unknown web installation" },
      { status: 400 },
    );
  }

  const run = await start(runWebMessengerAgentTurn, [
    {
      installationId,
      externalChatId,
      messages,
    },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable,
    headers: {
      "x-workflow-run-id": run.runId,
    },
  });
}
