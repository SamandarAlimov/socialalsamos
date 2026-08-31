/**
 * Alsamos Mini App embed proxy (Cloudflare Worker).
 *
 * NIMA UCHUN KERAK
 * ----------------
 * Supabase Edge Functions (`*.supabase.co/functions/v1/...`) qaytargan HTML
 * platforma darajasida `Content-Security-Policy: sandbox` bilan beriladi.
 * Shu sababli u yerdagi proksi orqali ochilgan sahifada JS umuman ishlamaydi
 * ("Blocked script execution ... 'allow-scripts' permission is not set").
 * Next.js/React saytlar esa butun kontentni JS bilan chizadi -> foydalanuvchi
 * faqat skeleton ko'radi.
 *
 * Yechim: proksi o'z domenimizda turishi kerak (masalan proxy.alsamos.com).
 * U holda sarlavhalarni to'liq biz boshqaramiz va iframe'ga `allow-scripts`
 * bilan birga `allow-same-origin` ham berish mumkin - chunki proksi origini
 * alsamos.com dan boshqa origin, ya'ni sandbox escape xavfi yo'q.
 *
 * MANZIL SHAKLI
 * -------------
 * https://proxy.alsamos.com/p/https://islom.uz/
 * Path-prefix ishlatiladi (query emas): shunda `<base href>` orqali barcha
 * nisbiy havolalar avtomatik proksi ichida qoladi va Next.js chunk'lari ham
 * to'g'ri yuklanadi.
 */

export interface Env {
	/** Vergul bilan ajratilgan ruxsat etilgan domenlar. Bo'sh bo'lsa - hammasi. */
	ALLOWED_HOSTS?: string
	/** Proksini iframe ichiga qo'yishi mumkin bo'lgan originlar. */
	ALLOWED_PARENTS?: string
}

const PREFIX = "/p/"
const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 20_000

const STRIP_HEADERS = new Set([
	"x-frame-options",
	"content-security-policy",
	"content-security-policy-report-only",
	"cross-origin-opener-policy",
	"cross-origin-embedder-policy",
	"cross-origin-resource-policy",
	"permissions-policy",
	"report-to",
	"nel",
	"clear-site-data",
	"content-encoding",
	"content-length",
	"transfer-encoding",
	"connection",
	"strict-transport-security",
])

const UA =
	"Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"

function splitList(value?: string): string[] {
	return (value ?? "")
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean)
}

function isPrivateHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
	if (!host) return true
	if (host === "localhost" || host === "0.0.0.0" || host === "::1") return true
	if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return true
	if (host === "metadata.google.internal" || host === "169.254.169.254") return true
	if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true
	if (/^169\.254\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true
	if (/^f[cd][0-9a-f]{0,2}:/i.test(host) || /^fe80:/i.test(host)) return true
	if (!host.includes(".") && !host.includes(":")) return true
	return false
}

function hostAllowed(hostname: string, list: string[]): boolean {
	if (list.length === 0) return true
	const host = hostname.toLowerCase()
	return list.some((entry) => host === entry || host.endsWith("." + entry))
}

function isSafeTarget(value: string): boolean {
	try {
		const url = new URL(value)
		if (url.protocol !== "https:" && url.protocol !== "http:") return false
		return !isPrivateHost(url.hostname)
	} catch {
		return false
	}
}

/**
 * Brauzer nisbiy havolalarni hisoblaganda `//` ni `/` ga siqadi
 * (`/p/https://a.uz/x` -> `/p/https:/a.uz/x`). Shuni tiklaymiz.
 */
function parseTarget(requestUrl: URL): string | null {
	if (requestUrl.pathname.startsWith(PREFIX)) {
		let raw = requestUrl.pathname.slice(PREFIX.length) + requestUrl.search + requestUrl.hash
		raw = raw.replace(/^(https?:)\/*/i, (_match, scheme: string) => scheme.toLowerCase() + "//")
		if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw.replace(/^\/+/, "")
		return raw
	}
	const query = requestUrl.searchParams.get("url")
	if (!query) return null
	return /^https?:\/\//i.test(query) ? query : "https://" + query
}

function proxyBase(requestUrl: URL): string {
	return requestUrl.origin + PREFIX
}

function toProxied(rawUrl: string, documentBase: string, base: string): string {
	const raw = rawUrl.trim()
	if (!raw) return rawUrl
	if (raw.startsWith(base)) return raw
	if (/^(#|data:|blob:|about:|javascript:|mailto:|tel:|sms:)/i.test(raw)) return rawUrl
	try {
		const absolute = new URL(raw, documentBase).href
		if (!isSafeTarget(absolute)) return rawUrl
		return base + absolute
	} catch {
		return rawUrl
	}
}

function rewriteSrcset(value: string, documentBase: string, base: string): string {
	return value
		.split(",")
		.map((part) => {
			const trimmed = part.trim()
			if (!trimmed) return trimmed
			const [candidate, ...rest] = trimmed.split(/\s+/)
			return [toProxied(candidate, documentBase, base), ...rest].join(" ")
		})
		.filter(Boolean)
		.join(", ")
}

/** Sahifa ichida ish vaqtida yasaladigan so'rovlarni ham proksiga burib yuboradi. */
function runtimePatch(base: string): string {
	const body = [
		"(function(){",
		"var P=" + JSON.stringify(base) + ";",
		"function wrap(u){try{if(u==null)return u;var s=String(u);",
		"if(s.indexOf(P)===0)return s;",
		"if(/^(#|data:|blob:|about:|javascript:|mailto:|tel:)/i.test(s))return s;",
		"var a=new URL(s,document.baseURI).href;",
		"if(a.indexOf(P)===0)return a;",
		"if(a.indexOf(location.origin)===0)return a;",
		"if(!/^https?:/i.test(a))return s;",
		"return P+a;}catch(e){return u}}",
		"var of=window.fetch;",
		"window.fetch=function(input,init){try{",
		"if(typeof input==='string'||input instanceof URL){return of.call(window,wrap(String(input)),init)}",
		"if(input&&input.url){return of.call(window,new Request(wrap(input.url),input),init)}",
		"}catch(e){}return of.apply(window,arguments)};",
		"var oo=XMLHttpRequest.prototype.open;",
		"XMLHttpRequest.prototype.open=function(method,url){arguments[1]=wrap(url);return oo.apply(this,arguments)};",
		"var ow=window.open;",
		"window.open=function(u,n,f){return ow.call(window,wrap(u),n||'_blank',f)};",
		"try{Object.defineProperty(window,'top',{get:function(){return window.self}});",
		"Object.defineProperty(window,'parent',{get:function(){return window.self}})}catch(e){}",
		"})();",
	].join("")
	return "<script>" + body + "</script>"
}

function rewriteHtml(html: string, finalUrl: string, base: string): string {
	let output = html

	output = output.replace(/<meta[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "")
	output = output.replace(/<meta[^>]*http-equiv\s*=\s*["']?x-frame-options["']?[^>]*>/gi, "")
	output = output.replace(/<base[^>]*>/gi, "")
	output = output.replace(/\sintegrity\s*=\s*["'][^"']*["']/gi, "")

	output = output.replace(
		/((?:src|href|action|poster|formaction|data-src)\s*=\s*["'])([^"']*)(["'])/gi,
		(match, prefix: string, value: string, suffix: string) => {
			const next = toProxied(value, finalUrl, base)
			return next === value ? match : prefix + next + suffix
		},
	)

	output = output.replace(
		/(srcset\s*=\s*["'])([^"']*)(["'])/gi,
		(_match, prefix: string, value: string, suffix: string) =>
			prefix + rewriteSrcset(value, finalUrl, base) + suffix,
	)

	output = output.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (match, value: string) => {
		const next = toProxied(value, finalUrl, base)
		return next === value ? match : 'url("' + next + '")'
	})

	const head = '<base href="' + base + finalUrl + '">' + runtimePatch(base)
	if (/<head[^>]*>/i.test(output)) {
		output = output.replace(/(<head[^>]*>)/i, (m) => m + head)
	} else if (/<html[^>]*>/i.test(output)) {
		output = output.replace(/(<html[^>]*>)/i, (m) => m + "<head>" + head + "</head>")
	} else {
		output = head + output
	}

	return output
}

function baseHeaders(env: Env): Record<string, string> {
	const parents = splitList(env.ALLOWED_PARENTS)
	const frameAncestors = parents.length > 0 ? parents.join(" ") : "*"
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Content-Security-Policy": "frame-ancestors " + frameAncestors,
		"X-Robots-Tag": "noindex, nofollow",
	}
}

function errorResponse(env: Env, message: string, status: number): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { ...baseHeaders(env), "Content-Type": "application/json; charset=utf-8" },
	})
}

async function safeFetch(startUrl: string, allowed: string[], request: Request) {
	let current = startUrl

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (!isSafeTarget(current)) return { error: "URL not allowed", status: 403 as const }
		if (!hostAllowed(new URL(current).hostname, allowed)) {
			return { error: "Host not allowed", status: 403 as const }
		}

		const upstream = await fetch(current, {
			method: request.method === "POST" ? "POST" : "GET",
			body: request.method === "POST" ? await request.clone().arrayBuffer() : undefined,
			redirect: "manual",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				"User-Agent": UA,
				Accept: request.headers.get("accept") ?? "*/*",
				"Accept-Language": request.headers.get("accept-language") ?? "uz,ru;q=0.8,en;q=0.6",
				"Content-Type": request.headers.get("content-type") ?? "",
			},
		})

		if (upstream.status >= 300 && upstream.status < 400) {
			const location = upstream.headers.get("location")
			if (!location) return { response: upstream, finalUrl: current }
			try {
				current = new URL(location, current).href
			} catch {
				return { error: "Bad redirect", status: 502 as const }
			}
			continue
		}

		return { response: upstream, finalUrl: current }
	}

	return { error: "Too many redirects", status: 502 as const }
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: baseHeaders(env) })
		}

		const requestUrl = new URL(request.url)
		if (requestUrl.pathname === "/health") {
			return new Response("ok", { status: 200, headers: baseHeaders(env) })
		}

		const target = parseTarget(requestUrl)
		if (!target) return errorResponse(env, "Manzil ko'rsatilmagan.", 400)
		if (!isSafeTarget(target)) return errorResponse(env, "Bu manzilga ruxsat berilmagan.", 403)

		const allowed = splitList(env.ALLOWED_HOSTS)
		if (!hostAllowed(new URL(target).hostname, allowed)) {
			return errorResponse(env, "Bu domen ruxsat etilganlar ro'yxatida yo'q.", 403)
		}

		let fetched
		try {
			fetched = await safeFetch(target, allowed, request)
		} catch (error) {
			console.error("proxy fetch failed", error)
			return errorResponse(env, "Saytga ulanib bo'lmadi.", 502)
		}

		if ("error" in fetched) return errorResponse(env, fetched.error, fetched.status)

		const { response, finalUrl } = fetched
		const headers = new Headers()
		response.headers.forEach((value, key) => {
			if (!STRIP_HEADERS.has(key.toLowerCase())) headers.set(key, value)
		})
		for (const [key, value] of Object.entries(baseHeaders(env))) headers.set(key, value)

		const contentType = response.headers.get("content-type") ?? ""
		const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType)

		if (!isHtml) {
			return new Response(response.body, { status: response.status, headers })
		}

		const html = await response.text()
		const rewritten = rewriteHtml(html, finalUrl, proxyBase(requestUrl))
		headers.set("Content-Type", "text/html; charset=utf-8")
		headers.set("Cache-Control", "private, max-age=60")
		return new Response(rewritten, { status: response.status, headers })
	},
}
