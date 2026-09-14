import type { MediaKind } from '@/lib/postComposer';

const DB_NAME = 'alsamos-create-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'media-drafts';
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const FLAG_PREFIX = 'alsamos.create.media-draft';

export interface CreateMediaDraftSource {
  id: string;
  file: File;
  kind: MediaKind;
  width?: number;
  height?: number;
  durationSeconds?: number;
  aspectRatio?: string;
  altText?: string;
  editState?: Record<string, unknown>;
}

export interface StoredCreateMediaDraftItem {
  id: string;
  blob: Blob;
  fileName: string;
  fileType: string;
  lastModified: number;
  kind: MediaKind;
  width?: number;
  height?: number;
  durationSeconds?: number;
  aspectRatio?: string;
  altText?: string;
  editState?: Record<string, unknown>;
}

interface StoredCreateMediaDraft {
  draftKey: string;
  updatedAt: number;
  items: StoredCreateMediaDraftItem[];
}

export interface RestoredCreateMediaDraftItem {
  id: string;
  file: File;
  kind: MediaKind;
  width?: number;
  height?: number;
  durationSeconds?: number;
  aspectRatio?: string;
  altText?: string;
  editState?: Record<string, unknown>;
}

export function createMediaDraftKey(userId: string, kind: string): string {
  return `${userId}:${kind}`;
}

export function createMediaDraftFlagKey(draftKey: string): string {
  return `${FLAG_PREFIX}:${draftKey}`;
}

export function hasPersistedCreateMediaDraft(draftKey: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(createMediaDraftFlagKey(draftKey)) === '1';
  } catch {
    return false;
  }
}

function setPersistedFlag(draftKey: string, value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = createMediaDraftFlagKey(draftKey);
    if (value) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Private mode / quota failures must not break Create.
  }
}

function cloneEditState(
  editState?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!editState) return undefined;
  try {
    if (typeof structuredClone === 'function') return structuredClone(editState);
  } catch {
    // Fall through to JSON-safe clone.
  }
  try {
    return JSON.parse(JSON.stringify(editState)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function createMediaDraftSnapshot(
  items: CreateMediaDraftSource[],
): StoredCreateMediaDraftItem[] {
  return items.map((item) => ({
    id: item.id,
    blob: item.file,
    fileName: item.file.name,
    fileType: item.file.type,
    lastModified: item.file.lastModified,
    kind: item.kind,
    width: item.width,
    height: item.height,
    durationSeconds: item.durationSeconds,
    aspectRatio: item.aspectRatio,
    altText: item.altText,
    editState: cloneEditState(item.editState),
  }));
}

export function restoreMediaDraftSnapshot(
  items: StoredCreateMediaDraftItem[],
): RestoredCreateMediaDraftItem[] {
  return items.map((item) => ({
    id: item.id,
    file: new File([item.blob], item.fileName || `draft-${item.id}`, {
      type: item.fileType || item.blob.type,
      lastModified: item.lastModified || Date.now(),
    }),
    kind: item.kind,
    width: item.width,
    height: item.height,
    durationSeconds: item.durationSeconds,
    aspectRatio: item.aspectRatio,
    altText: item.altText,
    editState: cloneEditState(item.editState),
  }));
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'draftKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function runRequest<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveCreateMediaDraft(
  draftKey: string,
  items: CreateMediaDraftSource[],
): Promise<boolean> {
  if (!draftKey) return false;
  if (items.length === 0) {
    await clearCreateMediaDraft(draftKey);
    return true;
  }

  const database = await openDatabase();
  if (!database) return false;

  try {
    const record: StoredCreateMediaDraft = {
      draftKey,
      updatedAt: Date.now(),
      items: createMediaDraftSnapshot(items),
    };
    const result = await runRequest(database, 'readwrite', (store) => store.put(record));
    const saved = result !== null;
    if (saved) setPersistedFlag(draftKey, true);
    return saved;
  } finally {
    database.close();
  }
}

export async function loadCreateMediaDraft(
  draftKey: string,
): Promise<RestoredCreateMediaDraftItem[]> {
  if (!draftKey) return [];
  const database = await openDatabase();
  if (!database) return [];

  try {
    const result = await runRequest<StoredCreateMediaDraft>(
      database,
      'readonly',
      (store) => store.get(draftKey),
    );
    if (!result) {
      setPersistedFlag(draftKey, false);
      return [];
    }

    if (
      typeof result.updatedAt !== 'number' ||
      Date.now() - result.updatedAt > DRAFT_TTL_MS ||
      !Array.isArray(result.items)
    ) {
      await clearCreateMediaDraft(draftKey);
      return [];
    }

    const restored = restoreMediaDraftSnapshot(result.items);
    setPersistedFlag(draftKey, restored.length > 0);
    return restored;
  } finally {
    database.close();
  }
}

export async function clearCreateMediaDraft(draftKey: string): Promise<void> {
  if (!draftKey) return;
  setPersistedFlag(draftKey, false);

  const database = await openDatabase();
  if (!database) return;
  try {
    await runRequest(database, 'readwrite', (store) => store.delete(draftKey));
  } finally {
    database.close();
  }
}
