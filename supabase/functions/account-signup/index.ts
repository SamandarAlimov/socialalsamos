// POST /account-signup
//
// Creates the primary Alsamos identity without depending on an email or SMS
// delivery service. Email and phone are both required, but only the email is
// marked confirmed for Auth so the user can sign in immediately. The phone is
// stored as an unverified identity/contact-discovery attribute until Alsamos
// adds an OTP provider.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  clientIp,
  guard,
  guardError,
  jsonResponse,
  preflight,
  sha256Hex,
} from "../_shared/guard.ts";

const FUNCTION_NAME = "account-signup";
const SIGNUP_LIMIT_PER_HOUR = 10;
const ALSAMOS_DOMAIN = "alsamos.com";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isIdentityEmail(value: string): boolean {
  return new RegExp(`^[a-z0-9._%+-]{1,64}@${ALSAMOS_DOMAIN.replace(".", "\\.")}$`).test(value);
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const phone = `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}

function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return guardError(req, "METHOD_NOT_ALLOWED", "Faqat POST so'rovi qabul qilinadi.", 405);
  }

  // Public endpoint: a session does not exist yet. guard() records a hashed IP
  // and provides the service-role client. We also enforce the count below even
  // when AUTH_ENFORCE=log, so admin user creation can never become unlimited.
  const gate = await guard(req, {
    functionName: FUNCTION_NAME,
    requireAuth: false,
    limit: SIGNUP_LIMIT_PER_HOUR,
    windowMinutes: 60,
  });
  if (gate.response) return gate.response;

  const ipHash = await sha256Hex(`${FUNCTION_NAME}:${clientIp(req)}`);
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: recentSignups } = await gate.admin
    .from("function_usage")
    .select("id", { count: "exact", head: true })
    .eq("function_name", FUNCTION_NAME)
    .eq("ip_hash", ipHash)
    .eq("outcome", "allowed")
    .gte("created_at", since);

  if ((recentSignups ?? 0) > SIGNUP_LIMIT_PER_HOUR) {
    return guardError(
      req,
      "TOO_MANY_ATTEMPTS",
      "Juda ko'p ro'yxatdan o'tish urinishlari. Birozdan so'ng qayta urinib ko'ring.",
      429,
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return guardError(req, "INVALID_REQUEST", "Ro'yxatdan o'tish ma'lumotlari topilmadi.", 400);
  }

  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const username = normalizeUsername(body.username);
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 100) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const acceptedTerms = body.acceptedTerms === true;
  const tosVersion = typeof body.tosVersion === "string" ? body.tosVersion.trim().slice(0, 40) : null;

  if (!isIdentityEmail(email)) {
    return guardError(req, "INVALID_REQUEST", `Email @${ALSAMOS_DOMAIN} manzilida bo'lishi kerak.`, 400);
  }
  if (!phone) {
    return guardError(req, "INVALID_REQUEST", "Telefon raqamni xalqaro formatda kiriting.", 400);
  }
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return guardError(req, "INVALID_REQUEST", "Username 3-30 belgi, faqat a-z, 0-9 va _ bo'lishi kerak.", 400);
  }
  if (password.length < 10 || password.length > 128) {
    return guardError(req, "INVALID_REQUEST", "Parol kamida 10 ta belgidan iborat bo'lishi kerak.", 400);
  }
  if (!acceptedTerms) {
    return guardError(req, "INVALID_REQUEST", "Foydalanish shartlarini qabul qilish talab etiladi.", 400);
  }

  const [{ data: usernameTaken }, { data: phoneTaken }] = await Promise.all([
    gate.admin.from("profiles").select("id").eq("username", username).maybeSingle(),
    gate.admin.from("auth_identities").select("id").eq("phone", phone).maybeSingle(),
  ]);

  if (usernameTaken) {
    return jsonResponse(req, { error: "USERNAME_TAKEN", message: "Bu username band." }, 409);
  }
  if (phoneTaken) {
    return jsonResponse(req, { error: "PHONE_TAKEN", message: "Bu telefon raqami allaqachon ishlatilgan." }, 409);
  }

  const { data: created, error: createError } = await gate.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: displayName || username,
      phone,
      tos_version: tosVersion,
    },
  });

  if (createError || !created?.user) {
    const duplicate = /already|registered|exists/i.test(createError?.message ?? "");
    return jsonResponse(
      req,
      {
        error: duplicate ? "ACCOUNT_EXISTS" : "SIGNUP_FAILED",
        message: duplicate
          ? "Bu email bilan akkaunt allaqachon mavjud."
          : "Akkaunt yaratilmadi. Qaytadan urinib ko'ring.",
      },
      duplicate ? 409 : 500,
    );
  }

  // The auth.users triggers create profiles/auth_identities/identity_accounts.
  // Phone verification intentionally stays NULL until an OTP provider exists.
  return jsonResponse(
    req,
    {
      ok: true,
      user_id: created.user.id,
      email_confirmed: true,
      phone_verified: false,
    },
    201,
  );
});
