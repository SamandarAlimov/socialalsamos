const STRUCTURED_POST_SCHEMA_KEY = 'alsamos.create.structured-post-schema.v1';

export type StructuredPostSchemaCapability = 'available' | 'missing' | null;

let runtimeCapability: StructuredPostSchemaCapability = null;

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

export function isMissingStructuredPostSchemaError(error: unknown): boolean {
  const value = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;

  const text = [value?.code, value?.message, value?.details, value?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    value?.code === '42P01' ||
    value?.code === '42703' ||
    value?.code === 'PGRST202' ||
    value?.code === 'PGRST204' ||
    value?.code === 'PGRST205' ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find the table') ||
    text.includes('could not find the function') ||
    text.includes('404') ||
    text.includes('not found')
  );
}
