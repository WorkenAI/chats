import { NextResponse } from "next/server";
import { z } from "zod";
import { dispatchOutbound } from "@/core/outbound/dispatch";
import type { WebChatUserReaction } from "@/core/agents/web-chat-ui-types";
import { defaultAvatarUrlForUserId } from "@/core/agents/web-chat-participant";

/**
 * Web chat user reactions — same payload shape as channel outbound `kind: "reaction"`
 * (`externalMessageId` + `emoji`), plus thread routing and participant for UI.
 *
 * Optional bridge: set `WEB_CHAT_REACTION_OUTBOUND_INSTALLATION_ID` and
 * `WEB_CHAT_REACTION_EXTERNAL_CHAT_ID` to forward to `dispatchOutbound` (e.g. Telegram).
 * `bubbleId` is sent as `externalMessageId`; only enable when ids match the provider.
 */

const participantSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

const bodySchema = z.object({
  threadId: z.string().min(1),
  /** Maps to `OutboundReactionPayload.externalMessageId` for optional channel bridge. */
  bubbleId: z.string().min(1),
  emoji: z.string(),
  remove: z.boolean(),
  participant: participantSchema,
});

function normalizeReaction(
  emoji: string,
  p: z.infer<typeof participantSchema>,
): WebChatUserReaction {
  return {
    emoji: emoji.trim(),
    userId: p.userId,
    displayName: p.displayName?.trim() || undefined,
    avatarUrl:
      p.avatarUrl?.trim() ||
      defaultAvatarUrlForUserId(p.userId),
  };
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    );
  }

  const { threadId, bubbleId, emoji, remove, participant } = parsed.data;

  const installId = process.env.WEB_CHAT_REACTION_OUTBOUND_INSTALLATION_ID?.trim();
  const externalChatId =
    process.env.WEB_CHAT_REACTION_OUTBOUND_EXTERNAL_CHAT_ID?.trim();

  if (installId && externalChatId) {
    try {
      await dispatchOutbound({
        installationId: installId,
        target: { externalChatId },
        payload: {
          kind: "reaction",
          externalMessageId: bubbleId,
          emoji: remove ? "" : emoji.trim(),
        },
      });
    } catch (e) {
      console.error("[chat/reaction] dispatchOutbound", e);
      return NextResponse.json(
        { ok: false, error: "Outbound reaction failed" },
        { status: 502 },
      );
    }
  }

  void threadId;

  const reaction: WebChatUserReaction | null = remove
    ? null
    : normalizeReaction(emoji, participant);

  return NextResponse.json({ ok: true, reaction });
}
