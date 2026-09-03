const STRUCTURED_POST_SCHEMA_KEY = 'alsamos.create.structured-post-schema.v1';

export type StructuredPostSchemaCapability = 'available' | 'missing' | null;
export type StructuredPostTable =
  | 'post_media'
  | 'post_locations'
  | 'post_music';

let runtimeCapability: StructuredPostSchemaCapability = null;

const tableCapability = new Map<
  StructuredPostTable,
  { value: Exclude<StructuredPostSchemaCapability, null>; checkedAt: number }
>();
const tableChecks = new Map<StructuredPostTable, Promise<boolean>>();
const MISSING_TABLE_RETRY_MS = 30_000;

export function readStructuredPostSchemaCapability(): StructuredPostSchemaCapability {
  if (runtimeCapability) return runtimeCapability;
  if (typeof window === 'undefined') return null;

  try {
    const value = sessionStorage.getItem(STRUCTURED_POST_SCHEMA_KEY);
    if (value === 'available' || value === 'missing') {
      runtimeCapability = value;
      return value;
    }
  } catch {
    // Browser storage ishlamasa ham runtime cache ishlashda davom etadi.
  }

  return null;
}

export function writeStructuredPostSchemaCapability(
  value: Exclude<StructuredPostSchemaCapability, null>,
): void {
  runtimeCapability = value;
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(STRUCTURED_POST_SCHEMA_KEY, value);
  } catch {
    // Capability cache is only an optimization.
  }
}

export function writeStructuredPostTableCapability(
  table: StructuredPostTable,
  value: Exclude<StructuredPostSchemaCapability, null>,
): void {
  tableCapability.set(table, { value, checkedAt: Date.now() });

  // Eski global capability faqat "available" bilan yangilanadi.
  // Bitta missing table boshqa structured tablelarni o'chirib qo'ymaydi.
  if (value === 'available') writeStructuredPostSchemaCapability('available');
}

export function readStructuredPostTableCapability(
  table: StructuredPostTable,
): StructuredPostSchemaCapability {
  const cached = tableCapability.get(table);
  if (!cached) return null;

  if (
    cached.value === 'missing' &&
    Date.now() - cached.checkedAt >= MISSING_TABLE_RETRY_MS
  ) {
    tableCapability.delete(table);
    return null;
  }

  return cached.value;
}

/**
 * Home'dagi ko'p card bir xil missing table uchun parallel 404 yubormasligi
 * uchun bitta probe ishlaydi. Missing natija 30 soniyadan keyin qayta
 * tekshiriladi, shuning uchun Lovable SQL run qilingach SPA ham tiklana oladi.
 */
export async function ensureStructuredPostTable(
  table: StructuredPostTable,
  probe: () => PromiseLike<{ error?: unknown | null }>,
): Promise<boolean> {
  const cached = readStructuredPostTableCapability(table);
  if (cached === 'available') return true;
  if (cached === 'missing') return false;

  const pending = tableChecks.get(table);
  if (pending) return pending;

  const check = Promise.resolve()
    .then(async () => {
      try {
        const result = await probe();
        if (result?.error) {
          if (isMissingStructuredPostSchemaError(result.error)) {
            writeStructuredPostTableCapability(table, 'missing');
            return false;
          }
          return true;
        }

        writeStructuredPostTableCapability(table, 'available');
        return true;
      } catch (error) {
        if (isMissingStructuredPostSchemaError(error)) {
          writeStructuredPostTableCapability(table, 'missing');
          return false;
        }
        return true;
      }
    })
    .finally(() => {
      tableChecks.delete(table);
    });

  tableChecks.set(table, check);
  return check;
}

export function isMissingStructuredPostSchemaError(error: unknown): boolean {
  const value = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
    status?: number;
  } | null;

  const text = [
    value?.code,
    value?.message,
    value?.details,
    value?.hint,
    value?.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    value?.code === '42P01' ||
    value?.code === '42703' ||
    value?.code === 'PGRST202' ||
    value?.code === 'PGRST204' ||
    value?.code === 'PGRST205' ||
    value?.status === 404 ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find the table') ||
    text.includes('could not find the function') ||
    text.includes('404') ||
    text.includes('not found')
  );
}
