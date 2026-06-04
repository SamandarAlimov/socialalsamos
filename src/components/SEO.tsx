import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  canonical?: string;
  noindex?: boolean;
}

const SITE_URL = 'https://socialalsamos.lovable.app';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.jpg`;
const DEFAULT_DESC = 'Alsamos — ulaning, ulashing, kashf eting. Zamonaviy ijtimoiy tarmoq: xabarlar, hikoyalar, jonli efirlar, marketplace.';

export function SEO({
  title,
  description = DEFAULT_DESC,
  image = DEFAULT_IMAGE,
  type = 'website',
  canonical,
  noindex,
}: SEOProps) {
  const location = useLocation();
  const fullTitle = title ? `${title} • Alsamos` : 'Alsamos';
  const url = canonical || `${SITE_URL}${location.pathname}`;
  const img = image.startsWith('http') ? image : `${SITE_URL}${image}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={fullTitle} />
      <meta property="og:site_name" content="Alsamos" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@Alsamos" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={img} />
    </Helmet>
  );
}
