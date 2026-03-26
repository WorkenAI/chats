export type ConnectorConfig = Record<string, unknown>;

export type Installation = {
  id: string;
  workspaceId: string;
  connectorKind: string;
  config: ConnectorConfig;
};

export type InboundEvent = {
  workspaceId: string;
  connector: {
    kind: string;
    installationId: string;
  };
  conversation: {
    externalChatId: string;
  };
  actor: {
    externalUserId: string;
    role: "customer" | "agent" | "system";
    displayName?: string;
  };
  event: {
    kind: string;
    externalEventId: string;
    externalMessageId?: string;
    /** e.g. Telegram reply_to_message.message_id */
    replyToExternalMessageId?: string;
    occurredAt: string;
    text?: string;
    raw?: unknown;
  };
};

export type InboundCapability = {
  verifyWebhook?: (input: {
    headers: Headers;
    rawBody: string;
    config: ConnectorConfig;
    installation: Installation;
  }) => Promise<void>;
  normalize: (input: {
    headers: Headers;
    rawBody: string;
    config: ConnectorConfig;
    installation: Installation;
  }) => Promise<InboundEvent[]>;
};

export type ChannelTarget = { externalChatId: string };

export type OutboundTextPayload = {
  kind: "text";
  text: string;
  /** e.g. provider reply-to / thread id */
  replyToExternalMessageId?: string;
};

/** Set or clear a reaction on an existing channel message (driver maps to provider API). */
export type OutboundReactionPayload = {
  kind: "reaction";
  externalMessageId: string;
  /**
   * One standard emoji (Unicode). Empty string means remove reactions set by this bot on that message
   * (provider-specific; Telegram uses an empty reaction list).
   */
  emoji: string;
};

export type OutboundPayload = OutboundTextPayload | OutboundReactionPayload;

export type SendResult = { ok: boolean };

export type OutboundCapability = {
  send: (input: {
    config: ConnectorConfig;
    installation: Installation;
    target: ChannelTarget;
    payload: OutboundPayload;
  }) => Promise<SendResult>;
};

export type ConnectorDriver = {
  kind: string;
  inbound?: InboundCapability;
  outbound?: OutboundCapability;
};
