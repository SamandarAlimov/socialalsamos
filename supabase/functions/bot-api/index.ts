// Alsamos Bot API — Telegram uslubidagi HTTP API.
//
// Manzil shakllari:
//   POST /functions/v1/bot-api/bot<TOKEN>/<method>
//   POST /functions/v1/bot-api/<method>      + header `X-Bot-Token: <TOKEN>`
//
// Bot metodlari (token bilan):
//   getMe, getUpdates, sendMessage, setWebhook, deleteWebhook, getWebhookInfo,
//   setMyCommands, getMiniApp, setMiniApp, answerWebAppQuery
//
// Superapp metodi (foydalanuvchi JWT bilan):
//   pushUpdate  { bot_username, type, payload }  -> botga update yuboradi
//
// Javob formati Telegram bilan bir xil: { ok: true, result } / { ok: false, description }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers':
		'authorization, x-client-info, apikey, content-type, x-bot-token',
	'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...CORS, 'Content-Type': 'application/json' },
	})
}

function ok(result: unknown): Response {
	return json({ ok: true, result })
}

function fail(description: string, status = 400): Response {
	return json({ ok: false, error_code: status, description }, status)
}

async function rpc(name: string, args: Record<string, unknown>, jwt?: string): Promise<unknown> {
	const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			apikey: SERVICE_KEY,
			Authorization: 'Bearer ' + (jwt || SERVICE_KEY),
		},
		body: JSON.stringify(args),
	})

	const text = await response.text()
	let data: unknown = null
	try {
		data = text ? JSON.parse(text) : null
	} catch {
		data = text
	}

	if (!response.ok) {
		const message =
			data && typeof data === 'object' && 'message' in (data as Record<string, unknown>)
				? String((data as Record<string, unknown>).message)
				: 'RPC_FAILED: ' + name
		throw new Error(message)
	}
	return data
}

type BotRow = {
	id: string
	username: string
	display_name: string
	description: string | null
	owner_id: string
	publisher_id: string | null
	mini_app_id: string | null
	mini_app_url: string | null
	webhook_url: string | null
	webhook_secret: string | null
	commands: unknown
	allowed_updates: unknown
}

async function hmacHex(secret: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
	return Array.from(new Uint8Array(signature))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}

async function deliverWebhook(
	url: string,
	secret: string | null,
	payload: Record<string, unknown>,
): Promise<{ delivered: boolean; status?: number; error?: string }> {
	const body = JSON.stringify(payload)
	const headers: Record<string, string> = { 'Content-Type': 'application/json' }
	if (secret) {
		headers['X-Alsamos-Bot-Signature'] = 'sha256=' + (await hmacHex(secret, body))
		headers['X-Alsamos-Bot-Secret-Token'] = secret
	}

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 10_000)
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers,
			body,
			signal: controller.signal,
		})
		return { delivered: response.ok, status: response.status }
	} catch (error) {
		return { delivered: false, error: String((error as Error)?.message ?? error) }
	} finally {
		clearTimeout(timer)
	}
}

function parseRoute(url: URL, req: Request): { token: string | null; method: string | null } {
	const segments = url.pathname.split('/').filter(Boolean)
	const index = segments.indexOf('bot-api')
	const rest = index >= 0 ? segments.slice(index + 1) : segments

	if (rest.length > 0 && /^bot.+:.+/i.test(rest[0])) {
		return { token: rest[0].slice(3), method: rest[1] ?? null }
	}

	const header = req.headers.get('x-bot-token')
	return { token: header ? header.replace(/^bot/i, '') : null, method: rest[0] ?? null }
}

function userJwt(req: Request): string | null {
	const raw = req.headers.get('authorization') ?? ''
	const token = raw.replace(/^Bearer\s+/i, '').trim()
	return token && token !== SERVICE_KEY ? token : null
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
	if (req.method === 'GET') {
		const params: Record<string, unknown> = {}
		new URL(req.url).searchParams.forEach((value, key) => {
			params[key] = value
		})
		return params
	}
	try {
		const parsed = await req.json()
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
	} catch {
		return {}
	}
}

Deno.serve(async (req: Request) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: CORS })
	}
	if (!SUPABASE_URL || !SERVICE_KEY) {
		return fail('SERVER_NOT_CONFIGURED', 500)
	}

	const url = new URL(req.url)
	const { token, method } = parseRoute(url, req)
	const body = await readBody(req)

	if (!method || method === 'health') {
		return ok({ service: 'alsamos-bot-api', version: '1.0.0', status: 'up' })
	}

	// --- Superapp -> bot: update yuborish (foydalanuvchi JWT bilan) ---
	if (method === 'pushUpdate') {
		const jwt = userJwt(req)
		if (!jwt) return fail('AUTH_REQUIRED', 401)

		const username = String(body.bot_username ?? body.username ?? '').trim()
		const type = String(body.type ?? 'message')
		if (!username) return fail('BOT_USERNAME_REQUIRED')

		try {
			const pushed = (await rpc(
				'bot_push_update',
				{
					p_username: username,
					p_type: type,
					p_payload: (body.payload as Record<string, unknown>) ?? {},
				},
				jwt,
			)) as Record<string, unknown> | null

			const webhookUrl = pushed?.webhook_url ? String(pushed.webhook_url) : null
			let delivery: unknown = { delivered: false, reason: 'no_webhook' }
			if (webhookUrl) {
				delivery = await deliverWebhook(
					webhookUrl,
					pushed?.webhook_secret ? String(pushed.webhook_secret) : null,
					{
						update_id: pushed?.update_id ?? null,
						type,
						bot_username: username,
						payload: body.payload ?? {},
					},
				)
			}

			return ok({ update_id: pushed?.update_id ?? null, delivery })
		} catch (error) {
			return fail(String((error as Error)?.message ?? error), 400)
		}
	}

	// --- Bot metodlari: token majburiy ---
	if (!token) return fail('BOT_TOKEN_REQUIRED', 401)

	let bot: BotRow | null = null
	try {
		bot = (await rpc('bot_authenticate', { p_token: token })) as BotRow | null
	} catch (error) {
		return fail(String((error as Error)?.message ?? error), 500)
	}
	if (!bot || !bot.id) return fail('UNAUTHORIZED_BOT', 401)

	try {
		switch (method) {
			case 'getMe':
				return ok({
					id: bot.id,
					is_bot: true,
					username: bot.username,
					display_name: bot.display_name,
					description: bot.description,
					mini_app_id: bot.mini_app_id,
					mini_app_url: bot.mini_app_url,
					commands: bot.commands,
				})

			case 'getUpdates': {
				const updates = await rpc('bot_dequeue_updates', {
					p_bot_id: bot.id,
					p_offset: Number(body.offset ?? 0) || 0,
					p_limit: Number(body.limit ?? 20) || 20,
				})
				return ok(updates ?? [])
			}

			case 'sendMessage':
			case 'answerWebAppQuery': {
				const userId = String(body.user_id ?? body.chat_id ?? '').trim()
				if (!userId) return fail('USER_ID_REQUIRED')
				const messageId = await rpc('bot_send_message', {
					p_bot_id: bot.id,
					p_user_id: userId,
					p_text: body.text ?? null,
					p_payload: (body.payload as Record<string, unknown>) ?? {},
					p_kind: String(body.kind ?? 'text'),
				})
				return ok({ message_id: messageId, bot_username: bot.username, user_id: userId })
			}

			case 'setWebhook': {
				const target = String(body.url ?? '').trim()
				if (!/^https:\/\//i.test(target)) return fail('HTTPS_URL_REQUIRED')
				await rpc('bot_set_webhook', {
					p_bot_id: bot.id,
					p_url: target,
					p_secret: body.secret_token ?? body.secret ?? null,
				})
				return ok(true)
			}

			case 'deleteWebhook':
				await rpc('bot_set_webhook', { p_bot_id: bot.id, p_url: null, p_secret: null })
				return ok(true)

			case 'getWebhookInfo':
				return ok({ url: bot.webhook_url, has_custom_certificate: false })

			case 'setMyCommands':
				await rpc('bot_set_commands', {
					p_bot_id: bot.id,
					p_commands: body.commands ?? [],
				})
				return ok(true)

			case 'getMiniApp':
				return ok({ mini_app_id: bot.mini_app_id, mini_app_url: bot.mini_app_url })

			case 'setMiniApp':
				await rpc('bot_set_mini_app', {
					p_bot_id: bot.id,
					p_app_id: body.mini_app_id ?? null,
					p_url: body.url ?? null,
				})
				return ok(true)

			default:
				return fail('UNKNOWN_METHOD: ' + method, 404)
		}
	} catch (error) {
		return fail(String((error as Error)?.message ?? error), 400)
	}
})
