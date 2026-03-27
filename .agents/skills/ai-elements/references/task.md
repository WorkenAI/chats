# Task

A collapsible task list component for displaying **AI workflow progress** in the conversation: status indicators, optional descriptions, and file chips. Use it so the **agent’s actions are visible** while they run—not only the final reply.

See `scripts/task.tsx` for the stock example.

## Agent actions → visualization + Work Items (this product)

**Thread** holds messages; **WorkItem** is the execution unit ([thread-work-items-model](../../../../docs/product/thread-work-items-model.md)). The workspace UX puts work in the **right panel** and execution flow—not “chat only” ([thread-workspace-ux](../../../../docs/product/thread-workspace-ux.md)).

### Naming (do not confuse)

| Layer | Name | Meaning |
| ----- | ---- | ------- |
| **AI Elements (UI)** | `Task`, `TaskTrigger`, `TaskContent`, `TaskItem`, `TaskItemFile` | In-chat **progress / checklist** UI. |
| **Domain** | `WorkItem` = `TaskItem` \| `ReviewItem` \| `DraftItem` | **Durable** unit of work, `threadIds[]`, status, assignee—backed by `WorkItemService`. |

The shadcn **Task** block is for **visualization**; domain **tasks** are **`TaskItem`** work items.

### Rule: artifacts belong in Work Items

When the agent (or system) **creates something that outlives a single message**—a follow-up task, a review gate, a draft reply, a generated file worth tracking, or any other **thread artifact**—it must be represented as a **`WorkItem`** linked to the current thread (`threadIds` including that thread’s id). Do **not** leave those only as chat text or ephemeral UI state.

Typical mapping:

| Artifact | Domain home | In-chat visualization |
| -------- | ----------- | --------------------- |
| “Do X for this case” | `WorkItemService.createTask` → **`TaskItem`** | Optional `Task` group or tool step: “Created task …” |
| “Human must approve” | `createReview` → **`ReviewItem`** | Progress line + link/open in right panel |
| Suggested reply / CRM payload | `createDraft` → **`DraftItem`** | Draft preview + **Send / Discard** in execution UX |
| Generated file (report, export, spreadsheet) | Prefer **`DraftItem`** (e.g. payload with `fileId` / URL) or attach metadata on a **`TaskItem`** so it appears under **Work items**, not only inside a bubble | `TaskItemFile` or attachment row in `Task` while streaming |

Domain tools live on **`WorkItemService`** and related services—not on channel drivers. See [semantic-agent-tools](../../../../docs/architecture/semantic-agent-tools.md) and [runtime](../../../../docs/runtime.md).

### Two channels: persist, then mirror

1. **Persist** — Tool executes → `WorkItemService` (or equivalent) creates/updates **`WorkItem`** for the thread. This powers the **right panel**, kanban, and execution view.
2. **Visualize** — Same turn streams **structured progress** into the thread using:
   - **`Task` / `TaskItem`** for step lists and file chips, and/or
   - AI SDK **tool-call / tool-result** UI, and/or
   - Custom **`data-*` message parts** (as in this repo’s web chat bubbles).

The in-chat `Task` list should **reflect** real steps: when a domain **`TaskItem`** is created, add a matching line in the UI (and optionally **highlight / “Open task”** per [thread-workspace-ux](../../../../docs/product/thread-workspace-ux.md) § Agent auto-focus).

### Prompt / schema hints for coding agents

- Extend streamed object or tool schemas with **`workItemId`** / **`kind`: task | review | draft** when mirroring domain rows.
- Keep **status** aligned: UI `pending` → `in_progress` → `completed` should match or derive from **`WorkItem.status`** (`open`, `pending`, `in_progress`, `done`, …) where possible.

---

## Installation

```bash
npx ai-elements@latest add task
```

## Usage with AI SDK

Build a mock async programming agent using [`experimental_generateObject`](/docs/reference/ai-sdk-ui/use-object).

Add the following component to your frontend:

```tsx title="app/page.tsx"
"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import {
  Task,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
  TaskContent,
} from "@/components/ai-elements/task";
import { Button } from "@/components/ui/button";
import { tasksSchema } from "@/app/api/task/route";
import {
  SiReact,
  SiTypescript,
  SiJavascript,
  SiCss,
  SiHtml5,
  SiJson,
  SiMarkdown,
} from "@icons-pack/react-simple-icons";

const iconMap = {
  react: { component: SiReact, color: "#149ECA" },
  typescript: { component: SiTypescript, color: "#3178C6" },
  javascript: { component: SiJavascript, color: "#F7DF1E" },
  css: { component: SiCss, color: "#1572B6" },
  html: { component: SiHtml5, color: "#E34F26" },
  json: { component: SiJson, color: "#000000" },
  markdown: { component: SiMarkdown, color: "#000000" },
};

const TaskDemo = () => {
  const { object, submit, isLoading } = useObject({
    api: "/api/agent",
    schema: tasksSchema,
  });

  const handleSubmit = (taskType: string) => {
    submit({ prompt: taskType });
  };

  const renderTaskItem = (item: any, index: number) => {
    if (item?.type === "file" && item.file) {
      const iconInfo = iconMap[item.file.icon as keyof typeof iconMap];
      if (iconInfo) {
        const IconComponent = iconInfo.component;
        return (
          <span className="inline-flex items-center gap-1" key={index}>
            {item.text}
            <TaskItemFile>
              <IconComponent
                color={item.file.color || iconInfo.color}
                className="size-4"
              />
              <span>{item.file.name}</span>
            </TaskItemFile>
          </span>
        );
      }
    }
    return item?.text || "";
  };

  return (
    <div className="max-w-4xl mx-auto p-6 relative size-full rounded-lg border h-[600px]">
      <div className="flex flex-col h-full">
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            onClick={() => handleSubmit("React component development")}
            disabled={isLoading}
            variant="outline"
          >
            React Development
          </Button>
        </div>

        <div className="flex-1 overflow-auto space-y-4">
          {isLoading && !object && (
            <div className="text-muted-foreground">Generating tasks...</div>
          )}

          {object?.tasks?.map((task: any, taskIndex: number) => (
            <Task key={taskIndex} defaultOpen={taskIndex === 0}>
              <TaskTrigger title={task.title || "Loading..."} />
              <TaskContent>
                {task.items?.map((item: any, itemIndex: number) => (
                  <TaskItem key={itemIndex}>
                    {renderTaskItem(item, itemIndex)}
                  </TaskItem>
                ))}
              </TaskContent>
            </Task>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TaskDemo;
```

Add the following route to your backend:

```ts title="app/api/agent.ts"
import { streamObject } from "ai";
import { z } from "zod";

export const taskItemSchema = z.object({
  type: z.enum(["text", "file"]),
  text: z.string(),
  file: z
    .object({
      name: z.string(),
      icon: z.string(),
      color: z.string().optional(),
    })
    .optional(),
});

export const taskSchema = z.object({
  title: z.string(),
  items: z.array(taskItemSchema),
  status: z.enum(["pending", "in_progress", "completed"]),
});

export const tasksSchema = z.object({
  tasks: z.array(taskSchema),
});

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const result = streamObject({
    model: "openai/gpt-4o",
    schema: tasksSchema,
    prompt: `You are an AI assistant that generates realistic development task workflows. Generate a set of tasks that would occur during ${prompt}.

    Each task should have:
    - A descriptive title
    - Multiple task items showing the progression
    - Some items should be plain text, others should reference files
    - Use realistic file names and appropriate file types
    - Status should progress from pending to in_progress to completed

    For file items, use these icon types: 'react', 'typescript', 'javascript', 'css', 'html', 'json', 'markdown'

    Generate 3-4 tasks total, with 4-6 items each.`,
  });

  return result.toTextStreamResponse();
}
```

In a **full product** flow, the same structured steps should tie to **`WorkItemService`** creates/updates for the active thread; the demo above is UI-only until those tools exist.

## Features

- Visual icons for pending, in-progress, completed, and error states
- Expandable content for task descriptions and additional information
- Built-in progress counter showing completed vs total tasks
- Optional progressive reveal of tasks with customizable timing
- Support for custom content within task items
- Full type safety with proper TypeScript definitions
- Keyboard navigation and screen reader support

## Props

### `<Task />`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultOpen` | `boolean` | `true` | Whether the task is open by default. |
| `...props` | `React.ComponentProps<typeof Collapsible>` | - | Any other props are spread to the root Collapsible component. |

### `<TaskTrigger />`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | Required | The title of the task that will be displayed in the trigger. |
| `...props` | `React.ComponentProps<typeof CollapsibleTrigger>` | - | Any other props are spread to the CollapsibleTrigger component. |

### `<TaskContent />`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `...props` | `React.ComponentProps<typeof CollapsibleContent>` | - | Any other props are spread to the CollapsibleContent component. |

### `<TaskItem />`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `...props` | `React.ComponentProps<` | - | Any other props are spread to the underlying div. |

### `<TaskItemFile />`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `...props` | `React.ComponentProps<` | - | Any other props are spread to the underlying div. |
