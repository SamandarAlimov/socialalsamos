import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, PackageSearch } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ProductDetail } from '@/components/marketplace/ProductDetail';
import { CartSheet } from '@/components/marketplace/CartSheet';
import { CheckoutSheet } from '@/components/marketplace/CheckoutSheet';
import { fetchMarketplaceProductById, Product, useCart } from '@/hooks/useMarketplace';
import { marketplaceUz } from '@/i18n/marketplace';
import { parseMarketplaceSelectionFromUrl } from '@/lib/marketplaceChat';

export default function MarketplaceProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh: refreshCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const sharedSelection = useMemo(() => {
    const path = typeof window !== 'undefined'
      ? window.location.href
      : `/marketplace/product/${productId || ''}?${searchParams.toString()}`;
    return parseMarketplaceSelectionFromUrl(path);
  }, [productId, searchParams]);

  useEffect(() => {
    if (!product) return;

    const previousTitle = document.title;
    document.title = `${product.title} | Alsamos Bozor`;

    const description =
      product.description?.trim().slice(0, 180) ||
      `${product.title} — Alsamos Bozor`;
    const image = product.images?.[0]?.url || '';
    const canonicalUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/marketplace/product/${product.id}`
        : '';

    const touched: Array<{ element: HTMLMetaElement; previous: string | null }> = [];
    const setMeta = (selector: string, attr: 'name' | 'property', key: string, value: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, key);
        element.dataset.marketplaceProduct = 'true';
        document.head.appendChild(element);
      }
      touched.push({ element, previous: element.getAttribute('content') });
      element.setAttribute('content', value);
    };

    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'product');
    setMeta('meta[property="og:title"]', 'property', 'og:title', product.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'Alsamos');
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', product.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    if (image) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', image);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
    }

    let canonical = document.head.querySelector<HTMLLinkElement>('link[data-marketplace-product-canonical]');
    const previousCanonical = canonical?.getAttribute('href') ?? null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      canonical.dataset.marketplaceProductCanonical = 'true';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.dataset.marketplaceProductJsonld = 'true';
    jsonLd.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description,
      image: product.images?.map(item => item.url) ?? [],
      sku: product.id,
      brand: product.seller?.business_name
        ? { '@type': 'Brand', name: product.seller.business_name }
        : undefined,
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        priceCurrency: product.currency || 'USD',
        price: product.price,
        availability:
          product.status === 'active' && Number(product.quantity) > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        seller: product.seller?.business_name
          ? { '@type': 'Organization', name: product.seller.business_name }
          : undefined,
      },
    });
    document.head.appendChild(jsonLd);

    return () => {
      document.title = previousTitle;
      touched.forEach(({ element, previous }) => {
        if (element.dataset.marketplaceProduct === 'true' && previous == null) {
          element.remove();
        } else if (previous == null) {
          element.removeAttribute('content');
        } else {
          element.setAttribute('content', previous);
        }
      });
      if (canonical) {
        if (previousCanonical == null) canonical.remove();
        else canonical.setAttribute('href', previousCanonical);
      }
      jsonLd.remove();
    };
  }, [product]);

  useEffect(() => {
    if (!productId) {
      setLoadError(true);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);

    void fetchMarketplaceProductById(productId)
      .then(result => {
        if (cancelled) return;
        setProduct(result);
        setLoadError(!result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/marketplace', { replace: true });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <span className="text-sm">Mahsulot yuklanmoqda...</span>
        </div>
      </div>
    );
  }

  if (loadError || !product) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <PackageSearch className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{marketplaceUz.page.notFound}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mahsulot o‘chirilgan, sotuvdan olingan yoki havola noto‘g‘ri bo‘lishi mumkin.
          </p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={goBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {marketplaceUz.productDetail.back}
        </Button>
      </div>
    );
  }

  return (
    <div className="marketplace-neutral">
      <ProductDetail
        product={product}
        initialVariantId={sharedSelection.variantId}
        initialQuantity={sharedSelection.quantity}
        onClose={goBack}
        onSellerClick={(sellerId) => navigate(`/marketplace?seller=${sellerId}`)}
        onMessageSeller={(sellerUserId, context) => {
          if (!sellerUserId) {
            navigate('/messages');
            return;
          }

          const params = new URLSearchParams({
            user: sellerUserId,
            product: product.id,
            intent: context.intent,
            qty: String(context.quantity),
          });
          if (context.variantId) params.set('variant', context.variantId);
          if (context.variantSku) params.set('sku', context.variantSku);
          if (Object.keys(context.options).length > 0) {
            params.set('opts', JSON.stringify(context.options));
          }

          navigate(`/marketplace/chat?${params.toString()}`);
        }}
        onBuyNow={async () => {
          await refreshCart();
          setShowCheckout(true);
        }}
        onCartChange={refreshCart}
        onOpenCart={() => setShowCart(true)}
        onBrowseMarketplace={() => navigate('/marketplace')}
        onBrowseCategory={(slug) => navigate(`/marketplace?category=${slug}`)}
        onProductSelect={(nextProduct) => {
          navigate(`/marketplace/product/${nextProduct.id}`);
        }}
      />

      <CartSheet open={showCart} onOpenChange={setShowCart} />
      <CheckoutSheet
        open={showCheckout}
        onOpenChange={setShowCheckout}
        onSuccess={() => {
          setShowCheckout(false);
          void refreshCart();
        }}
      />
    </div>
  );
}
