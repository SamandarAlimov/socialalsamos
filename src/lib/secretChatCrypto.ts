import { supabase } from '@/integrations/supabase/client';

const DB_NAME = 'alsamos-secret-chat-v1';
const DB_VERSION = 1;
const STORE_NAME = 'device-identities';
const CONTEXT_PREFIX = 'alsamos.secret-chat.context.v1';
const ALGORITHM = 'ECDH-P256+HKDF-SHA256+AES-256-GCM';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type StoredIdentity = {
  userId: string;
  deviceId: string;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  createdAt: string;
};

type SecretContext = {
  userId: string;
  conversationId: string;
  myDeviceId: string;
  peerDeviceId: string;
  peerPublicKeyJwk: JsonWebKey;
};

type SecretEnvelope = {
  v: 1;
  alg: typeof ALGORITHM;
  iv: string;
  ciphertext: string;
  sender_device_id: string;
};

const contextCache = new Map<string, SecretContext>();
const secretModeCache = new Map<string, boolean>();
let dbPromise: Promise<IDBDatabase> | null = null;

function assertCryptoSupport() {
  if (
    typeof window === 'undefined' ||
    typeof indexedDB === 'undefined' ||
    !globalThis.crypto?.subtle ||
    !globalThis.crypto?.randomUUID
  ) {
    throw new Error('E2EE_UNSUPPORTED');
  }
}

function openDb(): Promise<IDBDatabase> {
  assertCryptoSupport();
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('E2EE_STORAGE_OPEN_FAILED'));
  });

  return dbPromise;
}

async function readIdentity(userId: string): Promise<StoredIdentity | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve((request.result as StoredIdentity | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('E2EE_STORAGE_READ_FAILED'));
  });
}

async function writeIdentity(identity: StoredIdentity): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(identity);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('E2EE_STORAGE_WRITE_FAILED'));
    tx.onabort = () => reject(tx.error ?? new Error('E2EE_STORAGE_WRITE_FAILED'));
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function contextKey(userId: string, conversationId: string) {
  return `${userId}:${conversationId}`;
}

function storageKey(userId: string, conversationId: string) {
  return `${CONTEXT_PREFIX}.${userId}.${conversationId}`;
}

function saveContext(context: SecretContext) {
  const key = contextKey(context.userId, context.conversationId);
  contextCache.set(key, context);
  secretModeCache.set(key, true);
  try {
    localStorage.setItem(storageKey(context.userId, context.conversationId), JSON.stringify(context));
  } catch {
    // IndexedDB keeps the private key. Failure to persist this public context only
    // means it will be re-hydrated from Supabase next time.
  }
}

function readCachedContext(userId: string, conversationId: string): SecretContext | null {
  const key = contextKey(userId, conversationId);
  const cached = contextCache.get(key);
  if (cached) return cached;

  try {
    const raw = localStorage.getItem(storageKey(userId, conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SecretContext;
    if (
      parsed.userId !== userId ||
      parsed.conversationId !== conversationId ||
      !parsed.myDeviceId ||
      !parsed.peerDeviceId ||
      !parsed.peerPublicKeyJwk
    ) {
      return null;
    }
    contextCache.set(key, parsed);
    secretModeCache.set(key, true);
    return parsed;
  } catch {
    return null;
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function generateIdentity(userId: string): Promise<StoredIdentity> {
  assertCryptoSupport();
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair;

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );

  const identity: StoredIdentity = {
    userId,
    deviceId: crypto.randomUUID(),
    privateKey,
    publicKeyJwk,
    createdAt: new Date().toISOString(),
  };

  await writeIdentity(identity);
  return identity;
}

export async function ensureE2EEDevice(userId: string): Promise<StoredIdentity> {
  assertCryptoSupport();
  const identity = (await readIdentity(userId)) ?? (await generateIdentity(userId));

  const { error } = await (supabase as any).rpc('register_e2ee_device', {
    p_device_id: identity.deviceId,
    p_public_key_jwk: identity.publicKeyJwk,
    p_platform: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });

  if (error) throw error;
  return identity;
}

export async function bootstrapE2EEDevice(userId: string): Promise<void> {
  try {
    await ensureE2EEDevice(userId);
  } catch (error) {
    // E2EE is optional platform capability. A browser without WebCrypto/IndexedDB
    // must not prevent the rest of Alsamos from loading.
    console.warn('[secret-chat] device bootstrap unavailable', error);
  }
}

export async function createSecretConversation(otherUserId: string): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error('E2EE_NOT_AUTHENTICATED');

  const identity = await ensureE2EEDevice(userId);
  const { data, error } = await (supabase as any).rpc('create_secret_conversation', {
    p_other_user_id: otherUserId,
    p_my_device_id: identity.deviceId,
  });

  if (error) {
    const message = String(error.message ?? error.code ?? error);
    if (message.includes('recipient_e2ee_device_not_ready')) {
      throw new Error('E2EE_PEER_NOT_READY');
    }
    if (message.includes('recipient_secret_chats_disabled')) {
      throw new Error('E2EE_PEER_DISABLED');
    }
    if (message.includes('blocked')) {
      throw new Error('E2EE_BLOCKED');
    }
    throw error;
  }

  const result = data as {
    conversation_id?: string;
    my_device_id?: string;
    peer_device_id?: string;
    peer_public_key_jwk?: JsonWebKey;
  } | null;

  if (
    !result?.conversation_id ||
    !result.my_device_id ||
    !result.peer_device_id ||
    !result.peer_public_key_jwk
  ) {
    throw new Error('E2EE_CREATE_INVALID_RESPONSE');
  }

  saveContext({
    userId,
    conversationId: result.conversation_id,
    myDeviceId: result.my_device_id,
    peerDeviceId: result.peer_device_id,
    peerPublicKeyJwk: result.peer_public_key_jwk,
  });

  return result.conversation_id;
}

async function loadConversationContext(
  userId: string,
  conversationId: string,
): Promise<SecretContext> {
  const cached = readCachedContext(userId, conversationId);
  if (cached) return cached;

  const identity = await ensureE2EEDevice(userId);
  const { data, error } = await (supabase as any)
    .from('secret_conversation_devices')
    .select('user_id, device_id, public_key_jwk')
    .eq('conversation_id', conversationId);

  if (error) throw error;
  const bindings = (data ?? []) as Array<{
    user_id: string;
    device_id: string;
    public_key_jwk: JsonWebKey;
  }>;
  const mine = bindings.find((item) => item.user_id === userId);
  const peer = bindings.find((item) => item.user_id !== userId);

  if (!mine || !peer) throw new Error('E2EE_CONTEXT_MISSING');
  if (mine.device_id !== identity.deviceId) throw new Error('E2EE_DEVICE_MISMATCH');

  const context: SecretContext = {
    userId,
    conversationId,
    myDeviceId: mine.device_id,
    peerDeviceId: peer.device_id,
    peerPublicKeyJwk: peer.public_key_jwk,
  };
  saveContext(context);
  return context;
}

async function isSecretConversation(userId: string, conversationId: string): Promise<boolean> {
  const key = contextKey(userId, conversationId);
  if (readCachedContext(userId, conversationId)) return true;
  if (secretModeCache.has(key)) return secretModeCache.get(key) === true;

  const { data, error } = await (supabase as any)
    .from('secret_conversation_devices')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  const isSecret = Boolean(data?.conversation_id);
  secretModeCache.set(key, isSecret);
  return isSecret;
}

async function deriveAesKey(identity: StoredIdentity, context: SecretContext): Promise<CryptoKey> {
  const peerPublicKey = await crypto.subtle.importKey(
    'jwk',
    context.peerPublicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    identity.privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  const salt = await crypto.subtle.digest('SHA-256', encoder.encode(context.conversationId));

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode('alsamos-secret-chat-v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function aadFor(row: Record<string, unknown>): Uint8Array {
  return encoder.encode(
    `${String(row.conversation_id ?? '')}:${String(row.client_message_id ?? '')}:${String(row.sender_id ?? '')}`,
  );
}

function readEnvelope(metadata: unknown): SecretEnvelope | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const e2ee = (metadata as Record<string, unknown>).e2ee;
  if (!e2ee || typeof e2ee !== 'object') return null;
  const value = e2ee as Record<string, unknown>;
  if (
    value.v !== 1 ||
    value.alg !== ALGORITHM ||
    typeof value.iv !== 'string' ||
    typeof value.ciphertext !== 'string' ||
    typeof value.sender_device_id !== 'string'
  ) {
    return null;
  }
  return value as unknown as SecretEnvelope;
}

export function isSecretMessageMetadata(metadata: unknown): boolean {
  return Boolean(readEnvelope(metadata));
}

export async function prepareSecretMessagePayload(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (typeof window === 'undefined') return payload;

  const conversationId = typeof payload.conversation_id === 'string' ? payload.conversation_id : null;
  const senderId = typeof payload.sender_id === 'string' ? payload.sender_id : null;
  if (!conversationId || !senderId) return payload;

  if (!(await isSecretConversation(senderId, conversationId))) return payload;
  const context = await loadConversationContext(senderId, conversationId);

  if (
    payload.media_url ||
    payload.media_type ||
    payload.location_payload ||
    payload.live_location_expires_at
  ) {
    throw new Error('E2EE_TEXT_ONLY_V1');
  }

  const plaintext = typeof payload.content === 'string' ? payload.content : '';
  if (!plaintext) throw new Error('E2EE_EMPTY_MESSAGE');

  const identity = await readIdentity(senderId);
  if (!identity || identity.deviceId !== context.myDeviceId) {
    throw new Error('E2EE_DEVICE_MISMATCH');
  }

  const nextPayload = { ...payload };
  if (!nextPayload.client_message_id) nextPayload.client_message_id = crypto.randomUUID();

  const key = await deriveAesKey(identity, context);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadFor(nextPayload), tagLength: 128 },
    key,
    encoder.encode(plaintext),
  );

  nextPayload.content = '🔒';
  nextPayload.media_url = null;
  nextPayload.media_type = null;
  delete nextPayload.location_payload;
  delete nextPayload.live_location_expires_at;
  nextPayload.metadata = {
    e2ee: {
      v: 1,
      alg: ALGORITHM,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      sender_device_id: context.myDeviceId,
    } satisfies SecretEnvelope,
  };

  return nextPayload;
}

export async function decryptSecretMessageRow<T>(row: T): Promise<T> {
  if (!row || typeof row !== 'object') return row;
  const record = row as Record<string, unknown>;
  const envelope = readEnvelope(record.metadata);
  if (!envelope) return row;

  const conversationId = typeof record.conversation_id === 'string' ? record.conversation_id : null;
  if (!conversationId) return row;

  try {
    const userId = await currentUserId();
    if (!userId) throw new Error('E2EE_NOT_AUTHENTICATED');
    const context = await loadConversationContext(userId, conversationId);
    const identity = await readIdentity(userId);
    if (!identity || identity.deviceId !== context.myDeviceId) {
      throw new Error('E2EE_DEVICE_MISMATCH');
    }

    const key = await deriveAesKey(identity, context);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(envelope.iv),
        additionalData: aadFor(record),
        tagLength: 128,
      },
      key,
      base64ToBytes(envelope.ciphertext),
    );

    return {
      ...record,
      content: decoder.decode(plaintext),
      metadata: {
        ...((record.metadata as Record<string, unknown> | undefined) ?? {}),
        e2ee_decrypted: true,
      },
    } as T;
  } catch (error) {
    const code = error instanceof Error ? error.message : 'E2EE_DECRYPT_FAILED';
    return {
      ...record,
      content: '🔒 Secret Chat',
      metadata: {
        ...((record.metadata as Record<string, unknown> | undefined) ?? {}),
        e2ee_error: code,
      },
    } as T;
  }
}
