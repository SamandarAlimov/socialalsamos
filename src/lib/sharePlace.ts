/**
 * Joylashuvni ilova ichida ulashish uchun yordamchi kutubxona.
 *
 * - Xarita POI kartasidan chatga / bozorga / postga havola yasaydi
 * - Havolalar ichidagi ma'lumot base64 (URL-safe emas, oddiy btoa) bilan kodlanadi
 * - Chat xabari protokoli: '\ud83d\udccd LOCATION:lat,lng|address'
 */

export type SharePlaceInput = {
	name: string
	address?: string
	latitude: number
	longitude: number
}

/** Chat xabaridagi lokatsiya prefiksi. Bu ma'lumot protokoli, UI matni emas. */
export const LOCATION_PREFIX = '\ud83d\udccd LOCATION:'

/** Chatga yuboriladigan lokatsiya xabari matnini yasaydi. */
export function locationMessageContent(place: SharePlaceInput): string {
	const lat = Number(place.latitude).toFixed(6)
	const lng = Number(place.longitude).toFixed(6)
	const label = [place.name, place.address].filter(Boolean).join(', ')
	return `${LOCATION_PREFIX}${lat},${lng}|${label}`
}

/** Joyni URL parametriga sig'adigan qatorga kodlaydi. */
export function encodeSharePlace(place: SharePlaceInput): string {
	const raw = JSON.stringify({
		n: place.name,
		a: place.address ?? '',
		lat: Number(place.latitude),
		lng: Number(place.longitude),
	})
	try {
		return btoa(unescape(encodeURIComponent(raw)))
	} catch {
		return encodeURIComponent(raw)
	}
}

/** encodeSharePlace natijasini qaytadan o'qiydi. Xato bo'lsa null. */
export function decodeSharePlace(value: string | null): SharePlaceInput | null {
	if (!value) return null

	const parse = (text: string): SharePlaceInput | null => {
		try {
			const data = JSON.parse(text) as Record<string, unknown>
			const lat = Number(data.lat)
			const lng = Number(data.lng)
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
			const name = typeof data.n === 'string' && data.n.trim() ? data.n : 'Tanlangan joy'
			const address = typeof data.a === 'string' && data.a.trim() ? data.a : undefined
			return { name, address, latitude: lat, longitude: lng }
		} catch {
			return null
		}
	}

	// 1) base64
	try {
		const decoded = decodeURIComponent(escape(atob(value)))
		const fromBase64 = parse(decoded)
		if (fromBase64) return fromBase64
	} catch {
		// base64 emas - pastda oddiy JSON sifatida sinaymiz
	}

	// 2) oddiy (encodeURIComponent qilingan) JSON
	try {
		return parse(decodeURIComponent(value))
	} catch {
		return parse(value)
	}
}

/** Xabarlar sahifasiga lokatsiyani olib boradigan ichki havola. */
export function messagesShareLink(place: SharePlaceInput, conversationId?: string): string {
	const params = new URLSearchParams({ share: encodeSharePlace(place) })
	if (conversationId) params.set('chat', conversationId)
	return `/messages?${params.toString()}`
}

/** Bozorda shu nuqta atrofidagi e'lonlarni ko'rsatadigan ichki havola. */
export function marketplaceNearLink(
	latitude: number,
	longitude: number,
	radiusKm = 5,
): string {
	const params = new URLSearchParams({
		lat: String(Number(latitude).toFixed(6)),
		lng: String(Number(longitude).toFixed(6)),
		near: String(radiusKm),
	})
	return `/marketplace?${params.toString()}`
}

/** Xaritada shu joyni ochadigan ichki havola. */
export function mapPlaceLink(place: SharePlaceInput): string {
	const params = new URLSearchParams({
		destLat: String(Number(place.latitude)),
		destLng: String(Number(place.longitude)),
		destName: place.name,
	})
	return `/map?${params.toString()}`
}
