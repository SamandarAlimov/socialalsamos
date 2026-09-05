import { useLocation } from 'react-router-dom';
import { AdsManagerPage } from '@/components/ads/AdsManagerPage';
import AdsCampaignsV4Page from '@/pages/AdsCampaignsV4Page';
import AdsExperimentsPage from '@/pages/AdsExperimentsPage';

export default function AdsPage() {
  const location = useLocation();

  if (location.pathname === '/ads/campaigns') {
    return <AdsCampaignsV4Page />;
  }

  if (location.pathname === '/ads/experiments') {
    return <AdsExperimentsPage />;
  }

  return <AdsManagerPage />;
}
