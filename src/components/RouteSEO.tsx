import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';

interface RouteMeta {
  title: string;
  description: string;
  type?: 'website' | 'article' | 'profile';
}

function useRouteMeta(): RouteMeta {
  const { pathname } = useLocation();
  const params = useParams();
  const { t } = useTranslation();

  // Pre-defined per-route metadata
  if (pathname === '/' || pathname === '/auth') {
    return {
      title: t('auth.signIn', 'Kirish'),
      description: 'Alsamos — ulaning, ulashing, kashf eting. Hisobingizga kiring yoki ro\'yxatdan o\'ting.',
    };
  }
  if (pathname.startsWith('/home')) {
    return { title: t('nav.home'), description: 'Alsamos jamoangizdagi eng so\'nggi postlar, hikoyalar va yangiliklar.' };
  }
  if (pathname.startsWith('/discover')) {
    return { title: t('nav.discover'), description: 'Yangi mualliflar, trend mavzular va mashhur kontentni kashf eting.' };
  }
  if (pathname.startsWith('/search')) {
    return { title: t('nav.search'), description: 'Alsamos\'da insonlar, postlar, hashteglar va mahsulotlarni qidiring.' };
  }
  if (pathname.startsWith('/videos')) {
    return { title: t('nav.videos'), description: 'Qisqa videolar, jonli efirlar va eng zo\'r kontent Alsamos\'da.' };
  }
  if (pathname.startsWith('/messages')) {
    return { title: t('nav.messages'), description: 'Xabar almashing, audio va video qo\'ng\'iroqlar qiling.' };
  }
  if (pathname.startsWith('/marketplace')) {
    return { title: t('nav.marketplace'), description: 'Mahsulotlarni xarid qiling va soting — Alsamos Marketplace.' };
  }
  if (pathname.startsWith('/map')) {
    return { title: t('nav.map'), description: 'Atrofingizdagi joylarni, do\'stlaringizni va marshrutlarni toping.' };
  }
  if (pathname.startsWith('/notifications')) {
    return { title: t('nav.notifications'), description: 'Sizning bildirishnomalaringiz: layklar, izohlar, obunalar va eslatmalar.' };
  }
  if (pathname.startsWith('/create')) {
    return { title: t('nav.create'), description: 'Post, hikoya yoki video yarating va dunyo bilan bo\'lishing.' };
  }
  if (pathname.startsWith('/profile')) {
    return { title: t('nav.profile'), description: 'Sizning Alsamos profilingiz.' };
  }
  if (pathname.startsWith('/user/')) {
    const username = params.username || '';
    return {
      title: username ? `@${username}` : t('nav.profile'),
      description: username ? `@${username} — Alsamos profili.` : 'Foydalanuvchi profili.',
      type: 'profile',
    };
  }
  if (pathname.startsWith('/settings')) {
    return { title: t('nav.settings'), description: 'Akkaunt sozlamalari, tilni o\'zgartirish va maxfiylik.' };
  }
  if (pathname.startsWith('/payment')) {
    return { title: t('nav.payment'), description: 'To\'lov, hamyon va karta sozlamalari.' };
  }
  if (pathname.startsWith('/ai')) {
    return { title: t('nav.ai'), description: 'Alsamos AI yordamchisi bilan suhbatlashing.' };
  }
  if (pathname.startsWith('/ads')) {
    return { title: 'Ads Manager', description: 'Reklama kampaniyalarini yarating va kuzating.' };
  }
  if (pathname.startsWith('/channels')) {
    return { title: 'Channels', description: 'Ommaviy va xususiy kanallar — Telegram uslubidagi yangiliklar.' };
  }
  if (pathname.startsWith('/mini-apps')) {
    return { title: t('nav.miniApps'), description: 'Mini ilovalar va integratsiyalar — bevosita Alsamos ichida.' };
  }
  if (pathname.startsWith('/admin')) {
    return { title: 'Admin', description: 'Alsamos boshqaruv paneli.' };
  }
  if (pathname.startsWith('/activity')) {
    return { title: 'Activity', description: 'Faollik va vaqt statistikasi.' };
  }
  if (pathname.startsWith('/story-archive')) {
    return { title: 'Hikoyalar arxivi', description: 'Sizning eski hikoyalaringiz.' };
  }
  return { title: 'Alsamos', description: 'Alsamos — ulaning, ulashing, kashf eting.' };
}

export function RouteSEO() {
  const meta = useRouteMeta();
  return <SEO title={meta.title} description={meta.description} type={meta.type} />;
}
