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

export type OutboundPayload = { kind: "text"; text: string };

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
