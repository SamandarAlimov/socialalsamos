-- Alsamos Marketplace prices are denominated in Uzbek so'm (UZS).
-- Historical rows inherited the old USD default even though sellers entered
-- UZS amounts, which caused dollar signs to appear throughout the storefront.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'currency'
  ) THEN
    ALTER TABLE public.products
      ALTER COLUMN currency SET DEFAULT 'UZS';

    UPDATE public.products
    SET currency = 'UZS'
    WHERE currency IS DISTINCT FROM 'UZS';
  END IF;
END
$$;
