export const MESSAGE_PAYLOAD_SCHEMA = 'alsamos.message.v1';

export interface CanonicalLocationPayload {
  schema: typeof MESSAGE_PAYLOAD_SCHEMA;
  latitude: number;
  longitude: number;
  address?: string;
  label?: string;
  live?: boolean;
  expiresAt?: string;
}

export interface CanonicalPollOption {
  id: string;
  text: string;
  votes?: number;
}

export interface CanonicalPollPayload {
  schema: typeof MESSAGE_PAYLOAD_SCHEMA;
  question: string;
  options: CanonicalPollOption[];
  multiple: boolean;
  anonymous?: boolean;
}

interface StructuredMessageLike {
  content?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  metadata?: unknown;
  location_payload?: unknown;
  live_location_expires_at?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return asRecord(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

function finiteCoordinate(value: unknown, max: number): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && Math.abs(numeric) <= max ? numeric : null;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

function normalizeLocation(value: unknown): CanonicalLocationPayload | null {
  const data = asRecord(value);
  if (!data) return null;

  const latitude = finiteCoordinate(data.latitude ?? data.lat, 90);
  const longitude = finiteCoordinate(data.longitude ?? data.lng, 180);
  if (latitude == null || longitude == null) return null;

  return {
    schema: MESSAGE_PAYLOAD_SCHEMA,
    latitude,
    longitude,
    address: cleanText(data.address),
    label: cleanText(data.label ?? data.name),
    live: data.live === true || data.is_live === true,
    expiresAt: cleanText(data.expiresAt ?? data.expires_at ?? data.live_until),
  };
}

function parseCoordinates(raw: string): { latitude: number; longitude: number } | null {
  const match = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(raw);
  if (!match) return null;
  const latitude = finiteCoordinate(match[1], 90);
  const longitude = finiteCoordinate(match[2], 180);
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

export function parseMessageLocation(message: StructuredMessageLike): CanonicalLocationPayload | null {
  const metadata = asRecord(message.metadata);
  const fromMetadata =
    normalizeLocation(metadata?.location) ||
    normalizeLocation(metadata?.location_payload) ||
    normalizeLocation(message.location_payload);
  if (fromMetadata) {
    return {
      ...fromMetadata,
      live: fromMetadata.live || message.media_type === 'live_location',
      expiresAt:
        fromMetadata.expiresAt ||
        message.live_location_expires_at ||
        cleanText(metadata?.live_location_expires_at),
    };
  }

  const mediaCoords = message.media_url ? parseCoordinates(message.media_url) : null;
  if (
    mediaCoords &&
    (message.media_type === 'location' || message.media_type === 'live_location')
  ) {
    return {
      schema: MESSAGE_PAYLOAD_SCHEMA,
      ...mediaCoords,
      address: cleanText(message.content),
      live: message.media_type === 'live_location',
      expiresAt:
        message.live_location_expires_at ||
        cleanText(metadata?.live_location_expires_at),
    };
  }

  const content = message.content?.trim() || '';
  if (content.startsWith('📍 LOCATION:')) {
    const raw = content.slice('📍 LOCATION:'.length);
    const [coordsPart, ...parts] = raw.split('|');
    const coords = parseCoordinates(coordsPart);
    if (!coords) return null;
    const livePart = parts.find((part) => part.startsWith('LIVE:'));
    const address = parts.find((part) => part && !part.startsWith('LIVE:'));
    return {
      schema: MESSAGE_PAYLOAD_SCHEMA,
      ...coords,
      address: cleanText(address),
      live: Boolean(livePart),
      expiresAt:
        livePart?.slice('LIVE:'.length) ||
        message.live_location_expires_at ||
        undefined,
    };
  }

  if (message.media_type === 'location' || message.media_type === 'live_location') {
    const coords = parseCoordinates(content);
    if (!coords) return null;
    const label = content
      .replace(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/, '')
      .replace('📍', '')
      .trim();
    return {
      schema: MESSAGE_PAYLOAD_SCHEMA,
      ...coords,
      label: label || undefined,
      live: message.media_type === 'live_location',
      expiresAt:
        message.live_location_expires_at ||
        cleanText(metadata?.live_location_expires_at),
    };
  }

  return null;
}

export function buildLocationMessageFields(input: {
  latitude: number;
  longitude: number;
  address?: string;
  label?: string;
  live?: boolean;
  expiresAt?: string;
}) {
  const location: CanonicalLocationPayload = {
    schema: MESSAGE_PAYLOAD_SCHEMA,
    latitude: input.latitude,
    longitude: input.longitude,
    address: cleanText(input.address),
    label: cleanText(input.label),
    live: Boolean(input.live),
    expiresAt: cleanText(input.expiresAt),
  };

  return {
    content:
      location.address ||
      location.label ||
      (location.live ? 'Jonli joylashuv' : 'Joylashuv'),
    mediaUrl: `${location.latitude},${location.longitude}`,
    mediaType: location.live ? 'live_location' : 'location',
    metadata: {
      schema: MESSAGE_PAYLOAD_SCHEMA,
      location,
      ...(location.expiresAt
        ? { live_location_expires_at: location.expiresAt }
        : {}),
    },
    locationPayload: location,
    liveLocationExpiresAt: location.expiresAt,
  };
}

function normalizePollOption(value: unknown, index: number): CanonicalPollOption | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? { id: `opt_${index}`, text, votes: 0 } : null;
  }
  const item = asRecord(value);
  if (!item) return null;
  const text = cleanText(item.text ?? item.title ?? item.label);
  if (!text) return null;
  const votesRaw = Number(item.votes ?? 0);
  return {
    id: cleanText(item.id) || `opt_${index}`,
    text,
    votes: Number.isFinite(votesRaw) ? votesRaw : 0,
  };
}

function normalizePoll(value: unknown): CanonicalPollPayload | null {
  const data = asRecord(value);
  if (!data) return null;
  const question = cleanText(data.question ?? data.title);
  const rawOptions = Array.isArray(data.options) ? data.options : [];
  const options = rawOptions
    .map(normalizePollOption)
    .filter((option): option is CanonicalPollOption => Boolean(option));
  if (!question || options.length < 2) return null;

  return {
    schema: MESSAGE_PAYLOAD_SCHEMA,
    question,
    options,
    multiple:
      data.multiple === true ||
      data.allowMultiple === true ||
      data.allows_multiple === true,
    anonymous:
      data.anonymous === true ||
      data.isAnonymous === true ||
      data.is_anonymous === true,
  };
}

export function parseMessagePoll(message: StructuredMessageLike): CanonicalPollPayload | null {
  const metadata = asRecord(message.metadata);
  const fromMetadata = normalizePoll(metadata?.poll);
  if (fromMetadata) return fromMetadata;

  const content = message.content?.trim() || '';
  const legacy = /\[POLL\]([\s\S]*?)\[\/POLL\]/.exec(content);
  if (legacy) {
    try {
      const parsed = normalizePoll(JSON.parse(legacy[1]));
      if (parsed) return parsed;
    } catch {
      // Legacy payload noto'g'ri bo'lsa plain-text fallbackga o'tamiz.
    }
  }

  if (message.media_type !== 'poll') return null;
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return null;
  const options = lines
    .slice(1)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
  return normalizePoll({ question: lines[0], options, multiple: false });
}

export function buildPollMessageFields(input: {
  question: string;
  options: string[];
  multiple?: boolean;
  anonymous?: boolean;
}) {
  const poll = normalizePoll({
    question: input.question,
    options: input.options,
    multiple: input.multiple,
    anonymous: input.anonymous,
  });
  if (!poll) throw new Error("So'rovnoma uchun kamida 2 ta variant kerak");

  return {
    content: [poll.question, ...poll.options.map((option) => `- ${option.text}`)].join('\n'),
    mediaType: 'poll',
    metadata: {
      schema: MESSAGE_PAYLOAD_SCHEMA,
      poll,
    },
    poll,
  };
}
