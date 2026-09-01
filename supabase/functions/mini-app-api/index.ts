// Alsamos Mini App Developer API.
//
// Mini app o'z serveridan bevosita shu API bilan ishlaydi — bot talab qilinmaydi.
//
// Autentifikatsiya (ikkalasi ham qabul qilinadi):
//   Authorization: Bearer <client_id>:<secret>
//   X-Alsamos-Client-Id: <client_id>   +   X-Alsamos-Client-Secret: <secret>
//
// Manzil:
//   POST /functions/v1/mini-app-api/<method>
//
// Metodlar (mini app serveri uchun):
//   app.get, app.stats, updates.get, notifications.send, webhook.set,
//   webhook.delete, webhook.info, user.verify
//
// Metod (superapp / foydalanuvchi JWT bilan):
//   updates.push

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SDK_SECRET = Deno.env.get('MINI_APP_SDK_SECRET') ?? ''

const CORS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers':
		'authorization, x-client-info, apikey, content-type, x-alsamos-client-id, x-alsamos-client-secret',
	'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...CORS, 'Content-Type': 'application/json' },
	})
}

const ok = (result: unknown) => json({ ok: true, result })
const fail = (description: string, status = 400) =>
	json({ ok: false, error_code: status, description }, status)

async function rpc(
	name: string,
	args: Record<string, unknown>,
	jwt?: string,
): Promise<unknown> {
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
		const record = data as Record<string, unknown> | null
		const message =
			record && typeof record === 'object' && 'message' in record
				? String(record.message)
				: 'RPC_FAILED: ' + name
		throw new Error(message)
	}
	return data
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
): Promise<Record<string, unknown>> {
	const body = JSON.stringify(payload)
	const headers: Record<string, string> = { 'Content-Type': 'application/json' }
	if (secret) {
		headers['X-Alsamos-Signature'] = 'sha256=' + (await hmacHex(secret, body))
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

function credentialsFrom(req: Request): { clientId: string; secret: string } | null {
	const headerId = req.headers.get('x-alsamos-client-id')
	const headerSecret = req.headers.get('x-alsamos-client-secret')
	if (headerId && headerSecret) {
		return { clientId: headerId.trim(), secret: headerSecret.trim() }
	}

	const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
	if (bearer.includes(':')) {
		const separator = bearer.indexOf(':')
		const clientId = bearer.slice(0, separator).trim()
		const secret = bearer.slice(separator + 1).trim()
		if (clientId.startsWith('app_') && secret.startsWith('sk_')) {
			return { clientId, secret }
		}
	}
	return null
}

function userJwt(req: Request): string | null {
	const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
	if (!token || token === SERVICE_KEY || token.includes(':')) return null
	return token
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

function methodFrom(url: URL): string | null {
	const segments = url.pathname.split('/').filter(Boolean)
	const index = segments.indexOf('mini-app-api')
	const rest = index >= 0 ? segments.slice(index + 1) : segments
	return rest.length > 0 ? rest.join('.') : null
}

/** Mini app ichida olingan initData imzosini tekshiradi. */
async function verifyInitData(raw: string): Promise<Record<string, string> | null> {
	if (!SDK_SECRET) return null
	const params = new URLSearchParams(raw)
	const signature = params.get('signature') ?? params.get('hash')
	if (!signature) return null
	params.delete('signature')
	params.delete('hash')

	const checkString = Array.from(params.entries())
		.map(([key, value]) => key + '=' + value)
		.sort()
		.join('\n')

	const expected = await hmacHex(SDK_SECRET, checkString)
	if (expected !== signature) return null

	const result: Record<string, string> = {}
	params.forEach((value, key) => {
		result[key] = value
	})
	return result
}

Deno.serve(async (req: Request) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: CORS })
	}
	if (!SUPABASE_URL || !SERVICE_KEY) {
		return fail('SERVER_NOT_CONFIGURED', 500)
	}

	const url = new URL(req.url)
	const method = methodFrom(url)
	const body = await readBody(req)

	if (!method || method === 'health') {
		return ok({ service: 'alsamos-mini-app-api', version: '1.0.0', status: 'up' })
	}

	// --- Superapp -> mini app: update yuborish (foydalanuvchi JWT) ---
	if (method === 'updates.push') {
		const jwt = userJwt(req)
		if (!jwt) return fail('AUTH_REQUIRED', 401)

		const appId = String(body.app_id ?? '').trim()
		if (!appId) return fail('APP_ID_REQUIRED')
		const type = String(body.type ?? 'app_open')

		try {
			const pushed = (await rpc(
				'mini_app_push_update',
				{
					p_app_id: appId,
					p_type: type,
					p_payload: (body.payload as Record<string, unknown>) ?? {},
				},
				jwt,
			)) as Record<string, unknown> | null

			let delivery: unknown = { delivered: false, reason: 'no_webhook' }
			if (pushed?.webhook_url) {
				delivery = await deliverWebhook(
					String(pushed.webhook_url),
					pushed.webhook_secret ? String(pushed.webhook_secret) : null,
					{
						update_id: pushed.update_id ?? null,
						type,
						app_id: appId,
						payload: body.payload ?? {},
					},
				)
			}

			return ok({ update_id: pushed?.update_id ?? null, delivery })
		} catch (error) {
			return fail(String((error as Error)?.message ?? error), 400)
		}
	}

	// --- Mini app serveri metodlari: client_id + secret ---
	const credentials = credentialsFrom(req)
	if (!credentials) return fail('CLIENT_CREDENTIALS_REQUIRED', 401)

	let auth: Record<string, unknown> | null = null
	try {
		auth = (await rpc('mini_app_api_authenticate', {
			p_client_id: credentials.clientId,
			p_secret: credentials.secret,
		})) as Record<string, unknown> | null
	} catch (error) {
		return fail(String((error as Error)?.message ?? error), 500)
	}
	if (!auth || !auth.app_id) return fail('UNAUTHORIZED_CLIENT', 401)

	const appId = String(auth.app_id)
	const credentialId = String(auth.credential_id)

	try {
		switch (method) {
			case 'app.get':
				return ok({
					app: auth.app,
					client_id: auth.client_id,
					environment: auth.environment,
					scopes: auth.scopes,
				})

			case 'app.stats':
				return ok(await rpc('mini_app_api_stats', { p_app_id: appId }))

			case 'updates.get': {
				const updates = await rpc('mini_app_dequeue_updates', {
					p_app_id: appId,
					p_offset: Number(body.offset ?? 0) || 0,
					p_limit: Number(body.limit ?? 20) || 20,
				})
				return ok(updates ?? [])
			}

			case 'notifications.send': {
				const userId = String(body.user_id ?? '').trim()
				if (!userId) return fail('USER_ID_REQUIRED')
				const id = await rpc('mini_app_notify_user', {
					p_app_id: appId,
					p_user_id: userId,
					p_title: body.title ?? null,
					p_body: body.body ?? body.text ?? null,
					p_action_url: body.action_url ?? null,
					p_payload: (body.payload as Record<string, unknown>) ?? {},
				})
				return ok({ notification_id: id })
			}

			case 'webhook.set': {
				const target = String(body.url ?? '').trim()
				if (!/^https:\/\//i.test(target)) return fail('HTTPS_URL_REQUIRED')
				await rpc('mini_app_credential_set_webhook', {
					p_credential_id: credentialId,
					p_url: target,
					p_secret: body.secret ?? null,
				})
				return ok(true)
			}

			case 'webhook.delete':
				await rpc('mini_app_credential_set_webhook', {
					p_credential_id: credentialId,
					p_url: null,
					p_secret: null,
				})
				return ok(true)

			case 'webhook.info':
				return ok({ url: auth.webhook_url ?? null })

			case 'user.verify': {
				const raw = String(body.init_data ?? body.initData ?? '')
				if (!raw) return fail('INIT_DATA_REQUIRED')
				const verified = await verifyInitData(raw)
				if (!verified) return fail('INVALID_INIT_DATA', 401)
				if (verified.app_id && verified.app_id !== appId) {
					return fail('APP_MISMATCH', 403)
				}
				return ok({ verified: true, user_id: verified.user_id ?? null, data: verified })
			}

			default:
				return fail('UNKNOWN_METHOD: ' + method, 404)
		}
	} catch (error) {
		return fail(String((error as Error)?.message ?? error), 400)
	}
})
