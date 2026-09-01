import { db } from '@/lib/db';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getShippingCost } from '@/lib/marketplace';
import {
  isNetworkError,
  networkErrorMessage,
  onNetworkRestored,
  withNetworkRetry,
} from '@/lib/supabaseRetry';

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  position: number;
}

export interface Seller {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  description: string | null;
  logo_url: string | null;
  location: string | null;
  is_verified: boolean;
  rating: number;
  total_sales: number;
  status: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_online?: boolean | null;
    last_seen?: string | null;
    followers_count?: number | null;
  };
}

export interface Product {
  id: string;
  seller_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  quantity: number;
  condition: string;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  shipping_available: boolean;
  shipping_price: number;
  is_negotiable: boolean;
  is_featured: boolean;
  status: string;
  views_count: number;
  likes_count: number;
  created_at: string;
  images: { id: string; url: string; position: number }[];
  seller?: Seller;
  category?: Category;
  is_liked?: boolean;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string | null;
  options: Record<string, string>;
  price: number | null;
  compare_at_price: number | null;
  quantity: number;
  image_url: string | null;
  is_active: boolean;
  position: number;
}

export interface CartItem {
  id: string;
  product_id: string;
  product_variant_id: string | null;
  quantity: number;
  product?: Product;
  variant?: ProductVariant | null;
}

// =====================================================================
// Error handling
// ---------------------------------------------------------------------
// Supabase rejects with a plain object ({ message, details, hint, code }),
// not an Error. Code that tested `err instanceof Error` therefore discarded
// every real database message and showed a generic fallback instead, which is
// how an empty catalogue could look identical to a broken query.
//
// Transport failures arrive in that same shape ({ message: 'TypeError: Failed
// to fetch', details: <stack> }), so they are classified separately: the user
// gets a human sentence, never a minified stack trace.
// =====================================================================

function describeSupabaseError(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (isNetworkError(error)) return networkErrorMessage();
  if (error instanceof Error) return error.message || fallback;

  if (typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint].filter(Boolean) as string[];
    if (parts.length > 0) {
      return e.code ? `${parts.join(' — ')} (${e.code})` : parts.join(' — ');
    }
  }

  return typeof error === 'string' && error ? error : fallback;
}

/**
 * True for "I cannot join these two tables" errors, i.e. a missing foreign key
 * rather than a missing row. PGRST200/PGRST201 fail the *entire* request, so a
 * single unresolvable embed returns zero products.
 */
function isRelationshipError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  const code = String(e.code ?? '');
  if (code === 'PGRST200' || code === 'PGRST201') return true;

  const text = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`.toLowerCase();
  return text.includes('relationship') || text.includes('could not embed');
}

// =====================================================================
// Product select
// ---------------------------------------------------------------------
// `profile:profiles(...)` nested inside `sellers` needs a foreign key between
// sellers and profiles. Where sellers.user_id references auth.users instead,
// the embed is unresolvable and the catalogue query dies. The nested profile is
// cosmetic (avatar, online dot), so it must never be able to hide the products.
// =====================================================================

const SELLER_EMBED_WITH_PROFILE = `seller:sellers(
      id, user_id, business_name, business_type, description, logo_url, location,
      is_verified, rating, total_sales,
      profile:profiles(username, display_name, avatar_url, is_online, last_seen, followers_count)
    )`;

const SELLER_EMBED_PLAIN = `seller:sellers(
      id, user_id, business_name, business_type, description, logo_url, location,
      is_verified, rating, total_sales
    )`;

// Sticky for the session: once the join is known to be missing, stop paying for
// a failing round trip on every query.
let sellerProfileEmbedUnavailable = false;

function productSelect(): string {
  const sellerEmbed = sellerProfileEmbedUnavailable
    ? SELLER_EMBED_PLAIN
    : SELLER_EMBED_WITH_PROFILE;

  return `
    *,
    ${sellerEmbed},
    category:product_categories(id, name, slug, icon),
    images:product_images(id, url, position)
  `;
}

type QueryResult = { data: any[] | null; error: any };

/**
 * Runs a product query and, if the seller->profile join turns out not to
 * exist, retries once without it. Any other error is returned untouched so the
 * caller can surface it.
 *
 * Each attempt is additionally wrapped in withNetworkRetry, so a dropped
 * request is retried at the transport level before it is ever reported as a
 * failed query.
 */
async function runProductQuery(
  build: (select: string) => PromiseLike<QueryResult>,
  label = 'products',
): Promise<QueryResult> {
  const first = await withNetworkRetry<any[]>(() => build(productSelect()), { label });

  if (first.error && isRelationshipError(first.error) && !sellerProfileEmbedUnavailable) {
    console.warn(
      'Marketplace: seller profile embed unavailable, retrying without it.',
      first.error,
    );
    sellerProfileEmbedUnavailable = true;
    return withNetworkRetry<any[]>(() => build(productSelect()), { label });
  }

  return first;
}

export function getCartItemUnitPrice(item: CartItem): number {
  return Number(item.variant?.price ?? item.product?.price ?? 0);
}

export function getCartItemStock(item: CartItem): number {
  return Math.max(
    0,
    Number(item.product_variant_id ? item.variant?.quantity ?? 0 : item.product?.quantity ?? 0),
  );
}

export function getVariantOptionsLabel(variant?: ProductVariant | null): string {
  if (!variant?.options) return '';
  return Object.entries(variant.options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');
}

export function useProductVariants(productId?: string | null) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!productId) {
      setVariants([]);
      return;
    }

    setIsLoading(true);
    const { data, error } = await withNetworkRetry<any[]>(
      () =>
        db
          .from('product_variants')
          .select('*')
          .eq('product_id', productId)
          .eq('is_active', true)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true }),
      { label: 'product variants' },
    );

    if (error) {
      console.warn('Product variants unavailable:', error);
      setVariants([]);
    } else {
      setVariants((data ?? []).map((row: any) => ({
        ...row,
        price: row.price == null ? null : Number(row.price),
        compare_at_price: row.compare_at_price == null ? null : Number(row.compare_at_price),
        quantity: Number(row.quantity ?? 0),
        options: row.options ?? {},
      })) as ProductVariant[]);
    }
    setIsLoading(false);
  }, [productId]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { variants, isLoading, refresh };
}

const PRODUCT_PAGE_SIZE = 50;

// Ilgari paginatsiya `while (true)` bilan katalogning HAMMASINI o'qib olardi:
// mahsulotlar soni o'sishi bilan Marketplace birinchi renderni kutib qotib
// qolardi (va sekin tarmoqda "yuklanmadi" ga aylanardi). Endi qattiq chegara
// bor; qolgani `hasMore` orqali bildiriladi.
const MAX_PRODUCT_PAGES = 6;

/**
 * PostgREST'da so'rovda `or=` parametri faqat bitta bo'ladi. Ikki marta
 * `.or(...)` chaqirilsa shartlardan biri (qidiruv yoki keyset kursor) jimgina
 * tushib qolib, natijalar noto'g'ri yoki takroriy bo'lardi. Shartlarni bitta
 * `and(or(...),or(...))` ifodasiga birlashtiramiz.
 */
function combineOrExpressions(expressions: string[]): string | null {
  const parts = expressions.filter((expression) => expression.trim().length > 0);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `and(${parts.map((expression) => `or(${expression})`).join(',')})`;
}

const categoryIdBySlug = new Map<string, string>();

async function resolveCategoryId(slug?: string): Promise<string | null> {
  if (!slug || slug === 'all') return null;

  const cached = categoryIdBySlug.get(slug);
  if (cached) return cached;

  const { data, error } = await withNetworkRetry<any>(
    () =>
      supabase
        .from('product_categories')
        .select('id')
        .eq('slug', slug)
        .maybeSingle(),
    { label: 'category lookup' },
  );

  if (error || !data?.id) return null;
  categoryIdBySlug.set(slug, data.id);
  return data.id;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);

    const { data, error: fetchError } = await withNetworkRetry<any[]>(
      () =>
        supabase
          .from('product_categories')
          .select('*')
          .order('position'),
      { label: 'categories' },
    );

    if (fetchError) {
      console.error('Marketplace categories failed:', fetchError);
      setError(describeSupabaseError(fetchError, 'Kategoriyalar yuklanmadi'));
    } else if (data) {
      setError(null);
      data.forEach((category: any) => categoryIdBySlug.set(category.slug, category.id));
      setCategories(data as Category[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  // Kategoriya qatori bo'sh qolib ketmasin: aloqa tiklanganda o'zi qayta yuklanadi.
  useEffect(() => {
    if (!error) return;
    return onNetworkRestored(() => { void fetchCategories(); });
  }, [error, fetchCategories]);

  return { categories, isLoading, error, refresh: fetchCategories };
}

export function useProducts(categorySlug?: string, searchQuery?: string) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const categoryId = await resolveCategoryId(categorySlug);
      if (categorySlug && categorySlug !== 'all' && !categoryId) {
        setProducts([]);
        setHasMore(false);
        setIsLoading(false);
        return;
      }

      const safeSearch = searchQuery
        ? searchQuery.replace(/[%_]/g, (match) => `\\${match}`)
        : '';

      const rows: any[] = [];
      let cursor: { created_at: string; id: string } | null = null;
      let reachedPageLimit = false;

      for (let pageIndex = 0; pageIndex < MAX_PRODUCT_PAGES; pageIndex += 1) {
        const currentCursor = cursor;

        const { data, error: fetchError } = await runProductQuery((select) => {
          let pageQuery = db
            .from('products')
            .select(select)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(PRODUCT_PAGE_SIZE);

          if (categoryId) {
            pageQuery = pageQuery.eq('category_id', categoryId);
          }

          // Qidiruv va keyset kursor bitta `or=` ifodasiga birlashtiriladi.
          const combinedFilter = combineOrExpressions([
            safeSearch
              ? `title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`
              : '',
            currentCursor
              ? `created_at.lt.${currentCursor.created_at},and(created_at.eq.${currentCursor.created_at},id.lt.${currentCursor.id})`
              : '',
          ]);

          if (combinedFilter) {
            pageQuery = pageQuery.or(combinedFilter);
          }

          return pageQuery;
        });

        if (fetchError) throw fetchError;

        const page = data ?? [];
        rows.push(...page);

        if (page.length < PRODUCT_PAGE_SIZE) break;

        const last = page[page.length - 1];
        if (!last?.created_at || !last?.id) break;

        cursor = { created_at: last.created_at, id: last.id };

        if (pageIndex === MAX_PRODUCT_PAGES - 1) {
          reachedPageLimit = true;
        }
      }

      let likedProductIds: string[] = [];
      if (user && rows.length > 0) {
        const { data: likes } = await withNetworkRetry<any[]>(
          () =>
            supabase
              .from('product_likes')
              .select('product_id')
              .eq('user_id', user.id),
          { label: 'liked products' },
        );

        likedProductIds = (likes ?? []).map((like: any) => like.product_id);
      }

      setProducts(rows.map(row => mapMarketplaceProduct(row, likedProductIds)));
      setHasMore(reachedPageLimit);

      if (reachedPageLimit) {
        console.info(
          `Marketplace: ${MAX_PRODUCT_PAGES * PRODUCT_PAGE_SIZE} mahsulot yuklandi, qolganlari filtr/qidiruv bilan ochiladi.`,
        );
      }
    } catch (err) {
      // Log the raw object: the message alone hides the PostgREST code that
      // says whether this is a missing table, a broken embed or RLS.
      console.error('Marketplace products failed:', err);
      setProducts([]);
      setHasMore(false);
      setError(describeSupabaseError(err, 'Mahsulotlar yuklanmadi'));
    } finally {
      setIsLoading(false);
    }
  }, [categorySlug, searchQuery, user]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  // Uzilishdan keyin foydalanuvchi "Qayta urinish" ni bosishini kutmaymiz:
  // aloqa tiklanishi yoki tabga qaytish katalogni o'zi qayta yuklaydi.
  useEffect(() => {
    if (!error) return;
    return onNetworkRestored(() => { void fetchProducts(); });
  }, [error, fetchProducts]);

  return { products, isLoading, error, hasMore, refresh: fetchProducts };
}

interface MarketplaceCenter {
  latitude: number;
  longitude: number;
}

function mapMarketplaceProduct(row: any, likedProductIds: string[] = []): Product {
  return {
    ...row,
    seller: row.seller as Seller | undefined,
    category: row.category as Category | undefined,
    images: ((row.images ?? []) as { id: string; url: string; position: number }[])
      .slice()
      .sort((a, b) => a.position - b.position),
    is_liked: likedProductIds.includes(row.id),
  } as Product;
}

/**
 * Xarita -> Marketplace yaqin e'lonlar rejimi. Query server tomonda koordinata
 * bounding-box bilan cheklanadi, shuning uchun faqat oxirgi 50 ta mahsulotni
 * clientda filtrlash xatosi yo'q.
 */
export function useNearbyMarketplaceProducts(center?: MarketplaceCenter | null, radiusKm = 5) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!center) {
      setProducts([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const dLat = radiusKm / 111;
      const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180)));

      const { data, error: fetchError } = await runProductQuery(
        (select) =>
          db
            .from('products')
            .select(select)
            .eq('status', 'active')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .gte('latitude', center.latitude - dLat)
            .lte('latitude', center.latitude + dLat)
            .gte('longitude', center.longitude - dLng)
            .lte('longitude', center.longitude + dLng)
            .order('created_at', { ascending: false })
            .limit(100),
        'nearby listings',
      );

      if (fetchError) throw fetchError;

      let likedProductIds: string[] = [];
      if (user && data?.length) {
        const ids = data.map((row: any) => row.id);
        const { data: likes } = await withNetworkRetry<any[]>(
          () =>
            db
              .from('product_likes')
              .select('product_id')
              .eq('user_id', user.id)
              .in('product_id', ids),
          { label: 'liked products' },
        );
        likedProductIds = (likes ?? []).map((row: any) => row.product_id);
      }

      const toRad = (value: number) => (value * Math.PI) / 180;
      const distanceM = (lat: number, lng: number) => {
        const dLatR = toRad(lat - center.latitude);
        const dLngR = toRad(lng - center.longitude);
        const a =
          Math.sin(dLatR / 2) ** 2 +
          Math.cos(toRad(center.latitude)) *
            Math.cos(toRad(lat)) *
            Math.sin(dLngR / 2) ** 2;
        return 2 * 6371000 * Math.asin(Math.sqrt(a));
      };

      const result = (data ?? [])
        .filter((row: any) => {
          const lat = Number(row.latitude);
          const lng = Number(row.longitude);
          return Number.isFinite(lat) && Number.isFinite(lng) && distanceM(lat, lng) <= radiusKm * 1000;
        })
        .sort((a: any, b: any) => distanceM(Number(a.latitude), Number(a.longitude)) - distanceM(Number(b.latitude), Number(b.longitude)))
        .map((row: any) => mapMarketplaceProduct(row, likedProductIds));

      setProducts(result);
    } catch (err) {
      console.error("Marketplace nearby listings failed:", err);
      setProducts([]);
      setError(describeSupabaseError(err, "Yaqin e'lonlar yuklanmadi"));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.latitude, center?.longitude, radiusKm, user?.id]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  return { products, isLoading, error, refresh: fetchProducts };
}

/** Marketplace deep-link kartasini ID bo'yicha to'liq yuklaydi. */
export async function fetchMarketplaceProductById(productId: string): Promise<Product | null> {
  if (!productId) return null;

  const { data, error } = await runProductQuery(
    (select) =>
      db
        .from('products')
        .select(select)
        .eq('id', productId)
        .limit(1),
    'product lookup',
  );

  if (error) {
    console.error('Marketplace product lookup failed:', error);
    return null;
  }

  const row = (data ?? [])[0];
  return row ? mapMarketplaceProduct(row) : null;
}

const RECENTLY_VIEWED_KEY = 'alsamos:marketplace:recently-viewed';
const RECENTLY_VIEWED_LIMIT = 10;

export interface SellerResponseStats {
  response_rate: number | null;
  average_response_minutes: number | null;
  conversations_count: number;
  is_online: boolean;
  last_seen: string | null;
}

export function useSellerResponseStats(sellerUserId?: string | null) {
  const [stats, setStats] = useState<SellerResponseStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!sellerUserId) {
      setStats(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void db
      .rpc('get_seller_response_stats', { _seller_user_id: sellerUserId })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) {
          // Hosted DB migration hali deploy qilinmagan muhitda page buzilmasin.
          console.warn('Seller response stats unavailable:', error);
          setStats(null);
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        setStats(row ? {
          response_rate: row.response_rate == null ? null : Number(row.response_rate),
          average_response_minutes:
            row.average_response_minutes == null ? null : Number(row.average_response_minutes),
          conversations_count: Number(row.conversations_count ?? 0),
          is_online: Boolean(row.is_online),
          last_seen: row.last_seen ?? null,
        } : null);
      })
      .then(undefined, () => undefined)
      .then(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sellerUserId]);

  return { stats, isLoading };
}

async function fetchMarketplaceProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];

  const { data, error } = await runProductQuery(
    (select) =>
      db
        .from('products')
        .select(select)
        .in('id', ids)
        .eq('status', 'active'),
    'recently viewed',
  );

  if (error || !data) {
    if (error) console.warn('Recently viewed products unavailable:', error);
    return [];
  }

  const byId = new Map((data as any[]).map(row => [row.id, mapMarketplaceProduct(row)]));
  return ids.map(id => byId.get(id)).filter(Boolean) as Product[];
}

export function useRecentlyViewedProducts(currentProductId?: string | null) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!currentProductId || typeof window === 'undefined') {
      setProducts([]);
      return;
    }

    let cancelled = false;

    const readIds = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]');
        return Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === 'string')
          : [];
      } catch {
        return [];
      }
    };

    const previous = readIds()
      .filter(id => id !== currentProductId)
      .slice(0, RECENTLY_VIEWED_LIMIT);

    if (previous.length > 0) {
      setIsLoading(true);
      void fetchMarketplaceProductsByIds(previous)
        .then(rows => {
          if (!cancelled) setProducts(rows);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    } else {
      setProducts([]);
    }

    try {
      const next = [currentProductId, ...previous].slice(0, RECENTLY_VIEWED_LIMIT);
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
    } catch {
      // Private browsing/storage quota: recently viewed is optional.
    }

    return () => {
      cancelled = true;
    };
  }, [currentProductId]);

  return { products, isLoading };
}

export function useSellerProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSellerProducts = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Get seller profile
    const { data: sellerData } = await withNetworkRetry<any>(
      () =>
        supabase
          .from('sellers')
          .select('id, user_id, business_name, business_type, description, logo_url, cover_url, location, website, is_verified, rating, total_reviews, total_sales, status, created_at, updated_at')
          .eq('user_id', user.id)
          .maybeSingle(),
      { label: 'seller profile' },
    );

    if (sellerData) {
      setSeller(sellerData as Seller);

      // Get seller's products
      const { data } = await withNetworkRetry<any[]>(
        () =>
          supabase
            .from('products')
            .select(`
          *,
          category:product_categories(id, name, slug, icon),
          images:product_images(id, url, position)
        `)
            .eq('seller_id', sellerData.id)
            .neq('status', 'deleted')
            .order('created_at', { ascending: false }),
        { label: 'seller products' },
      );

      if (data) {
        setProducts(data.map((p: any) => ({
          ...p,
          category: p.category as unknown as Category,
          images: ((p.images ?? []) as { id: string; url: string; position: number }[])
            .slice()
            .sort((a, b) => a.position - b.position),
        })));
      }
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSellerProducts();
  }, [fetchSellerProducts]);

  return { products, seller, isLoading, refresh: fetchSellerProducts };
}

export function useSavedProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSavedProducts = useCallback(async () => {
    if (!user) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    const { data } = await withNetworkRetry<any[]>(
      () =>
        supabase
          .from('product_likes')
          .select(`
        product:products(
          *,
          seller:sellers(id, business_name, logo_url, is_verified, rating, location),
          category:product_categories(id, name, slug, icon),
          images:product_images(id, url, position)
        )
      `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      { label: 'saved products' },
    );

    if (data) {
      const savedProducts = data
        .map((d: any) => d.product)
        .filter(Boolean)
        .map((p: any) => ({
          ...(p as unknown as Product),
          is_liked: true,
        }));
      setProducts(savedProducts);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSavedProducts();
  }, [fetchSavedProducts]);

  return { products, isLoading, refresh: fetchSavedProducts };
}

export function useCart() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCart = useCallback(async () => {
    if (!user) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    const variantQuery = await withNetworkRetry<any[]>(
      () =>
        db
          .from('cart_items')
          .select(`
        *,
        variant:product_variants(
          id, product_id, sku, options, price, compare_at_price, quantity,
          image_url, is_active, position
        ),
        product:products(
          *,
          seller:sellers(id, business_name, is_verified),
          category:product_categories(id, name, slug, icon),
          images:product_images(id, url, position)
        )
      `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      { label: 'cart' },
    );

    // Aloqa uzilganda savatni bo'shatib yubormaymiz: eski holat ekranda qoladi,
    // aks holda foydalanuvchi savati yo'qolgandek ko'rinadi.
    if (variantQuery.error && isNetworkError(variantQuery.error)) {
      console.warn('Cart unavailable (network):', variantQuery.error);
      setIsLoading(false);
      return;
    }

    if (!variantQuery.error) {
      setItems(((variantQuery.data ?? []) as any[]).map(item => ({
        ...item,
        product_variant_id: item.product_variant_id ?? null,
        product: item.product as Product,
        variant: item.variant ? {
          ...item.variant,
          price: item.variant.price == null ? null : Number(item.variant.price),
          compare_at_price:
            item.variant.compare_at_price == null ? null : Number(item.variant.compare_at_price),
          quantity: Number(item.variant.quantity ?? 0),
          options: item.variant.options ?? {},
        } as ProductVariant : null,
      })));
    } else {
      // Production may briefly lag the frontend migration. Keep legacy carts usable.
      console.warn('Cart variant query failed, falling back to legacy cart:', variantQuery.error);
      const legacyQuery = await withNetworkRetry<any[]>(
        () =>
          supabase
            .from('cart_items')
            .select(`
          *,
          product:products(
            *,
            seller:sellers(id, business_name, is_verified),
            images:product_images(id, url, position)
          )
        `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        { label: 'legacy cart' },
      );

      if (legacyQuery.data) {
        setItems(legacyQuery.data.map((item: any) => ({
          ...item,
          product_variant_id: null,
          variant: null,
          product: item.product as unknown as Product,
        })));
      } else if (!isNetworkError(legacyQuery.error)) {
        setItems([]);
      }
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  /**
   * Adds a product to the cart.
   *
   * The previous implementation upserted a *fixed* quantity, so adding the
   * same product twice silently overwrote the line instead of increasing it,
   * and nothing validated stock or product status. Now the quantity is merged
   * and clamped against live stock.
   */
  const addToCart = async (
    productId: string,
    quantity = 1,
    productVariantId?: string | null,
  ) => {
    if (!user) {
      toast({
        title: 'Tizimga kiring',
        description: "Savatga qo'shish uchun avval tizimga kirishingiz kerak",
        variant: 'destructive',
      });
      return false;
    }

    const requestedQty = Math.max(1, Math.floor(quantity));
    const { data: product, error: productError } = await withNetworkRetry<any>(
      () =>
        db
          .from('products')
          .select('id, title, quantity, status')
          .eq('id', productId)
          .maybeSingle(),
      { label: 'cart product check' },
    );

    if (productError || !product) {
      toast({
        title: 'Xatolik',
        description: isNetworkError(productError) ? networkErrorMessage() : 'Mahsulot topilmadi',
        variant: 'destructive',
      });
      return false;
    }

    let variant: ProductVariant | null = null;
    if (productVariantId) {
      const { data: row } = await withNetworkRetry<any>(
        () =>
          db
            .from('product_variants')
            .select('id, product_id, sku, options, price, compare_at_price, quantity, image_url, is_active, position')
            .eq('id', productVariantId)
            .eq('product_id', productId)
            .eq('is_active', true)
            .maybeSingle(),
        { label: 'cart variant check' },
      );
      if (!row) {
        toast({ title: 'Variant mavjud emas', variant: 'destructive' });
        return false;
      }
      variant = {
        ...row,
        price: row.price == null ? null : Number(row.price),
        compare_at_price: row.compare_at_price == null ? null : Number(row.compare_at_price),
        quantity: Number(row.quantity ?? 0),
        options: row.options ?? {},
      } as ProductVariant;
    }

    const stock = Math.max(0, Number(variant ? variant.quantity : product.quantity ?? 0));
    if (product.status !== 'active' || stock === 0) {
      toast({ title: 'Mavjud emas', description: 'Mahsulot yoki variant sotuvda emas', variant: 'destructive' });
      return false;
    }

    const variantId = variant?.id ?? null;
    const existing = items.find(item =>
      item.product_id === productId &&
      (item.product_variant_id ?? null) === variantId
    );
    const nextQuantity = Math.min((existing?.quantity ?? 0) + requestedQty, stock);

    if (existing && nextQuantity === existing.quantity) {
      toast({ title: 'Maksimal miqdor', description: `Omborda faqat ${stock} dona mavjud` });
      return false;
    }

    const { error } = existing
      ? await db.from('cart_items').update({ quantity: nextQuantity }).eq('id', existing.id)
      : await db.from('cart_items').insert({
          user_id: user.id,
          product_id: productId,
          quantity: nextQuantity,
          ...(variantId ? { product_variant_id: variantId } : {}),
        });

    if (error) {
      toast({
        title: 'Xatolik',
        description: isNetworkError(error) ? networkErrorMessage() : "Savatga qo'shilmadi",
        variant: 'destructive',
      });
      return false;
    }

    const variantLabel = getVariantOptionsLabel(variant);
    toast({
      title: "Savatga qo'shildi",
      description: `${product.title}${variantLabel ? ` · ${variantLabel}` : ''} — ${nextQuantity} dona`,
    });
    await fetchCart();
    return true;
  };

  const removeFromCart = async (itemId: string) => {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      toast({ title: 'Xatolik', description: "O'chirilmadi", variant: 'destructive' });
      return false;
    }

    setItems(prev => prev.filter(i => i.id !== itemId));
    toast({ title: "O'chirildi", description: 'Mahsulot savatdan olindi' });
    return true;
  };

  /** Quantity is clamped to the product's remaining stock. */
  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) {
      return removeFromCart(itemId);
    }

    const item = items.find(i => i.id === itemId);
    const stock = Math.max(1, item ? getCartItemStock(item) : 1);
    const nextQuantity = Math.min(Math.floor(quantity), stock);

    if (item && nextQuantity === item.quantity) return false;

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: nextQuantity })
      .eq('id', itemId);

    if (error) {
      toast({ title: 'Xatolik', description: "Miqdor o'zgartirilmadi", variant: 'destructive' });
      return false;
    }

    setItems(prev => prev.map(i => (i.id === itemId ? { ...i, quantity: nextQuantity } : i)));
    return true;
  };

  const clearCart = async () => {
    if (!user) return;

    await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', user.id);

    setItems([]);
  };

  const total = items.reduce(
    (sum, item) => sum + getCartItemUnitPrice(item) * item.quantity,
    0,
  );

  const shippingTotal = items.reduce(
    (sum, item) => sum + getShippingCost(item.product, item.quantity),
    0,
  );

  /** Total units, not lines — the header badge used to show the wrong number. */
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  /** Lines that can no longer be purchased (sold out or delisted). */
  const unavailableItems = items.filter(
    item =>
      !item.product ||
      item.product.status !== 'active' ||
      (item.product_variant_id != null && (!item.variant || !item.variant.is_active)) ||
      getCartItemStock(item) < item.quantity,
  );

  const currency = items[0]?.product?.currency || 'USD';

  return {
    items,
    isLoading,
    total,
    shippingTotal,
    grandTotal: total + shippingTotal,
    itemCount,
    unavailableItems,
    currency,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    refresh: fetchCart,
  };
}

export function useProductActions() {
  const { user } = useAuth();
  const { toast } = useToast();

  const toggleLike = async (productId: string, isLiked: boolean) => {
    if (!user) {
      toast({
        title: 'Tizimga kiring',
        description: 'Saqlash uchun tizimga kirishingiz kerak',
        variant: 'destructive',
      });
      return false;
    }

    const { error } = isLiked
      ? await supabase
          .from('product_likes')
          .delete()
          .eq('product_id', productId)
          .eq('user_id', user.id)
      : await supabase
          .from('product_likes')
          .insert({ product_id: productId, user_id: user.id });

    if (error) {
      toast({
        title: 'Xatolik',
        description: isNetworkError(error) ? networkErrorMessage() : error.message,
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  /** Registers a product view (used by the detail sheet). */
  const registerView = async (productId: string) => {
    await db.rpc('increment_product_views', { _product_id: productId });
  };

  const createSeller = async (businessName: string, businessType: string, description?: string) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('sellers')
      .insert({
        user_id: user.id,
        business_name: businessName,
        business_type: businessType,
        description,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
      return null;
    }

    toast({ title: 'Tayyor', description: "Sotuvchi hisobingiz ochildi!" });
    return data;
  };

  const createProduct = async (product: {
    title: string;
    description?: string;
    price: number;
    category_id?: string;
    condition?: string;
    location?: string;
    quantity?: number;
    is_negotiable?: boolean;
    shipping_available?: boolean;
    shipping_price?: number;
  }, imageUrls: string[]) => {
    if (!user) return null;

    // Get seller
    const { data: seller } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!seller) {
      toast({
        title: 'Xatolik',
        description: 'Avval sotuvchi hisobini yarating',
        variant: 'destructive',
      });
      return null;
    }

    const { data, error } = await supabase
      .from('products')
      .insert({
        seller_id: seller.id,
        ...product,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
      return null;
    }

    // Add images
    if (imageUrls.length > 0) {
      await supabase
        .from('product_images')
        .insert(imageUrls.map((url, i) => ({
          product_id: data.id,
          url,
          position: i,
        })));
    }

    toast({ title: 'Tayyor', description: "Mahsulot e'lon qilindi!" });
    return data;
  };

  const checkProductVariantsReady = async () => {
    const { error } = await db
      .from('product_variants')
      .select('id')
      .limit(1);

    if (error) {
      toast({
        title: 'Variantlar hali tayyor emas',
        description: 'Marketplace variant migrationini deploy qilib, qayta urinib ko‘ring.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const rollbackCreatedProduct = async (productId: string) => {
    await db
      .from('products')
      .update({ status: 'deleted' })
      .eq('id', productId);
  };

  const createProductVariants = async (
    productId: string,
    variants: Array<{
      sku?: string | null;
      options: Record<string, string>;
      price?: number | null;
      compare_at_price?: number | null;
      quantity: number;
      image_url?: string | null;
    }>,
  ) => {
    if (!user || variants.length === 0) return true;
    const { error } = await db.from('product_variants').insert(
      variants.map((variant, index) => ({
        product_id: productId,
        sku: variant.sku?.trim() || null,
        options: variant.options,
        price: variant.price == null ? null : Number(variant.price),
        compare_at_price: variant.compare_at_price == null ? null : Number(variant.compare_at_price),
        quantity: Math.max(0, Math.floor(Number(variant.quantity) || 0)),
        image_url: variant.image_url || null,
        position: index,
        is_active: true,
      })),
    );
    if (error) {
      toast({ title: 'Variantlar saqlanmadi', description: error.message, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId);

    if (error) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
      return false;
    }

    toast({ title: 'Yangilandi', description: "Mahsulot ma'lumotlari saqlandi" });
    return true;
  };

  const deleteProduct = async (productId: string) => {
    const { error } = await supabase
      .from('products')
      .update({ status: 'deleted' })
      .eq('id', productId);

    if (error) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
      return false;
    }

    toast({ title: "O'chirildi", description: 'Mahsulot olib tashlandi' });
    return true;
  };

  return {
    toggleLike,
    registerView,
    createSeller,
    createProduct,
    checkProductVariantsReady,
    rollbackCreatedProduct,
    createProductVariants,
    updateProduct,
    deleteProduct,
  };
}
