// Alsamos AI — authenticated first-party superapp capabilities.
//
// These tools are intentionally separate from generic web/media tools because
// they can read the signed-in user's private platform state. Every query is
// scoped by ctx.userId even though ai-agent uses a service-role client.

import type { ToolContext, ToolOutcome, ToolSpec } from "./aiTools.ts";

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

export const PLATFORM_TOOL_NAMES = [
  "search_alsamos_platform",
  "my_search_insights",
  "my_payment_history",
  "my_marketplace_orders",
  "my_saved_places",
  "get_recommendation_preferences",
  "update_recommendation_preferences",
] as const;

export const PLATFORM_TOOL_SPECS: Record<string, ToolSpec> = {
  search_alsamos_platform: {
    type: "function",
    function: {
      name: "search_alsamos_platform",
      description:
        "Primary first-party Alsamos search across Marketplace stores/products, public posts/profiles and Alsamos Map places. Use this BEFORE web_search when the user asks about an entity, product, store, post, person or location that may exist inside Alsamos. This is platform search, not the public internet. For the user's own saved/favorite places use my_saved_places instead.",
      parameters: {
        type: "object",
        properties: {
          query: str("What to find inside Alsamos, e.g. 'Alsamos Store', 'HP Victus 15', a post topic, username or place name."),
          scope: {
            type: "string",
            enum: ["all", "marketplace", "posts", "places", "people"],
            description: "Optional area to search. Default all.",
          },
          limit: num("Maximum matches per result type (1-12, default 6)."),
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  my_search_insights: {
    type: "function",
    function: {
      name: "my_search_insights",
      description:
        "Read the signed-in user's own Alsamos search activity and summarize what they search most often. Use for questions like 'What do I search most?', 'What did I search last month?', or when the user asks about their own search activity. Never use it for another user.",
      parameters: {
        type: "object",
        properties: {
          days: num("Lookback window in days (1-730, default 30)."),
          query_contains: str("Optional text filter applied to the user's own queries."),
          limit: num("How many top/recent entries to return (1-30, default 10)."),
        },
        additionalProperties: false,
      },
    },
  },
  my_payment_history: {
    type: "function",
    function: {
      name: "my_payment_history",
      description:
        "Read the signed-in user's own Alsamos Wallet ledger. Use for questions about payments, transfers, purchases, top-ups, dates, amounts, or payments to/from a specific person. This is read-only and must never move money.",
      parameters: {
        type: "object",
        properties: {
          days: num("Lookback window in days (1-730, default 30)."),
          from: str("Optional inclusive ISO date/time, e.g. 2026-08-01 or 2026-08-01T00:00:00Z."),
          to: str("Optional exclusive ISO date/time."),
          person: str("Optional username/display name/account counterpart filter."),
          direction: {
            type: "string",
            enum: ["all", "debit", "credit"],
            description: "Ledger direction filter, default all.",
          },
          limit: num("Maximum matching ledger rows (1-100, default 40)."),
        },
        additionalProperties: false,
      },
    },
  },
  my_marketplace_orders: {
    type: "function",
    function: {
      name: "my_marketplace_orders",
      description:
        "Read the signed-in user's own Alsamos Marketplace purchases/orders, including line items, seller, payment and delivery status. Use for questions like 'What did I buy last month?', 'Where is my order?', or 'How much did I spend on Marketplace?'. Read-only.",
      parameters: {
        type: "object",
        properties: {
          days: num("Lookback window in days (1-730, default 90)."),
          from: str("Optional inclusive ISO date/time."),
          to: str("Optional exclusive ISO date/time."),
          status: str("Optional exact order status filter."),
          limit: num("Maximum orders to return (1-50, default 20)."),
        },
        additionalProperties: false,
      },
    },
  },
  my_saved_places: {
    type: "function",
    function: {
      name: "my_saved_places",
      description:
        "Read the signed-in user's own saved Alsamos Map places and coordinates. Use for questions like 'Which places did I save?', 'Show my favorite cafes', or when the user asks AI to reason about their own saved places. Read-only; never invent coordinates.",
      parameters: {
        type: "object",
        properties: {
          query: str("Optional place name/address text filter."),
          category: str("Optional category filter."),
          favorites_only: { type: "boolean", description: "Return only favorite saved places." },
          limit: num("Maximum saved places to return (1-50, default 20)."),
        },
        additionalProperties: false,
      },
    },
  },
  get_recommendation_preferences: {
    type: "function",
    function: {
      name: "get_recommendation_preferences",
      description:
        "Read the signed-in user's explicit recommendation topics. These preferences directly influence Home/Video recommendation ranking in addition to behavioral signals.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  update_recommendation_preferences: {
    type: "function",
    function: {
      name: "update_recommendation_preferences",
      description:
        "Change the signed-in user's explicit Alsamos recommendation topics ONLY when the user explicitly asks to change what their feed recommends. Example: 'Show me more Islamic lectures and Muhammad Sodiq Muhammad Yusuf'. Positive weights mean more, negative weights mean less. The change affects the real recommendation ranker; do not merely remember it as a note.",
      parameters: {
        type: "object",
        properties: {
          changes: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                topic: str("A concise topic, creator name, phrase, hashtag, or interest to tune."),
                operation: {
                  type: "string",
                  enum: ["increase", "decrease", "set", "remove"],
                },
                weight: num("For set: value -3..3. For increase/decrease: step 0.25..2, default 1."),
              },
              required: ["topic", "operation"],
              additionalProperties: false,
            },
          },
        },
        required: ["changes"],
        additionalProperties: false,
      },
    },
  },
};

function fail(text: string): ToolOutcome {
  return { ok: false, text };
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanTopic(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("pgrst") ||
    text.includes("does not exist") ||
    text.includes("schema cache")
  );
}

async function personalizationAllowed(ctx: ToolContext): Promise<boolean> {
  if (!ctx.userId) return false;

  // The settings table predates these AI tools in some deployments. A missing
  // table/column is treated as legacy/default rather than breaking the agent;
  // an explicit `false` is always respected.
  const { data, error } = await ctx.admin
    .from("user_settings")
    .select("ai_personalization")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (error) {
    const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
    if (
      text.includes("does not exist") ||
      text.includes("schema cache") ||
      text.includes("42703") ||
      text.includes("42p01") ||
      text.includes("pgrst")
    ) {
      return true;
    }
    throw error;
  }

  return data?.ai_personalization !== false;
}

async function requirePrivateAccess(ctx: ToolContext): Promise<ToolOutcome | null> {
  if (!ctx.userId) return fail("Bu ma’lumot uchun tizimga kirish kerak.");
  try {
    const allowed = await personalizationAllowed(ctx);
    if (!allowed) {
      return fail(
        "AI personalization foydalanuvchi sozlamalarida o‘chirilgan. Shaxsiy search/payment/recommendation ma’lumotlarini o‘qimayman.",
      );
    }
    return null;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}


function publicSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[%,()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function compactPlatformText(value: unknown, max = 600): string | null {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return null;
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function alsamosMapPath(
  latitude: unknown,
  longitude: unknown,
  name: unknown,
): string | null {
  const lat = finiteNumber(latitude);
  const lng = finiteNumber(longitude);
  if (lat === null || lng === null) return null;
  return `/map?destLat=${encodeURIComponent(String(lat))}&destLng=${encodeURIComponent(String(lng))}&destName=${encodeURIComponent(String(name || "Joy"))}`;
}

async function searchAlsamosPlatform(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const queryText = publicSearchText(args.query);
  if (!queryText) return fail("query talab qilinadi.");

  const requestedScope = String(args.scope ?? "all");
  const scope = ["all", "marketplace", "posts", "places", "people"].includes(requestedScope)
    ? requestedScope
    : "all";
  const limit = Math.round(clamp(args.limit, 1, 12, 6));
  const includes = (target: string) => scope === "all" || scope === target;

  const result: {
    query: string;
    scope: string;
    stores: unknown[];
    products: unknown[];
    posts: unknown[];
    places: unknown[];
    people: unknown[];
  } = {
    query: queryText,
    scope,
    stores: [],
    products: [],
    posts: [],
    places: [],
    people: [],
  };

  if (includes("marketplace")) {
    const [sellerSearch, productSearch] = await Promise.all([
      ctx.admin
        .from("sellers")
        .select("id, user_id, business_name, store_name, business_type, description, logo_url, location, is_verified, rating, total_reviews, total_sales, status, created_at")
        .eq("status", "active")
        .or(
          `business_name.ilike.%${queryText}%,store_name.ilike.%${queryText}%,description.ilike.%${queryText}%,location.ilike.%${queryText}%`,
        )
        .order("created_at", { ascending: false })
        .limit(limit),
      ctx.admin
        .from("products")
        .select("id, seller_id, title, description, price, compare_at_price, currency, location, latitude, longitude, status, is_featured, likes_count, views_count, created_at, images")
        .eq("status", "active")
        .or(
          `title.ilike.%${queryText}%,description.ilike.%${queryText}%,location.ilike.%${queryText}%`,
        )
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (sellerSearch.error) return fail(sellerSearch.error.message);
    if (productSearch.error) return fail(productSearch.error.message);

    const sellerRows = [...(sellerSearch.data ?? [])] as Array<Record<string, any>>;
    const productMap = new Map<string, Record<string, any>>();
    for (const product of productSearch.data ?? []) productMap.set(String(product.id), product as Record<string, any>);

    const initialSellerIds = [...new Set(sellerRows.map((seller) => String(seller.id)).filter(Boolean))];
    if (initialSellerIds.length) {
      const sellerProducts = await ctx.admin
        .from("products")
        .select("id, seller_id, title, description, price, compare_at_price, currency, location, latitude, longitude, status, is_featured, likes_count, views_count, created_at, images")
        .eq("status", "active")
        .in("seller_id", initialSellerIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(limit, limit * 2));
      if (sellerProducts.error) return fail(sellerProducts.error.message);
      for (const product of sellerProducts.data ?? []) productMap.set(String(product.id), product as Record<string, any>);
    }

    const allProducts = [...productMap.values()];
    const productSellerIds = [...new Set(allProducts.map((product) => String(product.seller_id)).filter(Boolean))];
    const knownSellerIds = new Set(sellerRows.map((seller) => String(seller.id)));
    const missingSellerIds = productSellerIds.filter((sellerId) => !knownSellerIds.has(sellerId));
    if (missingSellerIds.length) {
      const relatedSellers = await ctx.admin
        .from("sellers")
        .select("id, user_id, business_name, store_name, business_type, description, logo_url, location, is_verified, rating, total_reviews, total_sales, status, created_at")
        .in("id", missingSellerIds)
        .eq("status", "active");
      if (relatedSellers.error) return fail(relatedSellers.error.message);
      sellerRows.push(...((relatedSellers.data ?? []) as Array<Record<string, any>>));
    }

    const sellerMap = new Map(sellerRows.map((seller) => [String(seller.id), seller]));
    const productRows = allProducts.slice(0, Math.max(limit, initialSellerIds.length ? limit * 2 : limit));

    result.products = productRows.map((product) => {
      const seller = sellerMap.get(String(product.seller_id));
      const displayName = seller?.store_name || seller?.business_name || null;
      const latitude = finiteNumber(product.latitude);
      const longitude = finiteNumber(product.longitude);
      return {
        id: product.id,
        title: product.title,
        description: compactPlatformText(product.description),
        price: product.price === null || product.price === undefined ? null : Number(product.price),
        compare_at_price:
          product.compare_at_price === null || product.compare_at_price === undefined
            ? null
            : Number(product.compare_at_price),
        currency: product.currency,
        location: product.location,
        latitude,
        longitude,
        is_featured: product.is_featured,
        likes_count: product.likes_count,
        views_count: product.views_count,
        created_at: product.created_at,
        image_url: Array.isArray(product.images) ? product.images.find((value: unknown) => typeof value === "string") ?? null : null,
        seller: seller
          ? {
              id: seller.id,
              name: displayName,
              is_verified: seller.is_verified,
            }
          : null,
        product_path: `/marketplace/product/${encodeURIComponent(String(product.id))}`,
        store_path: product.seller_id
          ? `/marketplace/store/${encodeURIComponent(String(product.seller_id))}`
          : null,
        map_path: alsamosMapPath(latitude, longitude, product.title || displayName || product.location),
      };
    });

    const productsBySeller = new Map<string, Array<Record<string, any>>>();
    for (const product of allProducts) {
      const key = String(product.seller_id || "");
      if (!key) continue;
      const rows = productsBySeller.get(key) ?? [];
      rows.push(product);
      productsBySeller.set(key, rows);
    }

    result.stores = sellerRows.slice(0, limit).map((seller) => {
      const sellerProducts = productsBySeller.get(String(seller.id)) ?? [];
      const locationProduct = sellerProducts.find((product) =>
        Boolean(product.location) ||
        (finiteNumber(product.latitude) !== null && finiteNumber(product.longitude) !== null)
      );
      const location = compactPlatformText(seller.location, 240) || compactPlatformText(locationProduct?.location, 240);
      const latitude = finiteNumber(locationProduct?.latitude);
      const longitude = finiteNumber(locationProduct?.longitude);
      const name = seller.store_name || seller.business_name || "Store";
      return {
        id: seller.id,
        name,
        business_name: seller.business_name,
        business_type: seller.business_type,
        description: compactPlatformText(seller.description),
        logo_url: seller.logo_url,
        is_verified: seller.is_verified,
        rating: seller.rating === null || seller.rating === undefined ? null : Number(seller.rating),
        total_reviews: seller.total_reviews,
        total_sales: seller.total_sales,
        location,
        latitude,
        longitude,
        location_source: seller.location ? "seller" : locationProduct ? "active_product" : null,
        store_path: `/marketplace/store/${encodeURIComponent(String(seller.id))}`,
        map_path: alsamosMapPath(latitude, longitude, name),
      };
    });
  }

  if (includes("posts")) {
    const posts = await ctx.admin
      .from("posts")
      .select("id, user_id, content, media_urls, thumbnail_url, likes_count, comments_count, views_count, created_at, location, location_name, location_address, location_lat, location_lng, source_title")
      .eq("visibility", "public")
      .eq("status", "published")
      .or("is_hidden.eq.false,is_hidden.is.null")
      .or(
        `content.ilike.%${queryText}%,source_title.ilike.%${queryText}%,location.ilike.%${queryText}%,location_name.ilike.%${queryText}%,location_address.ilike.%${queryText}%`,
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (posts.error) return fail(posts.error.message);

    const authorIds = [...new Set((posts.data ?? []).map((post) => String(post.user_id)).filter(Boolean))];
    const authorMap = new Map<string, Record<string, any>>();
    if (authorIds.length) {
      const authors = await ctx.admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified")
        .in("id", authorIds);
      if (authors.error) return fail(authors.error.message);
      for (const author of authors.data ?? []) authorMap.set(String(author.id), author as Record<string, any>);
    }

    result.posts = (posts.data ?? []).map((post) => {
      const author = authorMap.get(String(post.user_id));
      const latitude = finiteNumber(post.location_lat);
      const longitude = finiteNumber(post.location_lng);
      return {
        id: post.id,
        content: compactPlatformText(post.content, 700),
        source_title: post.source_title,
        media_url: Array.isArray(post.media_urls) ? post.media_urls.find((value: unknown) => typeof value === "string") ?? null : null,
        thumbnail_url: post.thumbnail_url,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
        views_count: post.views_count,
        created_at: post.created_at,
        location: post.location_name || post.location_address || post.location || null,
        latitude,
        longitude,
        author: author
          ? {
              id: author.id,
              username: author.username,
              display_name: author.display_name,
              avatar_url: author.avatar_url,
              is_verified: author.is_verified,
              profile_path: author.username ? `/user/${encodeURIComponent(String(author.username))}` : null,
            }
          : null,
        post_path: `/post/${encodeURIComponent(String(post.id))}`,
        map_path: alsamosMapPath(latitude, longitude, post.location_name || post.location_address || "Post joyi"),
      };
    });
  }

  if (includes("places")) {
    const [placesSearch, poiSearch] = await Promise.all([
      ctx.admin
        .from("places")
        .select("id, name, address, category, latitude, longitude, external_source, usage_count")
        .or(
          `name.ilike.%${queryText}%,address.ilike.%${queryText}%,category.ilike.%${queryText}%`,
        )
        .limit(limit),
      ctx.admin
        .from("map_pois")
        .select("id, name, address, category, latitude, longitude, phone, website, opening_hours")
        .or(
          `name.ilike.%${queryText}%,address.ilike.%${queryText}%,category.ilike.%${queryText}%`,
        )
        .limit(limit),
    ]);
    if (placesSearch.error) return fail(placesSearch.error.message);
    if (poiSearch.error) return fail(poiSearch.error.message);

    result.places = [
      ...(placesSearch.data ?? []).map((place) => ({
        ...place,
        source: "places",
        latitude: finiteNumber(place.latitude),
        longitude: finiteNumber(place.longitude),
        map_path: alsamosMapPath(place.latitude, place.longitude, place.name || place.address),
      })),
      ...(poiSearch.data ?? []).map((place) => ({
        ...place,
        source: "map_pois",
        latitude: finiteNumber(place.latitude),
        longitude: finiteNumber(place.longitude),
        map_path: alsamosMapPath(place.latitude, place.longitude, place.name || place.address),
      })),
    ].slice(0, limit);
  }

  if (includes("people")) {
    const profiles = await ctx.admin
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, location, website, is_verified")
      .or(
        `username.ilike.%${queryText}%,display_name.ilike.%${queryText}%,bio.ilike.%${queryText}%,location.ilike.%${queryText}%`,
      )
      .limit(limit);
    if (profiles.error) return fail(profiles.error.message);

    result.people = (profiles.data ?? []).map((profile) => ({
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      bio: compactPlatformText(profile.bio),
      location: profile.location,
      website: profile.website,
      is_verified: profile.is_verified,
      profile_path: profile.username ? `/user/${encodeURIComponent(String(profile.username))}` : null,
    }));
  }

  const total =
    result.stores.length +
    result.products.length +
    result.posts.length +
    result.places.length +
    result.people.length;

  return {
    ok: true,
    text: total
      ? JSON.stringify(result)
      : `Alsamos ichida “${queryText}” bo‘yicha natija topilmadi.`,
    data: { alsamosSearch: result },
  };
}

type SearchActivityRow = {
  query: string | null;
  normalized_query?: string | null;
  searched_at?: string | null;
  created_at?: string | null;
};

async function mySearchInsights(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const days = Math.round(clamp(args.days, 1, 730, 30));
  const limit = Math.round(clamp(args.limit, 1, 30, 10));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const contains = String(args.query_contains ?? "").trim().slice(0, 120);

  // V2 is an append-only search-event ledger. Unlike `search_history`, which
  // is a de-duplicated recent-list UX, it preserves every committed query, so
  // "eng ko‘p nima qidirdim?" is based on actual frequency.
  let activityQuery = ctx.admin
    .from("search_activity_events")
    .select("query, normalized_query, searched_at")
    .eq("user_id", ctx.userId!)
    .gte("searched_at", since)
    .order("searched_at", { ascending: false })
    .limit(5000);
  if (contains) activityQuery = activityQuery.ilike("query", `%${contains}%`);

  const activity = await activityQuery;
  let rows: SearchActivityRow[] = [];
  let source = "search_activity_events";

  if (!activity.error) {
    rows = (activity.data ?? []) as SearchActivityRow[];
  } else if (isMissingRelation(activity.error)) {
    // Backward-compatible while production migrations roll out. Legacy history
    // can answer recency, but because it de-duplicates queries it must NOT be
    // presented as exact historical frequency.
    let legacyQuery = ctx.admin
      .from("search_history")
      .select("query, created_at")
      .eq("user_id", ctx.userId!)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1500);
    if (contains) legacyQuery = legacyQuery.ilike("query", `%${contains}%`);
    const legacy = await legacyQuery;
    if (legacy.error) return fail(legacy.error.message);
    rows = (legacy.data ?? []) as SearchActivityRow[];
    source = "search_history_legacy_recent_only";
  } else {
    return fail(activity.error.message);
  }

  const validRows = rows.filter((row) => typeof row.query === "string" && row.query.trim());
  const buckets = new Map<string, { query: string; count: number; last_searched_at: string }>();
  for (const row of validRows) {
    const label = String(row.query).trim().replace(/\s+/g, " ");
    const key = String(row.normalized_query || label.toLocaleLowerCase());
    const searchedAt = String(row.searched_at || row.created_at || "");
    const current = buckets.get(key);
    if (current) {
      current.count += 1;
      if (searchedAt > current.last_searched_at) current.last_searched_at = searchedAt;
    } else {
      buckets.set(key, { query: label, count: 1, last_searched_at: searchedAt });
    }
  }

  const top = [...buckets.values()]
    .sort((a, b) => b.count - a.count || b.last_searched_at.localeCompare(a.last_searched_at))
    .slice(0, limit);
  const recent = validRows.slice(0, limit).map((row) => ({
    query: String(row.query),
    searched_at: row.searched_at || row.created_at,
  }));

  const result = {
    days,
    total_searches: validRows.length,
    unique_queries: buckets.size,
    top,
    recent,
    source,
    exact_frequency: source === "search_activity_events",
  };
  return {
    ok: true,
    text: validRows.length
      ? JSON.stringify(result)
      : `Oxirgi ${days} kunda search tarixi topilmadi.`,
    data: { searchInsights: result },
  };
}

async function resolveCounterparties(
  person: string,
  ctx: ToolContext,
): Promise<Array<{ id: string; username: string | null; display_name: string | null }>> {
  const needle = person.trim().replace(/^@/, "").slice(0, 100);
  if (!needle) return [];

  const safe = needle.replace(/[%,()]/g, " ").trim();
  if (!safe) return [];
  const { data, error } = await ctx.admin
    .from("profiles")
    .select("id, username, display_name")
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; username: string | null; display_name: string | null }>;
}

async function myPaymentHistory(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const limit = Math.round(clamp(args.limit, 1, 100, 40));
  const from = parseDate(args.from) ?? new Date(Date.now() - Math.round(clamp(args.days, 1, 730, 30)) * 86_400_000).toISOString();
  const to = parseDate(args.to);
  const direction = ["debit", "credit"].includes(String(args.direction)) ? String(args.direction) : null;
  const person = String(args.person ?? "").trim();

  let counterparties: Array<{ id: string; username: string | null; display_name: string | null }> = [];
  try {
    if (person) counterparties = await resolveCounterparties(person, ctx);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  if (person && counterparties.length === 0) {
    return { ok: true, text: `“${person}” bo‘yicha foydalanuvchi/topshiriq topilmadi.`, data: { payments: [] } };
  }

  let ledgerQuery = ctx.admin
    .from("wallet_ledger")
    .select(
      "id, direction, amount, currency, kind, status, description, counterparty_user_id, transfer_id, context_type, context_id, balance_after, created_at",
    )
    .eq("user_id", ctx.userId!)
    .gte("created_at", from)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (to) ledgerQuery = ledgerQuery.lt("created_at", to);
  if (direction) ledgerQuery = ledgerQuery.eq("direction", direction);
  if (counterparties.length) ledgerQuery = ledgerQuery.in("counterparty_user_id", counterparties.map((item) => item.id));

  const { data, error } = await ledgerQuery;
  if (error) {
    // Legacy production fallback. wallet_transactions is less expressive but
    // still lets the user inspect their own historical ledger while migrations
    // roll out.
    let legacyQuery = ctx.admin
      .from("wallet_transactions")
      .select("id, type, amount, currency, description, reference_id, reference_type, balance_after, created_at, metadata")
      .eq("user_id", ctx.userId!)
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (to) legacyQuery = legacyQuery.lt("created_at", to);
    const legacy = await legacyQuery;
    if (legacy.error) return fail(error.message);
    if (person) {
      return fail("Bu production schema’da person-level counterparty ledger hali mavjud emas.");
    }
    return {
      ok: true,
      text: JSON.stringify(legacy.data ?? []),
      data: { payments: legacy.data ?? [], source: "wallet_transactions" },
    };
  }

  const rows = data ?? [];
  const counterpartyIds = [...new Set(rows.map((row) => row.counterparty_user_id).filter(Boolean))] as string[];
  const profileMap = new Map<string, { username: string | null; display_name: string | null }>();
  if (counterpartyIds.length) {
    const profiles = await ctx.admin
      .from("profiles")
      .select("id, username, display_name")
      .in("id", counterpartyIds);
    for (const profile of profiles.data ?? []) {
      profileMap.set(String(profile.id), {
        username: profile.username ?? null,
        display_name: profile.display_name ?? null,
      });
    }
  }

  const payments = rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    amount: Number(row.amount ?? 0),
    currency: row.currency,
    kind: row.kind,
    status: row.status,
    description: row.description,
    counterparty_user_id: row.counterparty_user_id,
    counterparty: row.counterparty_user_id ? profileMap.get(String(row.counterparty_user_id)) ?? null : null,
    transfer_id: row.transfer_id,
    context_type: row.context_type,
    context_id: row.context_id,
    created_at: row.created_at,
  }));

  const totals = payments.reduce(
    (acc, row) => {
      if (row.status !== "completed") return acc;
      const key = `${row.direction}:${row.currency}`;
      acc[key] = (acc[key] ?? 0) + row.amount;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    ok: true,
    text: payments.length
      ? JSON.stringify({ from, to, totals, payments })
      : "Bu davr/filter bo‘yicha wallet tranzaksiyasi topilmadi.",
    data: { payments, totals, from, to },
  };
}

async function myMarketplaceOrders(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const limit = Math.round(clamp(args.limit, 1, 50, 20));
  const from = parseDate(args.from) ?? new Date(Date.now() - Math.round(clamp(args.days, 1, 730, 90)) * 86_400_000).toISOString();
  const to = parseDate(args.to);
  const status = String(args.status ?? "").trim().slice(0, 60);

  let query = ctx.admin
    .from("orders")
    .select(
      "id, order_number, seller_id, status, payment_status, payment_method, subtotal, shipping_cost, total, currency, tracking_number, carrier, paid_at, shipped_at, delivered_at, cancelled_at, created_at",
    )
    .eq("buyer_id", ctx.userId!)
    .gte("created_at", from)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (to) query = query.lt("created_at", to);
  if (status) query = query.eq("status", status);

  const ordersResult = await query;
  if (ordersResult.error) return fail(ordersResult.error.message);
  const orders = ordersResult.data ?? [];
  if (!orders.length) {
    return {
      ok: true,
      text: "Bu davr/filter bo‘yicha Marketplace buyurtmasi topilmadi.",
      data: { marketplaceOrders: [], from, to },
    };
  }

  const orderIds = orders.map((row) => String(row.id));
  const sellerIds = [...new Set(orders.map((row) => row.seller_id).filter(Boolean))] as string[];

  const [itemsResult, sellersResult] = await Promise.all([
    ctx.admin
      .from("order_items")
      .select("id, order_id, product_id, title, quantity, price, total")
      .in("order_id", orderIds),
    sellerIds.length
      ? ctx.admin
          .from("sellers")
          .select("id, user_id, business_name, is_verified")
          .in("id", sellerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (itemsResult.error) return fail(itemsResult.error.message);
  if (sellersResult.error) return fail(sellersResult.error.message);

  const itemsByOrder = new Map<string, unknown[]>();
  for (const item of itemsResult.data ?? []) {
    const key = String(item.order_id);
    const list = itemsByOrder.get(key) ?? [];
    list.push({
      id: item.id,
      product_id: item.product_id,
      title: item.title,
      quantity: Number(item.quantity ?? 0),
      price: Number(item.price ?? 0),
      total: Number(item.total ?? 0),
    });
    itemsByOrder.set(key, list);
  }

  const sellers = new Map<string, unknown>();
  for (const seller of sellersResult.data ?? []) {
    sellers.set(String(seller.id), {
      id: seller.id,
      user_id: seller.user_id,
      business_name: seller.business_name,
      is_verified: seller.is_verified,
    });
  }

  const result = orders.map((order) => ({
    ...order,
    subtotal: Number(order.subtotal ?? 0),
    shipping_cost: Number(order.shipping_cost ?? 0),
    total: Number(order.total ?? 0),
    seller: sellers.get(String(order.seller_id)) ?? null,
    items: itemsByOrder.get(String(order.id)) ?? [],
  }));

  const completedSpend = result.reduce((sum, order) => {
    const paid = order.payment_status === "paid" || Boolean(order.paid_at);
    const cancelled = order.status === "cancelled" || Boolean(order.cancelled_at);
    return paid && !cancelled ? sum + Number(order.total ?? 0) : sum;
  }, 0);

  return {
    ok: true,
    text: JSON.stringify({ from, to, completed_spend: completedSpend, orders: result }),
    data: { marketplaceOrders: result, completedSpend, from, to },
  };
}

async function mySavedPlaces(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const limit = Math.round(clamp(args.limit, 1, 50, 20));
  const text = String(args.query ?? "").trim().replace(/[%,()]/g, " ").slice(0, 120);
  const category = String(args.category ?? "").trim().slice(0, 80);
  const favoritesOnly = args.favorites_only === true;

  let query = ctx.admin
    .from("saved_places")
    .select(
      "id, name, address, category, collection, latitude, longitude, is_favorite, note, notes, visited_at, created_at, updated_at",
    )
    .eq("user_id", ctx.userId!)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (text) query = query.or(`name.ilike.%${text}%,address.ilike.%${text}%`);
  if (category) query = query.ilike("category", category);
  if (favoritesOnly) query = query.eq("is_favorite", true);

  const result = await query;
  if (result.error) return fail(result.error.message);

  const places = (result.data ?? []).map((place) => ({
    ...place,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    map_path:
      Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude))
        ? `/map?destLat=${encodeURIComponent(String(place.latitude))}&destLng=${encodeURIComponent(String(place.longitude))}&destName=${encodeURIComponent(String(place.name || place.address || "Joy"))}`
        : null,
  }));

  return {
    ok: true,
    text: places.length ? JSON.stringify(places) : "Mos saqlangan joy topilmadi.",
    data: { savedPlaces: places },
  };
}

async function getRecommendationPreferences(
  _args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const { data, error } = await ctx.admin
    .from("user_recommendation_interests")
    .select("topic, weight, source, updated_at")
    .eq("user_id", ctx.userId!)
    .order("weight", { ascending: false })
    .limit(100);
  if (error) return fail(error.message);

  return {
    ok: true,
    text: data?.length ? JSON.stringify(data) : "Explicit recommendation preference hali yo‘q; behavioral ranking ishlayapti.",
    data: { recommendationPreferences: data ?? [] },
  };
}

async function updateRecommendationPreferences(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const rawChanges = Array.isArray(args.changes) ? args.changes.slice(0, 20) : [];
  if (!rawChanges.length) return fail("changes talab qilinadi.");

  const changes = rawChanges
    .map((raw) => {
      const row = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};
      const topic = cleanTopic(row.topic);
      const operation = ["increase", "decrease", "set", "remove"].includes(String(row.operation))
        ? String(row.operation)
        : "";
      const weight = clamp(row.weight, 0.25, 3, 1);
      return { topic, operation, weight };
    })
    .filter((row) => row.topic && row.operation);
  if (!changes.length) return fail("Yaroqli recommendation o‘zgarishi topilmadi.");

  const topics = [...new Set(changes.map((row) => row.topic))];
  const { data: existing, error: existingError } = await ctx.admin
    .from("user_recommendation_interests")
    .select("topic, weight")
    .eq("user_id", ctx.userId!)
    .in("topic", topics);
  if (existingError) return fail(existingError.message);

  const current = new Map<string, number>(
    (existing ?? []).map((row) => [String(row.topic), Number(row.weight ?? 0)]),
  );
  const removed: string[] = [];
  const writes: Array<{ user_id: string; topic: string; weight: number; source: string; updated_at: string }> = [];

  for (const change of changes) {
    if (change.operation === "remove") {
      removed.push(change.topic);
      current.delete(change.topic);
      continue;
    }

    const before = current.get(change.topic) ?? 0;
    let next = before;
    if (change.operation === "increase") next = before + change.weight;
    if (change.operation === "decrease") next = before - change.weight;
    if (change.operation === "set") {
      const source = rawChanges.find((candidate) =>
        candidate && typeof candidate === "object" && cleanTopic((candidate as Record<string, unknown>).topic) === change.topic
      ) as Record<string, unknown> | undefined;
      next = clamp(source?.weight, -3, 3, 0);
    }
    next = Math.round(Math.min(3, Math.max(-3, next)) * 100) / 100;
    current.set(change.topic, next);
    writes.push({
      user_id: ctx.userId!,
      topic: change.topic,
      weight: next,
      source: "ai",
      updated_at: new Date().toISOString(),
    });
  }

  if (removed.length) {
    const deletion = await ctx.admin
      .from("user_recommendation_interests")
      .delete()
      .eq("user_id", ctx.userId!)
      .in("topic", removed);
    if (deletion.error) return fail(deletion.error.message);
  }

  if (writes.length) {
    const write = await ctx.admin
      .from("user_recommendation_interests")
      .upsert(writes, { onConflict: "user_id,topic" });
    if (write.error) return fail(write.error.message);
  }

  const { data: finalRows, error: finalError } = await ctx.admin
    .from("user_recommendation_interests")
    .select("topic, weight, source, updated_at")
    .eq("user_id", ctx.userId!)
    .order("weight", { ascending: false })
    .limit(100);
  if (finalError) return fail(finalError.message);

  return {
    ok: true,
    text:
      "Recommendation preference yangilandi. Bu qiymatlar behavioral signallar bilan birga real Home/Video rankingda ishlatiladi. " +
      JSON.stringify(finalRows ?? []),
    data: { recommendationPreferences: finalRows ?? [], removed },
  };
}

const EXECUTORS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutcome>
> = {
  search_alsamos_platform: searchAlsamosPlatform,
  my_search_insights: mySearchInsights,
  my_payment_history: myPaymentHistory,
  my_marketplace_orders: myMarketplaceOrders,
  my_saved_places: mySavedPlaces,
  get_recommendation_preferences: getRecommendationPreferences,
  update_recommendation_preferences: updateRecommendationPreferences,
};

export function platformSpecsFor(enabled: Set<string>): ToolSpec[] {
  return PLATFORM_TOOL_NAMES
    .filter((name) => enabled.has(name))
    .map((name) => PLATFORM_TOOL_SPECS[name]);
}

export async function executePlatformTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome | null> {
  const executor = EXECUTORS[name];
  if (!executor) return null;
  if (!ctx.enabled.has(name)) return fail(`“${name}” vositasi bu suhbatda o‘chirilgan.`);
  try {
    return await executor(args, ctx);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
