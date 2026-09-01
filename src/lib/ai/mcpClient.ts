/**
 * MCP KLIENTI — brauzerdan to'g'ridan-to'g'ri.
 *
 * Maqsad: GitHub'ni ulagandek sodda tarzda istalgan MCP serverini ulash.
 * Foydalanuvchi server URL va (kerak bo'lsa) bearer tokenni kiritadi — shu zahoti
 * o'sha serverning vositalari chatda ishlatiladigan bo'ladi. Supabase funksiyasi
 * deploy qilinishini kutish shart emas: so'rov brauzerdan ketadi.
 *
 * Protokol: MCP Streamable HTTP (JSON-RPC 2.0 POST). Server javobni oddiy JSON
 * yoki SSE (text/event-stream) ko'rinishida qaytarishi mumkin — ikkalasi ham
 * qo'llab-quvvatlanadi.
 */

const SERVERS_KEY = 'alsamos.mcp.servers';
const TOOLS_KEY = 'alsamos.mcp.tools';
const PROTOCOL_VERSION = '2025-06-18';

export type McpServer = {
  id: string;
  name: string;
  url: string;
  /** Bearer token — faqat shu brauzerda saqlanadi. */
  token?: string;
  enabled: boolean;
  addedAt: number;
};

export type McpTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpCallResult = {
  ok: boolean;
  text: string;
  data?: unknown;
};

/* ------------------------------- saqlash --------------------------------- */

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* kvota to'lgan bo'lishi mumkin — e'tiborsiz */
  }
}

export function listMcpServers(): McpServer[] {
  return readJson<McpServer[]>(SERVERS_KEY, []);
}

export function saveMcpServer(server: Omit<McpServer, 'id' | 'addedAt'> & { id?: string }): McpServer {
  const servers = listMcpServers();
  const existing = server.id ? servers.find((s) => s.id === server.id) : undefined;

  const saved: McpServer = {
    id: existing?.id || crypto.randomUUID(),
    name: server.name.trim() || 'MCP server',
    url: server.url.trim().replace(/\/+$/, ''),
    token: server.token?.trim() || undefined,
    enabled: server.enabled ?? true,
    addedAt: existing?.addedAt || Date.now(),
  };

  const next = existing
    ? servers.map((s) => (s.id === saved.id ? saved : s))
    : [...servers, saved];
  writeJson(SERVERS_KEY, next);
  return saved;
}

export function removeMcpServer(id: string): void {
  writeJson(
    SERVERS_KEY,
    listMcpServers().filter((s) => s.id !== id),
  );
  const cache = readJson<Record<string, McpTool[]>>(TOOLS_KEY, {});
  delete cache[id];
  writeJson(TOOLS_KEY, cache);
}

export function cachedTools(serverId: string): McpTool[] {
  return readJson<Record<string, McpTool[]>>(TOOLS_KEY, {})[serverId] || [];
}

function cacheTools(serverId: string, tools: McpTool[]): void {
  const cache = readJson<Record<string, McpTool[]>>(TOOLS_KEY, {});
  cache[serverId] = tools;
  writeJson(TOOLS_KEY, cache);
}

/* ------------------------------- transport -------------------------------- */

let requestId = 0;

/** Javob SSE bo'lsa — `data:` qatorlaridan JSON-RPC natijasini ajratib oladi. */
function parseSse(text: string): Record<string, unknown> | null {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      if ('result' in parsed || 'error' in parsed) return parsed;
    } catch {
      /* keyingi qatorga o'tamiz */
    }
  }
  return null;
}

async function rpc<T>(
  server: Pick<McpServer, 'url' | 'token'>,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  requestId += 1;

  let response: Response;
  try {
    response = await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL_VERSION,
        ...(server.token ? { Authorization: `Bearer ${server.token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
    });
  } catch {
    // Eng ko'p uchraydigan sabab — serverda CORS ochilmagan.
    throw new Error(
      'Serverga ulanib bo\u2018lmadi. URL to\u2018g\u2018riligini va serverda CORS ruxsat etilganini tekshiring.',
    );
  }

  const raw = await response.text();

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Token qabul qilinmadi (401/403). Kalitni tekshiring.');
    }
    throw new Error(`MCP server xatosi (HTTP ${response.status}).`);
  }

  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    json = parseSse(raw);
  }

  if (!json) throw new Error('Serverdan tushunarsiz javob keldi.');

  const error = json.error as { message?: string; code?: number } | undefined;
  if (error) throw new Error(error.message || `MCP xatosi (${error.code ?? '?'})`);

  return json.result as T;
}

/* -------------------------------- amallar --------------------------------- */

/** Ulanishni tekshiradi va vositalar ro'yxatini qaytaradi. */
export async function testMcpServer(
  url: string,
  token?: string,
): Promise<{ serverName: string; tools: McpTool[] }> {
  const target = { url: url.trim().replace(/\/+$/, ''), token: token?.trim() || undefined };

  const init = await rpc<{ serverInfo?: { name?: string } }>(target, 'initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'Alsamos AI', version: '1.0.0' },
  });

  const listed = await rpc<{ tools?: McpTool[] }>(target, 'tools/list', {});

  return {
    serverName: init?.serverInfo?.name || 'MCP server',
    tools: listed?.tools || [],
  };
}

/** Serverning vositalarini yangilaydi va keshga yozadi. */
export async function refreshMcpTools(server: McpServer): Promise<McpTool[]> {
  const listed = await rpc<{ tools?: McpTool[] }>(server, 'tools/list', {});
  const tools = listed?.tools || [];
  cacheTools(server.id, tools);
  return tools;
}

/** Vositani chaqiradi va natijani matn ko'rinishida qaytaradi. */
export async function callMcpTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<McpCallResult> {
  try {
    const result = await rpc<{
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: unknown;
      isError?: boolean;
    }>(server, 'tools/call', { name: toolName, arguments: args });

    const text = (result?.content || [])
      .map((item) => (item.type === 'text' ? item.text || '' : `[${item.type}]`))
      .filter(Boolean)
      .join('\n');

    return {
      ok: !result?.isError,
      text: text || 'Vosita natija qaytarmadi.',
      data: result?.structuredContent,
    };
  } catch (error) {
    return {
      ok: false,
      text: error instanceof Error ? error.message : 'Vosita chaqirig\u2018i muvaffaqiyatsiz.',
    };
  }
}

/** Nomi bo'yicha vositani topadi (qaysi serverda ekanini ham qaytaradi). */
export function findMcpTool(toolName: string): { server: McpServer; tool: McpTool } | null {
  for (const server of listMcpServers()) {
    if (!server.enabled) continue;
    const tool = cachedTools(server.id).find((t) => t.name === toolName);
    if (tool) return { server, tool };
  }
  return null;
}

/** Brain kontekstiga qo'shiladigan blok — AI ulangan MCP vositalarini bilsin. */
export function mcpContextBlock(): string {
  const servers = listMcpServers().filter((s) => s.enabled);
  if (servers.length === 0) return '';

  const lines: string[] = ['[ULANGAN MCP SERVERLARI]'];
  for (const server of servers) {
    const tools = cachedTools(server.id);
    lines.push(`- ${server.name} (${tools.length} ta vosita)`);
    for (const tool of tools.slice(0, 12)) {
      const description = (tool.description || '').replace(/\s+/g, ' ').slice(0, 110);
      lines.push(`  \u2022 ${tool.name}${description ? `: ${description}` : ''}`);
    }
    if (tools.length > 12) lines.push(`  \u2022 … va yana ${tools.length - 12} ta`);
  }
  lines.push(
    'Bu vositalar REAL ishlaydi. Foydalanuvchi shu servislar bilan bog\u2018liq ish so\u2018rasa,',
    'imkoniyating yo\u2018qligini aytma — qaysi vosita kerakligini ayt va natijani izohla.',
  );
  return lines.join('\n');
}
