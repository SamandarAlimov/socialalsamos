import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchPostsTool from "./tools/search-posts";
import listMarketplaceProductsTool from "./tools/list-marketplace-products";
import getProfileTool from "./tools/get-profile";

// Project ref is inlined at build time by Vite. The fallback keeps the issuer
// well-formed during the throwaway manifest-extract eval.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "alsamos-mcp",
  title: "Alsamos",
  version: "0.1.0",
  instructions:
    "Tools for the Alsamos superapp. Use `search_posts` to find posts by keyword, `list_marketplace_products` to browse the marketplace, and `get_profile` to read a user profile (defaults to the signed-in user).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchPostsTool, listMarketplaceProductsTool, getProfileTool],
});
