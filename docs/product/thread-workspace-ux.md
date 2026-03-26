# Thread-centric workspace (UX)

**Left:** where communication is listed. **Center:** timeline of the selected thread (conversation mode) or work surface (work mode). **Right:** work items, facts, and linked objects — not “chat only.”

## Domain shorthand

- **Thread** — where communication happens (container), not the unit of work.
- **WorkItem** — what must be done (execution unit): task, review, or draft.
- **ObjectRef** — what the case is about (business context).
- **Kanban / Work Board** — global projection of work items across threads.
- **Execution view** — where the user acts on one work item (not a Jira-style detail modal).

**Thread ≠ task.** Threads produce work items; a work item may reference one or many threads.

## Thread ownership

`ownership: "owned" | "observed"` combines with internal/external sources:

|              | owned              | observed                    |
| ------------ | ------------------ | --------------------------- |
| **External** | we reply as us     | we analyze, don’t send freely |
| **Internal** | our working threads | we’re not the main actor   |

**Agent policy:** owned → can send (per rules); observed → read, create work items, suggest drafts, typically no unsupervised send.

## Right panel: work items

Prefer **WorkItem** (not “tasks” only):

- **Task** — do something (title, status, assignee, due).
- **Review** — approve / reject / choose.
- **Draft** — agent-prepared reply, CRM update, follow-up, etc.

### Panel modes

1. **Thread mode** — work items (and facts) scoped to the current thread.
2. **Focus mode** — only what needs action now: overdue, blocked, pending approval, next best action.

### Suggested column blocks

1. Open work (tasks)  
2. Pending reviews  
3. Drafts / suggested actions  
4. Facts / linked objects  

## Conversation mode layout

**Threads | Conversation | Work items**

- **Threads:** operational queue — name, channel, company, status, unread, waiting, blocked, assigned, has tasks, last message; filters (owned/observed, source, waiting, …).
- **Conversation:** messages, events, agent notes, system actions, drafts; composer / prompt / operator notes.
- **Work items:** execution context for the thread.

### ASCII wireframe (conversation mode)

```
┌────────────────────────────┬──────────────────────────────────────────────┬─────────────────────────────────────┐
│ THREADS                    │ CONVERSATION                                 │ WORK ITEMS                          │
├────────────────────────────┼──────────────────────────────────────────────┼─────────────────────────────────────┤
│ Search [..........]      │ Acme Corp / Telegram                         │ For this thread                     │
│                            │ customer · owned · waiting reply             │                                     │
│ Inbox                      │ ──────────────────────────────────────────── │ [Task] Check order in ERP           │
│ ● Acme / Telegram waiting  │ Customer: Hi, where is my order?             │   open · bot · due now              │
│ ● John / Email · has tasks │ Agent: Let me check…                         │ [Review] Approve refund             │
│ ○ Candidate / WA observed  │ [system / internal steps not public]         │   pending · human                   │
│ ○ Internal hiring internal │ Customer: Can I change the address?        │ [Draft] Suggested reply…            │
│ Filters: owned observed…   │ Agent: I can help…                           │ Facts: order_id, customer_id, …     │
│                            │ [ composer ]                                 │ Next actions: send reply, escalate  │
└────────────────────────────┴──────────────────────────────────────────────┴─────────────────────────────────────┘
```

**Summary:** sidebar = thread queue; center = conversation timeline + internal/system context; right = actionable work, not a flat task list.

## Navigation rules

- **Thread drives context**; **WorkItem drives action**.
- Click **thread** → read (conversation focus).
- Click **work item** → **act**: center switches to **execution context**, not a generic “task card,” modal-only detail, or raw JSON.

## Two product modes

1. **Conversation mode** — `Threads | Conversation | Work items` (talk, read, react). Thread-scoped list = **local** context.
2. **Work mode** — `Threads | Work board` (triage, plan, assign). Right column **hidden or secondary**. Enter via **Expand work →**, a `[ Threads ] [ Work ]` toggle, or sidebar **Work board**.

## Global kanban (required)

A **second root view**: all work items across threads. Each card **must** show: title, **source** (Telegram, email, internal, …), **thread label**, status. Cards keep `threadIds` and `ObjectRef`s; from a card, jump to conversation or into execution.

- **Thread mode** = local context.  
- **Kanban mode** = global responsibility.

Expanding work moves the board into the **center**; the product reads as an **operational workspace**, not “chat with a task sidebar.”

## Click on a work item (unified)

**Do not:** rely on modal-only CRUD, field dumps, or a Jira clone card as the primary pattern.

**Do:** make the **center** the execution surface; keep a path back to the thread (“Show conversation” / “Go to thread”).

**`onTaskClick(taskId)`:** resolve **primary** thread → open **execution** → preload thread, messages, linked objects, task context.

- **Scenario A** — from conversation mode: center = execution; right may show adjacent detail; thread stays selected in the background.
- **Scenario B** — from global kanban: resolve the task’s thread, then the same execution view.

**Modifier:** Cmd/Ctrl+click → open **conversation mode** on that thread (power users).

## Execution by `WorkItem` kind

- **Task** — context (e.g. linked objects), actions (Open in ERP, Mark done, Reassign), link to related thread/messages.
- **Review** — **decision** UI: context, optional agent recommendation, **Approve / Reject / Ask for more info**.
- **Draft** — **publish** flow: body, **Edit / Send / Discard**.

## Work-first affordances

- **Pin work item to center** — conversation becomes secondary (link), emphasizing work over chat-first UX.
- **Agent auto-focus** — when the agent creates a task, highlight it and offer **[Open task] [Ignore]** (or equivalent).

## Next (not spec’d here)

- Formal UI **state machine** for mode transitions.
- **Drag-and-drop** on the board → status changes + side effects.
- **Multi-thread** work items (`threadIds.length > 1`) — explicit UX.
