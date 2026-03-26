Да. Тогда workflow должен быть один: не salesWorkflow, hrWorkflow, supportWorkflow, а runAgentTurn.
Для сценария “пишем агенту как в ChatGPT” самый чистый базовый паттерн у useworkflow.dev — single-turn workflow: API хранит историю диалога, на каждый новый пользовательский ход запускает новый workflow через start(), а внутри workflow работает DurableAgent. В официальных docs это как раз описано как single-turn chat session modeling; там же сказано, что start() запускается из API route/server code, а DurableAgent держит durable tool-call loop. Ещё важная оговорка: пакет @workflow/ai сейчас помечен как experimental.  ￼

И ещё один важный принцип из docs: большинство tools лучше моделировать как steps. Это хорошо подходит под твою модель “агент отличается только инструкцией и набором tools”: сам workflow не знает ничего про Sales/HR/Support, он просто берёт профиль агента и собирает разрешённые tools.  ￼

Ниже каркас, который я бы реально оставил как основу.

⸻

src/agents/types.ts

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


⸻

src/agents/profiles.ts

import type { AgentProfile, AgentId } from "./types";

export const AGENT_PROFILES: Record<AgentId, AgentProfile> = {
  sales: {
    id: "sales",
    instructions: [
      "Ты sales-ассистент.",
      "Отвечай кратко, по делу и дружелюбно.",
      "Если вопрос про заказ или покупку, сначала проверь данные через доступные tools.",
      "Не придумывай факты.",
      "Если не уверен — уточни.",
    ].join(" "),
    tools: ["findOrder", "handoffToHuman"],
  },

  hr: {
    id: "hr",
    instructions: [
      "Ты HR-ассистент.",
      "Помогай по вакансиям, кандидатам и интервью.",
      "Не обещай оффер без подтверждения.",
      "Если нужны данные по кандидату или слоту интервью — используй tools.",
    ].join(" "),
    tools: ["searchCandidates", "scheduleInterview", "handoffToHuman"],
  },

  support: {
    id: "support",
    instructions: [
      "Ты support-ассистент.",
      "Помогай решать проблемы клиента спокойно и точно.",
      "Если можно решить вопрос сразу — решай.",
      "Если нужен тикет или эскалация — используй tools.",
    ].join(" "),
    tools: ["findOrder", "createTicket", "handoffToHuman"],
  },
};

export function getAgentProfile(agentId: AgentId): AgentProfile {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) throw new Error(`Unknown agent profile: ${agentId}`);
  return profile;
}


⸻

src/agents/steps.ts

export async function findOrderStep(input: {
  conversationId: string;
  query?: string;
}) {
  "use step";

  // Реальный lookup в CRM / OMS
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

  // Реальное создание тикета
  return {
    ticketId: "SUP-8831",
    status: "open",
  };
}

export async function searchCandidatesStep(input: {
  vacancyId?: string;
  query: string;
}) {
  "use step";

  // Реальный поиск по ATS / HRIS
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

  // Реальное бронирование интервью
  return {
    ok: true,
    interviewId: "int_551",
    slotIso: input.slotIso,
  };
}

export async function handoffToHumanStep(input: {
  conversationId: string;
  reason: string;
}) {
  "use step";

  // Постановка в очередь оператору / рекрутеру / саппорту
  return {
    ok: true,
    queueItemId: "q_9012",
    reason: input.reason,
  };
}


⸻

src/agents/tools.ts

import { z } from "zod";
import type { ToolKey } from "./types";
import {
  createTicketStep,
  findOrderStep,
  handoffToHumanStep,
  scheduleInterviewStep,
  searchCandidatesStep,
} from "./steps";

type ToolFactoryContext = {
  conversationId: string;
};

type ToolFactory = (ctx: ToolFactoryContext) => Record<string, unknown>;

const TOOL_REGISTRY: Record<ToolKey, ToolFactory> = {
  findOrder: ({ conversationId }) => ({
    findOrder: {
      description: "Найти заказ клиента во внутренней системе",
      inputSchema: z.object({
        query: z.string().optional(),
      }),
      execute: async ({ query }: { query?: string }) => {
        return findOrderStep({ conversationId, query });
      },
    },
  }),

  createTicket: ({ conversationId }) => ({
    createTicket: {
      description: "Создать тикет поддержки",
      inputSchema: z.object({
        title: z.string(),
        description: z.string(),
      }),
      execute: async (input: { title: string; description: string }) => {
        return createTicketStep({
          conversationId,
          title: input.title,
          description: input.description,
        });
      },
    },
  }),

  searchCandidates: () => ({
    searchCandidates: {
      description: "Найти кандидатов по вакансии или запросу",
      inputSchema: z.object({
        vacancyId: z.string().optional(),
        query: z.string(),
      }),
      execute: async (input: { vacancyId?: string; query: string }) => {
        return searchCandidatesStep(input);
      },
    },
  }),

  scheduleInterview: () => ({
    scheduleInterview: {
      description: "Забронировать интервью",
      inputSchema: z.object({
        candidateId: z.string(),
        slotIso: z.string(),
      }),
      execute: async (input: { candidateId: string; slotIso: string }) => {
        return scheduleInterviewStep(input);
      },
    },
  }),

  handoffToHuman: ({ conversationId }) => ({
    handoffToHuman: {
      description: "Передать разговор человеку",
      inputSchema: z.object({
        reason: z.string(),
      }),
      execute: async ({ reason }: { reason: string }) => {
        return handoffToHumanStep({ conversationId, reason });
      },
    },
  }),
};

export function buildAgentTools(input: {
  conversationId: string;
  enabled: readonly ToolKey[];
}) {
  const tools: Record<string, unknown> = {};

  for (const key of input.enabled) {
    Object.assign(
      tools,
      TOOL_REGISTRY[key]({ conversationId: input.conversationId })
    );
  }

  return tools;
}


⸻

src/workflows/run-agent-turn.ts

import { DurableAgent } from "@workflow/ai/agent";
import { convertToModelMessages, type UIMessageChunk } from "ai";
import { getWritable } from "workflow";

import type { AgentTurnInput } from "@/agents/types";
import { getAgentProfile } from "@/agents/profiles";
import { buildAgentTools } from "@/agents/tools";

async function resolveInstructions(input: AgentTurnInput): Promise<string> {
  const profile = getAgentProfile(input.agentId);

  if (typeof profile.instructions === "string") {
    return profile.instructions;
  }

  return await profile.instructions({
    conversationId: input.conversationId,
    context: input.context,
  });
}

export async function runAgentTurn(input: AgentTurnInput) {
  "use workflow";

  const profile = getAgentProfile(input.agentId);
  const instructions = await resolveInstructions(input);
  const tools = buildAgentTools({
    conversationId: input.conversationId,
    enabled: profile.tools,
  });

  const writable = getWritable<UIMessageChunk>();

  const agent = new DurableAgent({
    model: input.model ?? "openai/gpt-5.4",
    instructions,
    tools,
  });

  const result = await agent.stream({
    messages: await convertToModelMessages(input.messages),
    writable,
    maxSteps: input.maxSteps ?? 8,
  });

  return {
    messages: result.messages,
  };
}


⸻

src/app/api/chat/route.ts

import { start } from "workflow/api";
import { runAgentTurn } from "@/workflows/run-agent-turn";

type ChatRequest = {
  conversationId: string;
  agentId: "sales" | "hr" | "support";
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    parts: unknown[];
  }>;
};

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequest;

  const run = await start(runAgentTurn, [
    {
      conversationId: body.conversationId,
      agentId: body.agentId,
      messages: body.messages,
    },
  ]);

  return new Response(run.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "x-workflow-run-id": run.runId,
    },
  });
}


⸻

Почему это уже нормальная форма

Здесь нет salesWorkflow, hrWorkflow, supportWorkflow.

Есть только:
	•	один workflow — runAgentTurn
	•	один контракт профиля — instructions + tools
	•	один registry tools
	•	один route

Роль агента меняется только конфигом:

agentId: "sales" | "hr" | "support"

Именно это лучше всего совпадает с твоей формулировкой “агент отличается только инструкцией и тулами”.

Что я бы зафиксировал архитектурно

Для “пишем агенту как в ChatGPT” я бы держал именно такую модель:
	•	chat history хранится в твоей БД;
	•	каждый новый user turn запускает один и тот же workflow через start();
	•	workflow только исполняет текущий LLM/tool loop;
	•	специализация агента живёт в profile registry, а не в коде workflow.

Это соответствует официальному single-turn chat pattern у useworkflow.dev: клиент или API владеет историей разговора, а workflow исполняет отдельный turn. start() для этого и предназначен, а DurableAgent — их базовый примитив для durable agent loop.  ￼

Когда добавлять hooks и multi-turn workflow

Не в базовый чат.

Их стоит включать только когда реально нужен один из таких сценариев:
	•	ожидание внешнего события;
	•	approval / human handoff;
	•	многочасовая или многодневная операция;
	•	реакция на webhook от внешней системы.

Hooks в useworkflow.dev именно для этого: workflow может приостановиться и быть продолжен позже внешними данными. Но это уже отдельный слой поверх базового runAgentTurn, а не основа всего чата.  ￼
