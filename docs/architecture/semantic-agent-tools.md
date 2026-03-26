# Semantic agent tools

The agent must not depend on `archetype`, `normalize`, or `resources`. It sees **stable tools** backed by `ToolRuntime` (external) and **product services** (domain).

## External vs domain tools

| Class                  | Layer                         | Examples |
| ---------------------- | ----------------------------- | -------- |
| **External**           | `ToolRuntime` → connectors    | `sendMessage`, `findOrder`, `createTicket`, `searchCandidates`, `uploadFile`, `runOcr` |
| **Domain / workspace** | `WorkItemService`, `ThreadService`, `ConversationService`, object linking | `createTask`, `createReview`, `createDraft`, `linkObject`, `assignWorkItem`, `markThreadStatus` |

Not every tool is an integration tool. Part of the surface is **workspace/domain**.

## Agent runtime shape

```ts
type AgentRuntime = {
  external: ToolRuntime;
  workItems: WorkItemService;
  threads: ThreadService;
  conversation: ConversationService;
};
```

The agent does **not** call connectors or the UI directly — only semantic tools built on `AgentRuntime` (and policy). See [../runtime.md](../runtime.md).

## Example: external tools only (legacy slice)

```ts
// app/agents/tools.ts

import { z } from "zod";
import type { ToolRuntime } from "../core/runtime/tool-runtime";

export function buildAgentTools(
  runtime: ToolRuntime,
  ctx: {
    workspaceId: string;
    chatInstallationId: string;
    crmInstallationId?: string;
    atsInstallationId?: string;
  }
) {
  return {
    sendMessage: {
      description: "Send a message to the current channel",
      inputSchema: z.object({
        externalChatId: z.string(),
        text: z.string(),
      }),
      execute: async (input: { externalChatId: string; text: string }) => {
        return runtime.sendMessage({
          workspaceId: ctx.workspaceId,
          installationId: ctx.chatInstallationId,
          conversation: { externalChatId: input.externalChatId },
          text: input.text,
        });
      },
    },

    findOrder: {
      description: "Find a customer order in the internal system",
      inputSchema: z.object({
        orderQuery: z.string(),
      }),
      execute: async (input: { orderQuery: string }) => {
        if (!ctx.crmInstallationId) {
          throw new Error("CRM installation is not configured");
        }

        return runtime.findOrder({
          workspaceId: ctx.workspaceId,
          installationId: ctx.crmInstallationId,
          orderQuery: input.orderQuery,
        });
      },
    },

    createTicket: {
      description: "Create a support ticket",
      inputSchema: z.object({
        title: z.string(),
        description: z.string(),
      }),
      execute: async (input: { title: string; description: string }) => {
        if (!ctx.crmInstallationId) {
          throw new Error("Support installation is not configured");
        }

        return runtime.createTicket({
          workspaceId: ctx.workspaceId,
          installationId: ctx.crmInstallationId,
          title: input.title,
          description: input.description,
        });
      },
    },

    searchCandidates: {
      description: "Search candidates",
      inputSchema: z.object({
        query: z.string(),
        vacancyId: z.string().optional(),
      }),
      execute: async (input: { query: string; vacancyId?: string }) => {
        if (!ctx.atsInstallationId) {
          throw new Error("ATS installation is not configured");
        }

        return runtime.searchCandidates({
          workspaceId: ctx.workspaceId,
          installationId: ctx.atsInstallationId,
          query: input.query,
          vacancyId: input.vacancyId,
        });
      },
    },
  };
}
```

In production, merge **domain** tool implementations (calling `WorkItemService`, etc.) into the same registry pattern.

## Layering

```
Agent
  → semantic tools / ports

ToolRuntime (external)
  → installation + connector archetype

Archetypes
  → channel | resource | file | service

Concrete drivers
  → telegram | crm | ats | s3 | ocr
```

- A channel is not a CRM.
- A CRM is not file storage.
- OCR is not a messenger.
- The agent still gets one coherent tool layer.

## Why not hundreds of “model tools”

Unified integration APIs (e.g. Merge-style) normalize **many** products into **common models** (CRM, ticketing, ATS, HRIS, chat, KB, files — on the order of **~66** models without accounting, **~97** with accounting). Exposing each model with `list` / `get` / `search` / `create` / `update` alone yields **~250–330** low-level tools; adding comments, attachments, stage changes, links, resolve/assign/handoff pushes toward **400+**.

Those APIs optimize for **object coverage**, not **human-shaped agent actions**. Field mapping, custom objects, and per-platform writes are signals that the **agent surface** should not mirror the unified schema 1:1.

Keep a Merge-like layer **below** as integration/runtime. Expose **24–32 semantic business tools** at v1.

## v1 tool budget

Rough sizing for Sales + Support + HR + chat-like UI:

- **v0 / MVP:** 12–16 tools  
- **v1:** 24–32 tools  
- **v2** (finance, deeper CRM, back office): 35–45 tools  

### Suggested ~30 tools

**Core (8)**  
`send_message`, `search_knowledge`, `get_article`, `search_files`, `read_file`, `upload_file`, `create_task`, `handoff_to_human`

**Sales (7)**  
`find_contact`, `upsert_contact`, `find_lead`, `create_lead`, `find_opportunity`, `update_opportunity_stage`, `log_sales_activity`

**Support (7)**  
`find_order`, `get_order_status`, `create_ticket`, `update_ticket`, `add_ticket_comment`, `escalate_ticket`, `refund_or_return_request`

**HR (8)**  
`search_candidates`, `get_candidate`, `create_candidate`, `move_application_stage`, `schedule_interview`, `get_job`, `get_employee`, `get_time_off_balance`

`create_task` is a **domain** tool; the rest mix external and domain depending on implementation.
