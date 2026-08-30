import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, PackageSearch } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ProductDetail } from '@/components/marketplace/ProductDetail';
import { CartSheet } from '@/components/marketplace/CartSheet';
import { CheckoutSheet } from '@/components/marketplace/CheckoutSheet';
import { fetchMarketplaceProductById, Product, useCart } from '@/hooks/useMarketplace';
import { marketplaceUz } from '@/i18n/marketplace';

export default function MarketplaceProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { refresh: refreshCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

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
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
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
    <>
      <ProductDetail
        product={product}
        onClose={goBack}
        onSellerClick={(sellerId) => navigate(`/marketplace?seller=${sellerId}`)}
        onBuyNow={async () => {
          await refreshCart();
          setShowCheckout(true);
        }}
        onCartChange={refreshCart}
        onOpenCart={() => setShowCart(true)}
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
    </>
  );
}
