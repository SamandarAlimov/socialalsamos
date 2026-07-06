import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "get_profile",
  title: "Get user profile",
  description:
    "Get an Alsamos public profile by username. Omit username to return the signed-in user's profile.",
  inputSchema: {
    username: z
      .string()
      .trim()
      .optional()
      .describe("Username to look up. If omitted, returns the current user."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ username }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const query = supabase
      .from("profiles")
      .select(
        "id, username, display_name, bio, avatar_url, followers_count, following_count",
      )
      .limit(1);

    const { data, error } = username
      ? await query.eq("username", username).maybeSingle()
      : await query.eq("id", ctx.getUserId()).maybeSingle();

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: "Profile not found" }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { profile: data },
    };
  },
});
