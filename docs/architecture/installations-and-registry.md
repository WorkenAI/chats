# Installations and connector registry

The runtime must resolve a **specific installation** (credentials + `connectorKind`), not an abstract connector.

## Installation

```ts
// core/installations/types.ts

import type { InstallationId, WorkspaceId } from "../integrations/base";

export type Installation = {
  id: InstallationId;
  workspaceId: WorkspaceId;
  connectorKind: string;
  config: unknown;

  purpose?: string;
  tags?: string[];
};
```

## Installation repository

```ts
// core/installations/repo.ts

import type { Installation } from "./types";

export interface InstallationRepo {
  getById(id: string): Promise<Installation | null>;

  findOne(input: {
    workspaceId: string;
    connectorKind?: string;
    purpose?: string;
    tag?: string;
  }): Promise<Installation | null>;
}
```

## Connector registry

```ts
// core/integrations/registry.ts

import type { ChannelDriver } from "./channel";
import type { FileConnector } from "./file";
import type { ResourceConnector } from "./resource";
import type { ServiceConnector } from "./service";

export type AnyConnector =
  | ChannelDriver<any>
  | ResourceConnector<any>
  | FileConnector<any>
  | ServiceConnector<any>;

export class ConnectorRegistry {
  private readonly items = new Map<string, AnyConnector>();

  register(connector: AnyConnector) {
    if (this.items.has(connector.kind)) {
      throw new Error(`Connector already registered: ${connector.kind}`);
    }
    this.items.set(connector.kind, connector);
  }

  get(kind: string): AnyConnector {
    const found = this.items.get(kind);
    if (!found) throw new Error(`Unknown connector kind: ${kind}`);
    return found;
  }
}
```

Channel threads in the product model link to an installation via `Thread.external.installationId` — see [thread-work-items-model.md](../product/thread-work-items-model.md).
