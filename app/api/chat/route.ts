import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { isAiGatewayAvailable } from "@/core/agents/gateway-env";
import { runWebChatTurn } from "@/workflows/web-chat-turn";

type ChatBody = {
  messages?: UIMessage[];
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

  const run = await start(runWebChatTurn, [messages]);

  return createUIMessageStreamResponse({
    stream: run.readable,
    headers: {
      "x-workflow-run-id": run.runId,
    },
  });
}
