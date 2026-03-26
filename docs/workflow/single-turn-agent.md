# Single-turn agent workflow

Use **one** workflow for chat-style turns — e.g. `runAgentTurn` — not separate `salesWorkflow`, `hrWorkflow`, `supportWorkflow`. Specialization is **profile** (instructions + allowed tools), not duplicate workflow code.

## Pattern (Vercel Workflow / `useworkflow.dev`)

- The API or DB **owns chat history**.
- Each new user message starts a workflow via `start()` from a route or server action.
- Inside the workflow, a **DurableAgent** runs the durable tool loop.
- Official docs describe this as **single-turn** session modeling: `start()` from server code; agent holds the tool loop.

**Note:** `@workflow/ai` is experimental; verify current package status before production.

**Tools as steps:** model most tools as **workflow steps** so retries and durability apply. Fits “agents differ only by instruction + tool set”: the workflow stays generic and loads a profile.

## Types

```ts
// src/agents/types.ts

import type { UIMessage } from "ai";

export type AgentId = "sales" | "hr" | "support";

export type AgentTurnInput = {
  agentId: AgentId;
  conversationId: string;
  messages: UIMessage[];
  context?: Record<string, unknown>;
  model?: string;
  maxSteps?: number;
};

export type AgentProfile = {
  id: AgentId;
  instructions:
    | string
    | ((ctx: {
        conversationId: string;
        context?: Record<string, unknown>;
      }) => Promise<string> | string);
  tools: readonly ToolKey[];
};

export type ToolKey =
  | "findOrder"
  | "createTicket"
  | "searchCandidates"
  | "scheduleInterview"
  | "handoffToHuman";
```

## Profiles

```ts
// src/agents/profiles.ts

import type { AgentProfile, AgentId } from "./types";

export const AGENT_PROFILES: Record<AgentId, AgentProfile> = {
  sales: {
    id: "sales",
    instructions: [
      "You are a sales assistant.",
      "Be concise, factual, and friendly.",
      "For order or purchase questions, use tools before asserting facts.",
      "Do not invent data.",
      "Ask if unsure.",
    ].join(" "),
    tools: ["findOrder", "handoffToHuman"],
  },

  hr: {
    id: "hr",
    instructions: [
      "You are an HR assistant.",
      "Help with vacancies, candidates, and interviews.",
      "Do not promise an offer without confirmation.",
      "Use tools when you need candidate or interview data.",
    ].join(" "),
    tools: ["searchCandidates", "scheduleInterview", "handoffToHuman"],
  },

  support: {
    id: "support",
    instructions: [
      "You are a support assistant.",
      "Stay calm and accurate.",
      "Resolve immediately when possible.",
      "Use tools for tickets or escalation.",
    ].join(" "),
    tools: ["findOrder", "createTicket", "handoffToHuman"],
  },
};

export function getAgentProfile(agentId: AgentId): AgentProfile {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) throw new Error(`Unknown agent profile: ${agentId}`);
  return profile;
}
```

## Steps

```ts
// src/agents/steps.ts

export async function findOrderStep(input: {
  conversationId: string;
  query?: string;
}) {
  "use step";
  // CRM / OMS lookup
  return {
    found: true,
    orderId: "ORD-10428",
    status: "in_transit",
    eta: "2026-03-28",
  };
}

export async function createTicketStep(input: {
  conversationId: string;
  title: string;
  description: string;
}) {
  "use step";
  return { ticketId: "SUP-8831", status: "open" };
}

export async function searchCandidatesStep(input: {
  vacancyId?: string;
  query: string;
}) {
  "use step";
  return {
    candidates: [
      { id: "cand_1", name: "Anna Petrova", score: 0.91 },
      { id: "cand_2", name: "Dmitry Sokolov", score: 0.87 },
    ],
  };
}

export async function scheduleInterviewStep(input: {
  candidateId: string;
  slotIso: string;
}) {
  "use step";
  return { ok: true, interviewId: "int_551", slotIso: input.slotIso };
}

export async function handoffToHumanStep(input: {
  conversationId: string;
  reason: string;
}) {
  "use step";
  return { ok: true, queueItemId: "q_9012", reason: input.reason };
}
```

## Tool registry

```ts
// src/agents/tools.ts — pattern: map ToolKey → AI SDK tools calling steps
```

## Workflow + API route

```ts
// src/workflows/run-agent-turn.ts

export async function runAgentTurn(input: AgentTurnInput) {
  "use workflow";
  // resolve instructions from profile, buildAgentTools, new DurableAgent({...}).stream(...)
}
```

```ts
// src/app/api/chat/route.ts

import { start } from "workflow/api";
import { runAgentTurn } from "@/workflows/run-agent-turn";

export async function POST(req: Request) {
  const body = await req.json();
  const run = await start(runAgentTurn, [/* AgentTurnInput */]);
  return new Response(run.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "x-workflow-run-id": run.runId,
    },
  });
}
```

## What to keep in one place

- One workflow: `runAgentTurn`
- One profile contract: instructions + `ToolKey[]`
- One tool registry
- One HTTP entry that calls `start()`

Role = `agentId` + profile config, not new workflow types.

## When to add hooks / multi-turn workflows

Not for baseline chat. Add when you need:

- Waiting on an external event  
- Approval / human handoff spanning time  
- Long-running operations  
- Resuming from a webhook  

Hooks let a workflow suspend and resume; that is a **layer above** `runAgentTurn`, not its replacement.
