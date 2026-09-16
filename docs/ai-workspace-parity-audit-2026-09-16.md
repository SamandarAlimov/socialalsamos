# Alsamos AI workspace parity audit — 2026-09-16

This audit compares the current Alsamos AI workspace with the product patterns documented by OpenAI and Anthropic, then maps the findings to the code and production data that exist in `socialalsamos` today.

## External reference audit

### ChatGPT

Current ChatGPT Projects are persistent workspaces rather than folders only. A project groups chats, files/sources and project instructions, and project memory can prioritize or isolate context inside the project. Existing chats can be moved into a project. Shared projects use project-only memory so collaborators do not leak personal context into the shared workspace.

ChatGPT also treats connected apps/plugins as first-class tool/data providers inside conversations, and its modern workspace UI keeps Projects directly discoverable rather than hiding project management inside a chat-only control.

References:
- https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- https://help.openai.com/en/articles/11487775-connectors-in-chatgpt
- https://help.openai.com/en/articles/20001256/

### Claude

Claude Projects are self-contained workspaces with their own chat history, project knowledge and project instructions. Paid project knowledge can use RAG as the knowledge base grows. Claude also exposes Artifacts as persistent, dedicated work surfaces for documents, code, HTML, SVG, diagrams and interactive React experiences, and Connectors/MCP as first-class external tools whose permissions follow the signed-in user.

References:
- https://support.claude.com/en/articles/9517075-what-are-projects
- https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities

## Alsamos audit

### What is already strong

Alsamos is not starting from a basic chatbot. The current stack already has:

- streaming multi-round agent execution (`supabase/functions/ai-agent`),
- web search/fetch, image/video generation, code execution, Alsamos first-party tools, connectors/MCP and computer tasks,
- GitHub context/actions in the web client,
- durable AI memories,
- artifacts extracted from conversations,
- account-backed conversations,
- `ai_projects` plus `ai_conversations.project_id`,
- project instructions injected into the AI context,
- file attachments, model selection and tool controls.

### P0 problems found

1. **AI workspace wastes horizontal space.** The platform sidebar can remain 256px wide while the AI sidebar is another 280–300px. On a wide desktop this creates a double-navigation wall; on smaller desktop/tablet widths the chat becomes cramped.
2. **Projects exist in code and production DB but are effectively hidden.** `/projects` and `public.ai_projects` already exist, but the main navigation does not expose Projects, so users reasonably conclude that there is no Projects page.
3. **The Oracle/K3s browser path is CORS-fragile.** The browser calls `https://api.alsamos.com/ai/api/alsamos/agent` directly. Production screenshots show failed OPTIONS/preflight requests with no `Access-Control-Allow-Origin`. Browser-to-external-agent traffic should go through a same-origin Alsamos Vercel proxy so CORS cannot take down the fallback agent or sandbox.
4. **Image-generation defaults contain retired Google models.** The fallback list still contains `gemini-3-pro-image-preview` and Imagen 4 even though those endpoints have been retired. Current Gemini image models need to be first in the candidate list.
5. **AI failures can degrade too hard.** A rich-agent/provider failure can become a dead-end error even though a basic assistant fallback exists. The client should reserve external fallback for availability failures and preserve a usable chat path.

### P1 parity gaps

- Project management should feel like a first-class destination: search, create, list, open and edit should be obvious from the main shell.
- Project knowledge is still weaker than ChatGPT/Claude: project instructions and project chats exist, but there is no first-class project knowledge library/RAG workflow yet.
- Artifacts are conversation-derived rather than a durable account-level artifact collection with versioning/publishing.
- Shared/collaborative projects and project-only memory controls are not implemented.
- Tool health should be observable in-product so a provider outage is distinguishable from a prompt error.

## This implementation tranche

The production-safe scope for this change is deliberately focused on the highest-impact issues without inventing fake collaboration or weakening RLS:

1. collapse the platform sidebar automatically inside the AI workspace so the AI sidebar becomes the primary navigation surface;
2. expose Projects as a first-class navigation destination and keep `/projects` backed by the existing production `ai_projects` table;
3. proxy Oracle agent and sandbox requests through same-origin Vercel functions to remove the browser CORS failure mode;
4. refresh Gemini image/video model candidates to current model families;
5. keep Supabase project ownership/RLS unchanged because the existing schema already supports the requested personal Projects workflow.

## Follow-up parity work

A later schema-backed tranche should add project knowledge files/chunks + embeddings/RAG, explicit project memory mode, artifact persistence/versioning, and secure project membership/sharing. Those features require new RLS contracts and should not be represented in the UI until the underlying authorization model exists.
