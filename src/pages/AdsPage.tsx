import { useLocation } from 'react-router-dom';
import { AdsManagerPage } from '@/components/ads/AdsManagerPage';
import AdsExperimentsPage from '@/pages/AdsExperimentsPage';

export default function AdsPage() {
  const location = useLocation();

  if (location.pathname === '/ads/experiments') {
    return <AdsExperimentsPage />;
  }

  return <AdsManagerPage />;
}
