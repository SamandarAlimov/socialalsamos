// Mini App proksisi (same-origin). Maqsad: mini app SUPERAPP ICHIDA ochilsin.
//
// Qabul qilinadigan URL shakllari:
//   1) /mp/<host>/<path>?<query>         -> vercel.json rewrite orqali (ASOSIY)
//   2) /api/mini-app-proxy?u=<encoded>   -> to'g'ridan-to'g'ri (test/zaxira)
//   3) /api/mp/<host>/<path>             -> zaxira (api/mp/[...path].ts)
//   4) /mp/health                        -> holat tekshiruvi
//
// Nega path shaklida? Chunki `<base href>` bilan nisbiy va host-ichidagi
// resurslar (Next.js `_next/static/...` chunk'lari, CSS, rasm, XHR) ham
// proksi ustidan yuklanadi. `?url=` shaklida bu ishlamaydi.

const FETCH_TIMEOUT_MS = 15000
const MAX_REDIRECTS = 5
const MAX_BYTES = 4 * 1024 * 1024
const PUBLIC_PREFIX = '/mp/'
const UA =
	'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'

const STRIP_HEADERS = new Set([
	'x-frame-options',
	'content-security-policy',
	'content-security-policy-report-only',
	'cross-origin-opener-policy',
	'cross-origin-embedder-policy',
	'cross-origin-resource-policy',
	'permissions-policy',
	'feature-policy',
	'report-to',
	'nel',
	'clear-site-data',
	'strict-transport-security',
	'content-encoding',
	'content-length',
	'transfer-encoding',
	'connection',
	'keep-alive',
	'set-cookie',
])

function splitList(value: string | undefined): string[] {
	if (!value) return []
	return value
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean)
}

function isPrivateHost(host: string): boolean {
	const h = host.toLowerCase()
	if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
	if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true
	if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
	return false
}

function hostAllowed(host: string): boolean {
	if (!host || isPrivateHost(host)) return false
	const allowed = splitList(process.env.MINI_APP_ALLOWED_HOSTS)
	if (allowed.length === 0) return true
	const h = host.toLowerCase()
	return allowed.some((entry) => h === entry || h.endsWith('.' + entry))
}

function publicOriginFrom(req: any): string {
	const forwardedHost = String(req.headers['x-forwarded-host'] || '')
	const host = (forwardedHost.split(',')[0] || String(req.headers.host || '')).trim()
	const protoHeader = String(req.headers['x-forwarded-proto'] || '')
	const proto = (protoHeader.split(',')[0] || 'https').trim() || 'https'
	return proto + '://' + host
}

function toHttps(raw: string): URL | null {
	try {
		const url = new URL(raw)
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
		if (url.protocol === 'http:') url.protocol = 'https:'
		if (!url.hostname) return null
		return url
	} catch {
		return null
	}
}

function firstValue(value: unknown): string {
	if (Array.isArray(value)) return value.length ? String(value[0]) : ''
	if (value === undefined || value === null) return ''
	return String(value)
}

function targetFromQuery(req: any): URL | null {
	const query = (req.query || {}) as Record<string, unknown>
	const direct = firstValue(query.u) || firstValue(query.url) || firstValue(query.target)
	if (direct) {
		const decoded = /%3a|%2f/i.test(direct) ? safeDecode(direct) : direct
		return toHttps(/^https?:\/\//i.test(decoded) ? decoded : 'https://' + decoded.replace(/^\/+/, ''))
	}

	const host = firstValue(query.__host)
	if (!host) return null

	const rawPath = Array.isArray(query.__path)
		? (query.__path as unknown[]).map((part) => String(part)).join('/')
		: firstValue(query.__path)

	const params = new URLSearchParams()
	for (const key of Object.keys(query)) {
		if (key === '__host' || key === '__path' || key === '__mp' || key === 'u' || key === 'url' || key === 'target') {
			continue
		}
		const value = query[key]
		if (Array.isArray(value)) {
			for (const item of value) params.append(key, String(item))
		} else {
			params.append(key, String(value ?? ''))
		}
	}

	let raw = 'https://' + host + '/' + String(rawPath || '').replace(/^\/+/, '')
	const search = params.toString()
	if (search) raw += '?' + search
	return toHttps(raw)
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

// Zaxira: /api/mp/<host>/<path> yoki /api/mp/p/https://host/path
function targetFromPath(req: any): URL | null {
	const url = String(req.url || '').split('#')[0]
	const marker = '/api/mp/'
	const index = url.indexOf(marker)
	if (index < 0) return null
	let rest = url.slice(index + marker.length)
	if (!rest || rest === 'health') return null
	if (rest.startsWith('p/')) rest = rest.slice(2)
	if (/^https?%3a/i.test(rest)) rest = safeDecode(rest)
	rest = rest.replace(/^(https?:)\/*/i, (_match, scheme) => scheme + '//')
	if (!/^https?:\/\//i.test(rest)) rest = 'https://' + rest.replace(/^\/+/, '')
	return toHttps(rest)
}

function proxiedUrl(absolute: URL, origin: string): string {
	const path = absolute.pathname || '/'
	return origin + PUBLIC_PREFIX + absolute.host + path + absolute.search + absolute.hash
}

function rewriteValue(value: string, docUrl: URL, origin: string): string {
	const trimmed = value.trim()
	if (!trimmed) return value
	if (trimmed.startsWith('#')) return value
	if (/^(data|blob|javascript|mailto|tel|sms|about|intent|ws|wss):/i.test(trimmed)) return value
	try {
		const absolute = new URL(trimmed, docUrl)
		if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return value
		if (absolute.origin === origin) return absolute.href
		if (absolute.protocol === 'http:') absolute.protocol = 'https:'
		return proxiedUrl(absolute, origin)
	} catch {
		return value
	}
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function rewriteSrcset(value: string, docUrl: URL, origin: string): string {
	return value
		.split(',')
		.map((part) => {
			const piece = part.trim()
			if (!piece) return ''
			const segments = piece.split(/\s+/)
			segments[0] = rewriteValue(segments[0], docUrl, origin)
			return segments.join(' ')
		})
		.filter(Boolean)
		.join(', ')
}

function rewriteCssUrls(css: string, docUrl: URL, origin: string): string {
	return css
		.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_match, quote, target) => {
			return 'url(' + quote + rewriteValue(target, docUrl, origin) + quote + ')'
		})
		.replace(/@import\s+(['"])([^'"]+)\1/gi, (_match, quote, target) => {
			return '@import ' + quote + rewriteValue(target, docUrl, origin) + quote
		})
}

function runtimePatch(origin: string): string {
	return (
		'<script data-mini-app-proxy="1">(function(){' +
		'var O=' +
		JSON.stringify(origin) +
		';var P=' +
		JSON.stringify(PUBLIC_PREFIX) +
		';function mp(u){try{if(u==null)return u;var s=String(u);if(!s||s.charAt(0)==="#")return u;' +
		'if(/^(data|blob|javascript|mailto|tel|sms|about|ws|wss):/i.test(s))return u;' +
		'var a=new URL(s,document.baseURI);if(a.origin===O)return a.href;' +
		'if(a.protocol!=="http:"&&a.protocol!=="https:")return u;' +
		'return O+P+a.host+(a.pathname||"/")+a.search+a.hash;}catch(e){return u}}' +
		'var of=window.fetch;if(of){window.fetch=function(i,o){try{if(typeof i==="string")i=mp(i);' +
		'else if(i&&i.url)i=new Request(mp(i.url),i);}catch(e){}return of.call(this,i,o)}}' +
		'var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(){' +
		'var a=[].slice.call(arguments);try{a[1]=mp(a[1])}catch(e){}return xo.apply(this,a)};' +
		'var wo=window.open;window.open=function(u,n,f){try{u=mp(u)}catch(e){}return wo.call(window,u,n,f)};' +
		'try{Object.defineProperty(window,"top",{get:function(){return window.self}})}catch(e){}' +
		'try{Object.defineProperty(window,"parent",{get:function(){return window.self}})}catch(e){}' +
		'window.__miniAppProxy=mp;})();</script>'
	)
}

function rewriteHtml(html: string, docUrl: URL, origin: string): string {
	let out = html

	// mavjud <base> va integrity/CSP metalarini olib tashlaymiz
	out = out.replace(/<base\b[^>]*>/gi, '')
	out = out.replace(/\sintegrity=("[^"]*"|'[^']*')/gi, '')
	out = out.replace(
		/<meta[^>]+http-equiv=["']?(content-security-policy|x-frame-options)["']?[^>]*>/gi,
		''
	)

	out = out.replace(
		/\s(src|href|action|poster|formaction|data-src|data-href)=("([^"]*)"|'([^']*)')/gi,
		(match, attr: string, _raw: string, dq?: string, sq?: string) => {
			const value = dq !== undefined ? dq : sq !== undefined ? sq : ''
			if (!value) return match
			return ' ' + attr + '="' + escapeAttr(rewriteValue(value, docUrl, origin)) + '"'
		}
	)

	out = out.replace(/\s(srcset|data-srcset|imagesrcset)=("([^"]*)"|'([^']*)')/gi, (match, attr: string, _raw: string, dq?: string, sq?: string) => {
		const value = dq !== undefined ? dq : sq !== undefined ? sq : ''
		if (!value) return match
		return ' ' + attr + '="' + escapeAttr(rewriteSrcset(value, docUrl, origin)) + '"'
	})

	out = out.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs: string, css: string) => {
		return '<style' + attrs + '>' + rewriteCssUrls(css, docUrl, origin) + '</style>'
	})

	const baseHref = proxiedUrl(docUrl, origin)
	const injection = '<base href="' + escapeAttr(baseHref) + '">' + runtimePatch(origin)

	if (/<head[^>]*>/i.test(out)) {
		out = out.replace(/<head([^>]*)>/i, (_match, attrs: string) => '<head' + attrs + '>' + injection)
	} else if (/<html[^>]*>/i.test(out)) {
		out = out.replace(/<html([^>]*)>/i, (_match, attrs: string) => '<html' + attrs + '><head>' + injection + '</head>')
	} else {
		out = injection + out
	}

	return out
}

type FetchResult = { response: Response; finalUrl: URL }

async function safeFetch(target: URL, method: string, req: any): Promise<FetchResult> {
	let current = target
	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		if (!hostAllowed(current.hostname)) throw new Error('host_not_allowed')
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
		let response: Response
		try {
			response = await fetch(current.toString(), {
				method,
				redirect: 'manual',
				signal: controller.signal,
				headers: {
					'user-agent': UA,
					accept: String(req.headers.accept || '*/*'),
					'accept-language': String(req.headers['accept-language'] || 'uz,ru;q=0.9,en;q=0.8'),
					referer: current.origin + '/',
				},
			})
		} finally {
			clearTimeout(timer)
		}

		const status = response.status
		const location = response.headers.get('location')
		if (status >= 300 && status < 400 && location) {
			const next = toHttps(new URL(location, current).toString())
			if (!next) throw new Error('bad_redirect')
			current = next
			continue
		}

		return { response, finalUrl: current }
	}
	throw new Error('too_many_redirects')
}

export default async function handler(req: any, res: any) {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'content-type,accept,accept-language')

	if (req.method === 'OPTIONS') {
		res.status(204).end()
		return
	}
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.status(405).json({ error: 'method_not_allowed' })
		return
	}

	const query = (req.query || {}) as Record<string, unknown>
	const rawUrl = String(req.url || '')
	if (firstValue(query.health) || /\/health(\?|$)/.test(rawUrl)) {
		res.setHeader('Cache-Control', 'no-store')
		res.status(200).json({ ok: true, service: 'mini-app-proxy', prefix: PUBLIC_PREFIX })
		return
	}

	const origin = publicOriginFrom(req)
	const target = targetFromQuery(req) || targetFromPath(req)

	if (!target) {
		res.status(400).json({ error: 'invalid_url', hint: origin + '/mp/example.com/path' })
		return
	}
	if (!hostAllowed(target.hostname)) {
		res.status(403).json({ error: 'host_not_allowed', host: target.hostname })
		return
	}

	target.searchParams.delete('__mp')

	let result: FetchResult
	try {
		result = await safeFetch(target, req.method === 'HEAD' ? 'HEAD' : 'GET', req)
	} catch (error: any) {
		const reason = String(error?.message || error || 'fetch_failed')
		res.status(reason === 'host_not_allowed' ? 403 : 502).json({ error: reason, url: target.toString() })
		return
	}

	const { response, finalUrl } = result
	const contentType = response.headers.get('content-type') || 'application/octet-stream'

	response.headers.forEach((value, key) => {
		if (STRIP_HEADERS.has(key.toLowerCase())) return
		try {
			res.setHeader(key, value)
		} catch {
			/* e'tiborsiz */
		}
	})

	res.setHeader('Content-Security-Policy', "frame-ancestors 'self'")
	res.setHeader('X-Robots-Tag', 'noindex, nofollow')
	res.setHeader('Content-Type', contentType)

	if (req.method === 'HEAD') {
		res.status(response.status).end()
		return
	}

	const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType)
	const isCss = /text\/css/i.test(contentType)

	if (isHtml || isCss) {
		const body = await response.text()
		const rewritten = isHtml
			? rewriteHtml(body, finalUrl, origin)
			: rewriteCssUrls(body, finalUrl, origin)
		res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120')
		res.status(response.status).send(rewritten)
		return
	}

	const buffer = Buffer.from(await response.arrayBuffer())
	if (buffer.byteLength > MAX_BYTES) {
		res.status(302).setHeader('Location', finalUrl.toString())
		res.end()
		return
	}
	res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600')
	res.status(response.status).send(buffer)
}
