# Connector archetypes

There is no single universal integration contract. Use **archetypes** (channel, resource, file, service), a shared platform runtime above them, and **stable semantic tools** at the agent boundary.

## Base types

```ts
// core/integrations/base.ts

export type WorkspaceId = string;
export type InstallationId = string;
export type ConnectorKind = string;

export type ConnectorScope = {
  workspaceId: WorkspaceId;
  installationId: InstallationId;
};

export type ExternalRef = {
  id: string;
  url?: string;
};

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json };

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

## ChannelDriver

Messengers, email, Slack, voice gateways.

```ts
// core/integrations/channel.ts

import type { ConnectorKind, ConnectorScope, Json } from "./base";

export type ChannelConversationRef = {
  externalChatId: string;
  externalThreadId?: string | null;
};

export type ChannelActorRef = {
  externalUserId: string;
  displayName?: string;
  role: "customer" | "operator" | "system";
};

export type InboundEvent =
  | {
      type: "message.created";
      text?: string;
      raw: Json;
      occurredAt: string;
      externalEventId?: string;
      externalMessageId?: string;
      conversation: ChannelConversationRef;
      actor: ChannelActorRef;
    }
  | {
      type: "callback.submitted";
      raw: Json;
      occurredAt: string;
      externalEventId?: string;
      conversation: ChannelConversationRef;
      actor: ChannelActorRef;
      data: string;
    };

export type OutboundMessage =
  | { kind: "text"; text: string }
  | {
      kind: "text+actions";
      text: string;
      actions: Array<{ id: string; label: string; value: string }>;
    };

export type ChannelTarget = { conversation: ChannelConversationRef };

export type ChannelInboundCapability<TConfig> = {
  verifyWebhook?: (input: {
    headers: Headers;
    rawBody: string;
    config: TConfig;
    scope: ConnectorScope;
  }) => Promise<void>;

  normalize: (input: {
    headers: Headers;
    rawBody: string;
    config: TConfig;
    scope: ConnectorScope;
  }) => Promise<InboundEvent[]>;
};

export type ChannelOutboundCapability<TConfig> = {
  sendMessage: (input: {
    config: TConfig;
    scope: ConnectorScope;
    target: ChannelTarget;
    message: OutboundMessage;
  }) => Promise<{ externalMessageId?: string }>;
};

export type ChannelDriver<TConfig> = {
  archetype: "channel";
  kind: ConnectorKind;
  inbound?: ChannelInboundCapability<TConfig>;
  outbound?: ChannelOutboundCapability<TConfig>;
};
```

## ResourceConnector

CRM, ATS, helpdesk, calendar, ERP.

```ts
// core/integrations/resource.ts

import type { ConnectorKind, ConnectorScope, Json } from "./base";

export type ResourceRecord = {
  id: string;
  fields: Record<string, Json>;
  raw?: Json;
};

export type ResourceCollection = {
  get?: (input: {
    config: unknown;
    scope: ConnectorScope;
    id: string;
  }) => Promise<ResourceRecord | null>;

  search?: (input: {
    config: unknown;
    scope: ConnectorScope;
    query: string;
    filters?: Record<string, Json>;
    limit?: number;
  }) => Promise<ResourceRecord[]>;

  create?: (input: {
    config: unknown;
    scope: ConnectorScope;
    fields: Record<string, Json>;
  }) => Promise<ResourceRecord>;

  update?: (input: {
    config: unknown;
    scope: ConnectorScope;
    id: string;
    patch: Record<string, Json>;
  }) => Promise<ResourceRecord>;

  upsert?: (input: {
    config: unknown;
    scope: ConnectorScope;
    key: string;
    value: string;
    fields: Record<string, Json>;
  }) => Promise<ResourceRecord>;
};

export type ResourceEventsCapability<TConfig> = {
  normalize?: (input: {
    headers: Headers;
    rawBody: string;
    config: TConfig;
    scope: ConnectorScope;
  }) => Promise<
    Array<{
      type: string;
      resource: string;
      externalEventId?: string;
      occurredAt: string;
      payload: Json;
    }>
  >;
};

export type ResourceConnector<TConfig> = {
  archetype: "resource";
  kind: ConnectorKind;
  resources: Record<string, ResourceCollection>;
  events?: ResourceEventsCapability<TConfig>;
};
```

## FileConnector

S3, Google Drive, Dropbox.

```ts
// core/integrations/file.ts

import type { ConnectorKind, ConnectorScope } from "./base";

export type FileRef = {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
};

export type FileConnector<TConfig> = {
  archetype: "file";
  kind: ConnectorKind;
  files: {
    put: (input: {
      config: TConfig;
      scope: ConnectorScope;
      name: string;
      mimeType?: string;
      bytes: Uint8Array;
      folderId?: string;
    }) => Promise<FileRef>;

    get: (input: {
      config: TConfig;
      scope: ConnectorScope;
      fileId: string;
    }) => Promise<{ file: FileRef; bytes: Uint8Array }>;

    list?: (input: {
      config: TConfig;
      scope: ConnectorScope;
      folderId?: string;
      limit?: number;
    }) => Promise<FileRef[]>;
  };
};
```

## ServiceConnector

OCR, search, payments, enrichment, speech, geocoding.

```ts
// core/integrations/service.ts

import type { ConnectorKind, ConnectorScope, Json } from "./base";

export type ServiceProcedure = {
  invoke: (input: {
    config: unknown;
    scope: ConnectorScope;
    payload: Record<string, Json>;
  }) => Promise<Json>;
};

export type ServiceConnector<TConfig> = {
  archetype: "service";
  kind: ConnectorKind;
  procedures: Record<string, ServiceProcedure>;
};
```

## Union type

```ts
import type { ChannelDriver } from "./channel";
import type { FileConnector } from "./file";
import type { ResourceConnector } from "./resource";
import type { ServiceConnector } from "./service";

export type AnyConnector =
  | ChannelDriver<any>
  | ResourceConnector<any>
  | FileConnector<any>
  | ServiceConnector<any>;
```

Register concrete drivers in `ConnectorRegistry` — see [installations-and-registry.md](./installations-and-registry.md).

## Summary

| Archetype            | Use case                          |
| -------------------- | --------------------------------- |
| `ChannelDriver`      | Transport / chat events           |
| `ResourceConnector`  | Object systems (CRUD-ish collections) |
| `FileConnector`      | Bytes in / out of storage         |
| `ServiceConnector`   | Invoke-style APIs                 |

You do not need one interface for every integration. You need one **runtime** over several archetypes.
