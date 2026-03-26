# Documentation index

English architecture and product notes for this repo.

| Doc | Topic |
| --- | ----- |
| [runtime.md](./runtime.md) | Inbound → domain → agent → tools → outbound; links UI modes |
| **Architecture** | |
| [architecture/connector-archetypes.md](./architecture/connector-archetypes.md) | Base types, channel / resource / file / service archetypes |
| [architecture/installations-and-registry.md](./architecture/installations-and-registry.md) | Installations, `InstallationRepo`, `ConnectorRegistry` |
| [architecture/platform-ports-and-tool-runtime.md](./architecture/platform-ports-and-tool-runtime.md) | Port types, external `ToolRuntime` |
| [architecture/connector-driver-examples.md](./architecture/connector-driver-examples.md) | Telegram, CRM, ATS, S3, OCR, registry bootstrap |
| [architecture/semantic-agent-tools.md](./architecture/semantic-agent-tools.md) | External vs domain tools, `AgentRuntime`, v1 tool budget |
| **Product** | |
| [product/thread-workspace-ux.md](./product/thread-workspace-ux.md) | Three-column layout, modes, kanban, execution UX |
| [product/thread-work-items-model.md](./product/thread-work-items-model.md) | `Thread`, `Message`, `WorkItem`, `ThreadExternalLink`, services, integration touchpoints |
| **Workflow** | |
| [workflow/single-turn-agent.md](./workflow/single-turn-agent.md) | Single-turn chat + DurableAgent pattern |
| **Ingress** | |
| [ingress/generic-webhook-dispatch.md](./ingress/generic-webhook-dispatch.md) | One webhook route, registry, outbound dispatch |
