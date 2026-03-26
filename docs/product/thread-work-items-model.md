# Threads, messages, work items (domain model)

**Thread** — primary navigation unit. **WorkItem** — primary execution unit. **ObjectRef** — primary business context unit. Avoid folding everything into “one chat.”

## Channel bridge: `ThreadExternalLink`

Official link from a thread to an integration **installation** and channel identifiers (pairs with [installations-and-registry.md](../architecture/installations-and-registry.md) and `ChannelDriver`).

```ts
type ThreadExternalLink = {
  installationId: string;
  connectorKind: string;
  externalChatId: string;
  externalThreadId?: string | null;
};
```

Use on **Thread** as `external?: ThreadExternalLink` (optional for purely internal threads).

## Thread

```ts
type Thread = {
  id: string;

  source:
    | "internal"
    | "telegram"
    | "whatsapp"
    | "email"
    | "instagram"
    | "avito"
    | "bitrix24";

  ownership: "owned" | "observed";

  direction: "inbound" | "outbound" | "mixed";

  title: string;

  status:
    | "active"
    | "waiting_customer"
    | "waiting_operator"
    | "blocked"
    | "closed";

  participantIds: string[];

  external?: ThreadExternalLink;

  lastMessageAt: string;
  unreadCount: number;

  linkedObjectRefs: ObjectRef[];
  createdAt: string;
  updatedAt: string;
};
```

## Message

```ts
type Message = {
  id: string;
  threadId: string;

  author: {
    kind: "human" | "agent" | "system";
    actorId: string;
    displayName?: string;
  };

  visibility: "public" | "internal";

  text?: string;

  parts?: Array<
    | { type: "text"; text: string }
    | { type: "file"; fileId: string; name: string }
    | { type: "action"; actionId: string; label: string }
  >;

  externalMessageId?: string | null;
  createdAt: string;
};
```

## WorkItem

```ts
type WorkItem = TaskItem | ReviewItem | DraftItem;

type BaseWorkItem = {
  id: string;
  threadIds: string[];

  title: string;
  status:
    | "open"
    | "pending"
    | "in_progress"
    | "done"
    | "rejected"
    | "cancelled";

  assignee?: {
    kind: "user" | "team" | "agent" | "queue";
    id: string;
  };

  createdAt: string;
  updatedAt: string;
};

type TaskItem = BaseWorkItem & {
  kind: "task";
  dueAt?: string;
  priority?: "low" | "normal" | "high" | "urgent";
};

type ReviewItem = BaseWorkItem & {
  kind: "review";
  decision?: "approve" | "reject";
  options?: string[];
};

type DraftItem = BaseWorkItem & {
  kind: "draft";
  draftType: "reply" | "crm_update" | "email" | "follow_up";
  payload: Record<string, unknown>;
};
```

One work item may attach to **multiple** threads (`threadIds`).

## ObjectRef

```ts
type ObjectRef = {
  kind:
    | "customer"
    | "lead"
    | "deal"
    | "ticket"
    | "candidate"
    | "vacancy"
    | "order"
    | "employee";

  id: string;
  label?: string;
};
```

## AgentSession

When an agent run is tied to a thread:

```ts
type AgentSession = {
  id: string;
  threadId: string;
  agentId: string;

  status: "running" | "waiting" | "stopped" | "failed";

  waitingFor?: "customer" | "operator" | "external_event";

  workflowRunId?: string | null;

  lastPlannedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

## Relationships

- Thread **1 — N** Message  
- Thread **N — N** WorkItem  
- Thread **N — N** ObjectRef (via `linkedObjectRefs` and/or normalized tables)  
- Thread **0..1** AgentSession  

## Right panel shape

```ts
type RightPanelState = {
  openTasks: TaskItem[];
  pendingReviews: ReviewItem[];
  drafts: DraftItem[];
  facts: Array<{ key: string; value: string }>;
  linkedObjects: ObjectRef[];
};
```

## Service interfaces (minimal)

```ts
type ThreadService = {
  listThreads(filters?: {
    ownership?: "owned" | "observed";
    source?: string;
    status?: string;
  }): Promise<Thread[]>;

  getThread(threadId: string): Promise<Thread | null>;
};

type ConversationService = {
  listMessages(threadId: string): Promise<Message[]>;
  appendPublicMessage(input: {
    threadId: string;
    actorId: string;
    text: string;
  }): Promise<Message>;
  appendInternalEvent(input: {
    threadId: string;
    text: string;
  }): Promise<Message>;
};

type WorkItemService = {
  listByThread(threadId: string): Promise<WorkItem[]>;
  createTask(input: {
    threadIds: string[];
    title: string;
  }): Promise<TaskItem>;
  createReview(input: {
    threadIds: string[];
    title: string;
    options?: string[];
  }): Promise<ReviewItem>;
  createDraft(input: {
    threadIds: string[];
    title: string;
    draftType: DraftItem["draftType"];
    payload: Record<string, unknown>;
  }): Promise<DraftItem>;
};
```

`WorkItemService` is the natural home for **domain** agent tools (`createTask`, `createReview`, `createDraft`, …). See [semantic-agent-tools.md](../architecture/semantic-agent-tools.md).

## Integration touchpoints

| Domain / UI concept | Integration or service |
| ------------------- | ---------------------- |
| `Thread.external.installationId` | `InstallationRepo` → `connectorKind` + config |
| Outbound customer message | `sendMessage` → **ChannelDriver** for that installation |
| CRM/ATS lookup, tickets | **ResourceConnector** via external **ToolRuntime** |
| `ObjectRef` population | Resource-backed tools + domain linking |
| Task / review / draft | **WorkItemService** (internal), not a channel driver |
| **Observed** thread | Agent read/suggest/create work items; send restricted |
| **Owned** thread | Agent may send (per policy) |

## Example: Telegram support thread

- **Left:** Acme / Telegram / `waiting_customer`.  
- **Center:** public customer + agent messages; internal system lines with `visibility: internal`.  
- **Right:** task “check order in ERP,” draft reply with ETA, review “approve refund,” linked `ObjectRef` order `ORD-10428`.  

The agent can read/write the thread (within policy), create work items, add drafts/reviews, and attach business objects.
