/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type CallMode = "direct" | "conference" | "group" | "broadcast";

type CallRow = {
  id: string;
  conversation_id: string | null;
  host_id: string;
  status: string;
  ended_at: string | null;
  call_type: string | null;
  is_group_call: boolean | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signLiveKitToken(
  apiKey: string,
  apiSecret: string,
  payload: Record<string, unknown>
) {
  const encodedHeader = base64Url(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  );
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", apiSecret).update(unsigned).digest();
  return `${unsigned}.${base64Url(signature)}`;
}

function normalizeWsUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^wss?:\/\//i.test(trimmed)) {
    throw new Error("LIVEKIT_URL must start with wss:// or ws://");
  }
  if (
    process.env.VERCEL_ENV === "production" &&
    !trimmed.toLowerCase().startsWith("wss://")
  ) {
    throw new Error("Production LIVEKIT_URL must use wss://");
  }
  return trimmed;
}

async function readJsonBody(req: any): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (Buffer.byteLength(body, "utf8") > 32 * 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function setSecurityHeaders(res: any) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export default async function handler(req: any, res: any) {
  setSecurityHeaders(res);

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authorization = String(req.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization bearer token is required" });
    return;
  }

  const liveKitUrl = String(
    process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || ""
  );
  const liveKitApiKey = String(process.env.LIVEKIT_API_KEY || "");
  const liveKitApiSecret = String(process.env.LIVEKIT_API_SECRET || "");

  if (!liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    res.status(503).json({
      error:
        "SFU media server konfiguratsiyasi tayyor emas: LIVEKIT_URL, LIVEKIT_API_KEY va LIVEKIT_API_SECRET kerak",
    });
    return;
  }

  const supabaseUrl = String(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ""
  );
  const supabaseAnonKey = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      ""
  );

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(503).json({ error: "Supabase server configuration is missing" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const callId = String(body.callId || "").trim();
    if (!UUID_RE.test(callId)) {
      res.status(400).json({ error: "Valid callId is required" });
      return;
    }

    const accessToken = authorization.slice("Bearer ".length).trim();
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      res.status(401).json({ error: "Invalid or expired user session" });
      return;
    }

    const { data: call, error: callError } = await supabase
      .from("video_calls")
      .select(
        "id, conversation_id, host_id, status, ended_at, call_type, is_group_call"
      )
      .eq("id", callId)
      .maybeSingle();

    if (callError) throw callError;
    if (!call) {
      res.status(404).json({ error: "Call not found" });
      return;
    }

    const typedCall = call as CallRow;
    if (typedCall.ended_at || typedCall.status === "ended") {
      res.status(409).json({ error: "Call has already ended" });
      return;
    }

    const { data: participant, error: participantError } = await supabase
      .from("call_participants")
      .select("user_id, left_at")
      .eq("call_id", callId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .maybeSingle();

    if (participantError) throw participantError;
    if (!participant && typedCall.host_id !== user.id) {
      res.status(403).json({ error: "You are not an active participant of this call" });
      return;
    }

    let conversationType: string | null = null;
    if (typedCall.conversation_id) {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("type")
        .eq("id", typedCall.conversation_id)
        .maybeSingle();

      if (conversationError) throw conversationError;
      conversationType = conversation?.type ?? null;
    }

    const { count: activeCount, error: countError } = await supabase
      .from("call_participants")
      .select("user_id", { count: "exact", head: true })
      .eq("call_id", callId)
      .is("left_at", null);

    if (countError) throw countError;

    let mode: CallMode;
    if (conversationType === "channel") {
      mode = "broadcast";
    } else if (conversationType === "group") {
      mode = "group";
    } else if ((activeCount ?? 0) > 2 || typedCall.is_group_call) {
      mode = "conference";
    } else {
      mode = "direct";
    }

    const canPublish = mode !== "broadcast" || typedCall.host_id === user.id;
    const roomName = `alsamos-${callId}`;
    const now = Math.floor(Date.now() / 1000);

    const token = signLiveKitToken(liveKitApiKey, liveKitApiSecret, {
      iss: liveKitApiKey,
      sub: user.id,
      jti: randomUUID(),
      nbf: now - 5,
      exp: now + 60 * 60,
      metadata: JSON.stringify({
        callId,
        conversationId: typedCall.conversation_id,
        mode,
      }),
      attributes: {
        "alsamos.call_id": callId,
        "alsamos.call_mode": mode,
      },
      video: {
        roomJoin: true,
        room: roomName,
        canPublish,
        canSubscribe: true,
        canPublishData: mode !== "broadcast" || canPublish,
        canUpdateOwnMetadata: true,
      },
    });

    res.status(200).json({
      token,
      wsUrl: normalizeWsUrl(liveKitUrl),
      roomName,
      mode,
      canPublish,
    });
  } catch (error) {
    console.error("[call-token] failed", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Call token generation failed",
    });
  }
}
