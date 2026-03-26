# Platform ports and external ToolRuntime

Agents should call **stable ports** (`sendMessage`, `findOrder`, …), not `telegram.outbound.sendMessage`. The **ToolRuntime** maps each port to the right archetype + **installation**.

## Port input types

```ts
// core/ports/types.ts

export type SendMessageInput = {
  workspaceId: string;
  installationId: string;
  conversation: {
    externalChatId: string;
    externalThreadId?: string | null;
  };
  text: string;
};

export type FindOrderInput = {
  workspaceId: string;
  installationId: string;
  orderQuery: string;
};

export type CreateTicketInput = {
  workspaceId: string;
  installationId: string;
  title: string;
  description: string;
};

export type SearchCandidatesInput = {
  workspaceId: string;
  installationId: string;
  query: string;
  vacancyId?: string;
};

export type UploadFileInput = {
  workspaceId: string;
  installationId: string;
  name: string;
  mimeType?: string;
  bytes: Uint8Array;
};

export type RunOcrInput = {
  workspaceId: string;
  installationId: string;
  fileId: string;
};
```

## ToolRuntime

```ts
// core/runtime/tool-runtime.ts

import type { ConnectorRegistry } from "../integrations/registry";
import type { InstallationRepo } from "../installations/repo";
import type { Installation } from "../installations/types";

import type { ChannelDriver } from "../integrations/channel";
import type { ResourceConnector } from "../integrations/resource";
import type { FileConnector } from "../integrations/file";
import type { ServiceConnector } from "../integrations/service";

import type {
  CreateTicketInput,
  FindOrderInput,
  RunOcrInput,
  SearchCandidatesInput,
  SendMessageInput,
  UploadFileInput,
} from "../ports/types";

function asChannel(connector: any): ChannelDriver<any> {
  if (connector.archetype !== "channel") {
    throw new Error(`Expected channel connector, got ${connector.archetype}`);
  }
  return connector;
}

function asResource(connector: any): ResourceConnector<any> {
  if (connector.archetype !== "resource") {
    throw new Error(`Expected resource connector, got ${connector.archetype}`);
  }
  return connector;
}

function asFile(connector: any): FileConnector<any> {
  if (connector.archetype !== "file") {
    throw new Error(`Expected file connector, got ${connector.archetype}`);
  }
  return connector;
}

function asService(connector: any): ServiceConnector<any> {
  if (connector.archetype !== "service") {
    throw new Error(`Expected service connector, got ${connector.archetype}`);
  }
  return connector;
}

export class ToolRuntime {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly installations: InstallationRepo
  ) {}

  private async requireInstallation(id: string): Promise<Installation> {
    const found = await this.installations.getById(id);
    if (!found) throw new Error(`Installation not found: ${id}`);
    return found;
  }

  async sendMessage(input: SendMessageInput) {
    const installation = await this.requireInstallation(input.installationId);
    const connector = asChannel(this.registry.get(installation.connectorKind));

    if (!connector.outbound) {
      throw new Error(`Connector ${connector.kind} has no outbound capability`);
    }

    return connector.outbound.sendMessage({
      config: installation.config,
      scope: {
        workspaceId: installation.workspaceId,
        installationId: installation.id,
      },
      target: { conversation: input.conversation },
      message: { kind: "text", text: input.text },
    });
  }

  async findOrder(input: FindOrderInput) {
    const installation = await this.requireInstallation(input.installationId);
    const connector = asResource(this.registry.get(installation.connectorKind));

    const orders = connector.resources["order"];
    if (!orders?.search) {
      throw new Error(`Connector ${connector.kind} does not support order.search`);
    }

    return orders.search({
      config: installation.config,
      scope: {
        workspaceId: installation.workspaceId,
        installationId: installation.id,
      },
      query: input.orderQuery,
      limit: 10,
    });
  }

  async createTicket(input: CreateTicketInput) {
    const installation = await this.requireInstallation(input.installationId);
    const connector = asResource(this.registry.get(installation.connectorKind));

    const tickets = connector.resources["ticket"];
    if (!tickets?.create) {
      throw new Error(`Connector ${connector.kind} does not support ticket.create`);
    }

    return tickets.create({
      config: installation.config,
      scope: {
        workspaceId: installation.workspaceId,
        installationId: installation.id,
      },
      fields: {
        title: input.title,
        description: input.description,
      },
    });
  }

  async searchCandidates(input: SearchCandidatesInput) {
    const installation = await this.requireInstallation(input.installationId);
    const connector = asResource(this.registry.get(installation.connectorKind));

    const candidates = connector.resources["candidate"];
    if (!candidates?.search) {
      throw new Error(
        `Connector ${connector.kind} does not support candidate.search`
      );
    }

    return candidates.search({
      config: installation.config,
      scope: {
        workspaceId: installation.workspaceId,
        installationId: installation.id,
      },
      query: input.query,
      filters: input.vacancyId ? { vacancyId: input.vacancyId } : undefined,
      limit: 20,
    });
  }

  async uploadFile(input: UploadFileInput) {
    const installation = await this.requireInstallation(input.installationId);
    const connector = asFile(this.registry.get(installation.connectorKind));

    return connector.files.put({
      config: installation.config,
      scope: {
        workspaceId: installation.workspaceId,
        installationId: installation.id,
      },
      name: input.name,
      mimeType: input.mimeType,
      bytes: input.bytes,
    });
  }

  async runOcr(input: RunOcrInput) {
    const installation = await this.requireInstallation(input.installationId);
    const connector = asService(this.registry.get(installation.connectorKind));

    const ocr = connector.procedures["extractText"];
    if (!ocr) {
      throw new Error(
        `Connector ${connector.kind} does not support procedure extractText`
      );
    }

    return ocr.invoke({
      config: installation.config,
      scope: {
        workspaceId: installation.workspaceId,
        installationId: installation.id,
      },
      payload: { fileId: input.fileId },
    });
  }
}
```

This layer is **external integration only**. Domain/workspace tools (`createTask`, `linkObject`, …) live in product services — see [semantic-agent-tools.md](./semantic-agent-tools.md) and [../runtime.md](../runtime.md).
