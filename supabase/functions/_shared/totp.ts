// RFC 6238 TOTP + RFC 4648 base32, implemented on Web Crypto only.
//
// Why hand-rolled: the runtime has no TOTP primitive and pulling a third
// party module into an auth path would widen the trust boundary.
//
// Properties:
//   * SHA-1 / 6 digits / 30 s step (what Google Authenticator, Authy,
//     1Password and Aegis all default to);
//   * verification accepts a +/-1 step window for clock drift;
//   * every accepted step is returned so the caller can refuse replays.

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += B32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const idx = B32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
}

/** 20 random bytes = 160 bit shared secret, as recommended by RFC 4226. */
export function generateTotpSecret(bytes = 20): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base32Encode(buf);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(signature);
}

export async function totpCodeForStep(
  secret: string,
  step: number,
  digits = 6,
): Promise<string> {
  const key = base32Decode(secret);
  if (key.length === 0) return "";

  const counter = new Uint8Array(8);
  let value = step;
  for (let i = 7; i >= 0; i--) {
    counter[i] = value & 0xff;
    value = Math.floor(value / 256);
  }

  const digest = await hmacSha1(key, counter);
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function currentTotpStep(now: number = Date.now(), timeStep = 30): number {
  return Math.floor(now / 1000 / timeStep);
}

/** Constant-time string comparison for secrets and one-time codes. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type TotpVerification = { valid: boolean; step: number | null };

/**
 * Verify a 6-digit code. `minStep` refuses codes from a step that was already
 * used (replay protection), which matters because a code stays valid for 30 s.
 */
export async function verifyTotp(
  secret: string,
  code: unknown,
  options: { window?: number; digits?: number; timeStep?: number; minStep?: number | null; now?: number } = {},
): Promise<TotpVerification> {
  const digits = options.digits ?? 6;
  const window = options.window ?? 1;
  const timeStep = options.timeStep ?? 30;
  const normalized = typeof code === "string" ? code.replace(/[^0-9]/g, "") : "";

  if (normalized.length !== digits || !secret) return { valid: false, step: null };

  const current = currentTotpStep(options.now ?? Date.now(), timeStep);

  for (let drift = -window; drift <= window; drift++) {
    const step = current + drift;
    if (options.minStep != null && step <= options.minStep) continue;

    const expected = await totpCodeForStep(secret, step, digits);
    if (expected && timingSafeEqual(expected, normalized)) {
      return { valid: true, step };
    }
  }

  return { valid: false, step: null };
}

export function otpauthUrl(params: {
  secret: string;
  account: string;
  issuer?: string;
  digits?: number;
  period?: number;
}): string {
  const issuer = params.issuer ?? "Alsamos";
  const label = encodeURIComponent(`${issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(params.digits ?? 6),
    period: String(params.period ?? 30),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Recovery codes: 10 groups of "xxxx-xxxx-xxxx" using the base32 alphabet
 * (no ambiguous 0/1/O/I characters). ~60 bits of entropy per code.
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    const raw = base32Encode(buf).slice(0, 12);
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`);
  }

  return codes;
}

/** Canonical form used before hashing, so formatting never matters. */
export function normalizeRecoveryCode(value: unknown): string {
  return typeof value === "string"
    ? value.toUpperCase().replace(/[^A-Z2-7]/g, "")
    : "";
}
