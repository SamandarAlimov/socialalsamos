# Alsamos AI workspace parity audit — 2026-09-16

This audit compares the current Alsamos AI workspace with the current product patterns documented by OpenAI and Anthropic, then maps the findings to the code and production data that exist in `socialalsamos`.

## External reference audit

### ChatGPT

ChatGPT Projects are persistent workspaces rather than folders only. A project groups chats, files/sources and project instructions. Project memory can be default or project-only, and existing chats can be moved into a project. Shared projects are isolated from members' personal context and use project-only memory.

The important UX pattern is that **Projects is a first-class destination**: opening Projects goes to a dedicated Projects page where the user searches, creates and opens projects. Project membership is not represented as an artificial "all chats" item inside the Projects list.

References:
- https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- https://help.openai.com/en/articles/20001052
- https://help.openai.com/en/articles/20001275/

### Claude

Claude Projects are self-contained workspaces with their own chat history, project knowledge, project instructions and project-scoped memory. Project knowledge can automatically use RAG on eligible plans as it grows. Claude also exposes Artifacts as dedicated reusable work surfaces and Connectors/MCP as first-class external tools whose access follows the signed-in user's permissions.

References:
- https://support.claude.com/en/articles/9517075-what-are-projects
- https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects
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
- project instructions injected into AI context,
- file attachments, model selection and tool controls.

Production `ai_projects` and `ai_conversations` both have RLS enabled and owner policies based on `auth.uid()`. The existing personal Projects workflow therefore does not require a new database schema.

### P0 problems found

1. **AI workspace wastes horizontal space.** The platform sidebar can be 256px while the AI sidebar is another 280–300px, leaving too little space for the actual workspace.
2. **Projects navigation behaves like an accordion instead of a destination.** Clicking `Loyihalar` does not open the dedicated `/projects` page even though that page and the production table already exist.
3. **`Barcha suhbatlar` is incorrectly placed inside the Projects tree.** It is a chat scope, not a project. The Projects subtree should contain real projects only.
4. **The Projects page does not visually behave like a workspace index.** It needs a dedicated list/search/create surface similar to the established ChatGPT/Claude Projects pattern.
5. **The browser has a CORS-fragile private-agent path.** Browser calls to `api.alsamos.com` can fail at OPTIONS/preflight. Private runner/sandbox traffic must be server-to-server rather than browser-to-infrastructure.
6. **Image/video fallback defaults contain retired model names.** Current Gemini/Veo model families should be tried first.

### P1 parity gaps

- Project knowledge is still weaker than ChatGPT/Claude: project instructions and project chats exist, but there is no first-class project knowledge library/RAG workflow yet.
- Project-only/default memory controls are not yet exposed per project.
- Artifacts are conversation-derived rather than a durable account-level artifact collection with version history/publishing.
- Shared/collaborative projects and membership RLS are not implemented.
- Tool health should be observable in-product so a provider outage is distinguishable from a prompt/tool error.

## This implementation tranche

The production-safe scope of PR #159 focuses on the highest-impact problems without inventing fake collaboration or weakening RLS:

1. collapse the platform sidebar automatically in `/ai` and `/projects` so AI content gets substantially more width;
2. expose Projects in the main navigation;
3. make the AI-sidebar `Loyihalar` row navigate to `/projects` instead of expanding/collapsing;
4. remove `Barcha suhbatlar` from the Projects subtree so that subtree contains **projects only**;
5. keep real projects visible in the AI sidebar and let project rows open their scoped AI workspace;
6. redesign `/projects` as a first-class list page with search, create, modified-time sorting, edit/delete and direct project opening;
7. keep browser AI traffic on Supabase Edge endpoints; `ai-agent` and `code-sandbox` perform private runner/sandbox work server-to-server, avoiding the direct browser CORS failure without adding Vercel functions;
8. refresh Gemini image/video model candidates to current model families.

## Follow-up parity work

The next schema-backed tranche should add project knowledge files/chunks + embeddings/RAG, explicit project memory mode, durable/versioned artifacts, and secure project membership/sharing. Those features require new RLS contracts and should not be represented in the UI until the underlying authorization model exists.
