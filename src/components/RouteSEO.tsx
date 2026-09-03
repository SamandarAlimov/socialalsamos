import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';

interface RouteMeta {
  title: string;
  description: string;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
}

function useRouteMeta(): RouteMeta {
  const { pathname } = useLocation();
  const params = useParams();
  const { t } = useTranslation();

  // Pre-defined per-route metadata
  if (pathname === '/' || pathname === '/auth') {
    return {
      title: 'Alsamos — Superapp',
      description: 'Alsamos — xabarlar, hamjamiyatlar, videolar, marketplace, xarita, to‘lovlar, AI va mini ilovalarni bir joyda birlashtirgan superapp.',
    };
  }
  if (pathname === '/legal/terms' || pathname === '/terms' || pathname === '/terms-of-service') {
    return {
      title: 'Foydalanish shartlari',
      description: 'Alsamos superappdan foydalanish shartlari va qoidalari.',
    };
  }
  if (pathname === '/legal/privacy' || pathname === '/privacy' || pathname === '/privacy-policy') {
    return {
      title: 'Maxfiylik siyosati',
      description: 'Alsamos superapp maxfiylik siyosati: ma’lumotlarni yig‘ish, himoya qilish va boshqarish tartibi.',
    };
  }
  if (pathname === '/help' || pathname === '/help-center') {
    return {
      title: 'Yordam markazi',
      description: 'Alsamos superapp bo‘yicha yordam, akkaunt, xavfsizlik va foydalanish bo‘yicha ma’lumotlar.',
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
    return { title: t('nav.messages'), description: 'Xabar almashing, audio va video qo\'ng\'iroqlar qiling.', noindex: true };
  }
  if (pathname.startsWith('/marketplace')) {
    return { title: t('nav.marketplace'), description: 'Mahsulotlarni xarid qiling va soting — Alsamos Marketplace.' };
  }
  if (pathname.startsWith('/map')) {
    return { title: t('nav.map'), description: 'Atrofingizdagi joylarni, do\'stlaringizni va marshrutlarni toping.' };
  }
  if (pathname.startsWith('/notifications')) {
    return { title: t('nav.notifications'), description: 'Sizning bildirishnomalaringiz: layklar, izohlar, obunalar va eslatmalar.', noindex: true };
  }
  if (pathname.startsWith('/create')) {
    return { title: t('nav.create'), description: 'Post, hikoya yoki video yarating va dunyo bilan bo\'lishing.', noindex: true };
  }
  if (pathname.startsWith('/profile')) {
    return { title: t('nav.profile'), description: 'Sizning Alsamos profilingiz.', noindex: true };
  }
  if (pathname.startsWith('/user/')) {
    const username = params.username || '';
    return {
      title: username ? `@${username}` : t('nav.profile'),
      description: username ? `@${username} — Alsamos profili.` : 'Foydalanuvchi profili.',
      type: 'profile',
    };
  }
  if (pathname.startsWith('/post/')) {
    return { title: 'Post', description: 'Alsamos dagi ommaviy post.', type: 'article' };
  }
  if (pathname.startsWith('/channel/')) {
    return { title: 'Kanal', description: 'Alsamos ommaviy kanali.' };
  }
  if (pathname.startsWith('/group/')) {
    return { title: 'Guruh', description: 'Alsamos ommaviy guruhi.' };
  }
  if (pathname.startsWith('/hashtag/')) {
    return { title: 'Hashtag', description: 'Alsamos dagi hashtag bo‘yicha ommaviy postlar.' };
  }
  if (pathname.startsWith('/settings')) {
    return { title: t('nav.settings'), description: 'Akkaunt sozlamalari, tilni o\'zgartirish va maxfiylik.', noindex: true };
  }
  if (pathname.startsWith('/payment')) {
    return { title: t('nav.payment'), description: 'To\'lov, hamyon va karta sozlamalari.', noindex: true };
  }
  if (pathname.startsWith('/ai')) {
    return { title: t('nav.ai'), description: 'Alsamos AI yordamchisi bilan suhbatlashing.', noindex: true };
  }
  if (pathname.startsWith('/ads')) {
    return { title: 'Ads Manager', description: 'Reklama kampaniyalarini yarating va kuzating.', noindex: true };
  }
  if (pathname.startsWith('/channels')) {
    return { title: 'Channels', description: 'Ommaviy va xususiy kanallar — Telegram uslubidagi yangiliklar.' };
  }
  if (pathname.startsWith('/mini-apps')) {
    return { title: t('nav.miniApps'), description: 'Mini ilovalar va integratsiyalar — bevosita Alsamos ichida.' };
  }
  if (pathname.startsWith('/admin')) {
    return { title: 'Admin', description: 'Alsamos boshqaruv paneli.', noindex: true };
  }
  if (pathname.startsWith('/activity')) {
    return { title: 'Activity', description: 'Faollik va vaqt statistikasi.', noindex: true };
  }
  if (pathname.startsWith('/story-archive')) {
    return { title: 'Hikoyalar arxivi', description: 'Sizning eski hikoyalaringiz.', noindex: true };
  }
  return {
    title: 'Alsamos — Superapp',
    description: 'Alsamos — xabarlar, hamjamiyatlar, videolar, marketplace, xarita, to‘lovlar, AI va mini ilovalarni birlashtirgan superapp.',
    noindex: true,
  };
}

export function RouteSEO() {
  const meta = useRouteMeta();
  return <SEO title={meta.title} description={meta.description} type={meta.type} noindex={meta.noindex} />;
}
