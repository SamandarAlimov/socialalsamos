// Mini Apps kontrakti — docs/contracts/mini-apps/ bilan sinxron.
// Bu tiplar `mini_apps_feed` RPC qaytargan ustunlarga aynan mos keladi.

export const MINI_APP_CONTRACT_VERSION = '2.0.0';

export type MiniAppType = 'link' | 'webapp' | 'bot' | 'native';

export type MiniAppStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'archived';

export type MiniAppDisplayMode = 'iframe' | 'embed' | 'proxy' | 'external' | 'webview';

export type MiniAppPriceModel = 'free' | 'freemium' | 'paid';

export type PublisherType = 'individual' | 'company' | 'government' | 'non_profit';

export type PublisherVerification =
  | 'unverified'
  | 'email_verified'
  | 'domain_verified'
  | 'official';

export type MiniAppPermission =
  | 'profile'
  | 'contacts'
  | 'notifications'
  | 'payments'
  | 'location'
  | 'camera'
  | 'microphone'
  | 'clipboard'
  | 'storage';

export type MiniAppSection =
  | 'all'
  | 'pinned'
  | 'official'
  | 'trending'
  | 'new'
  | 'portfolio'
  | 'installed';

export type MiniAppSort = 'recommended' | 'trending' | 'new' | 'rating' | 'popular';

export interface MiniAppCategory {
  id: string;
  sortOrder: number;
  icon: string | null;
  label: string;
}

export interface MiniApp {
  id: string;
  handle: string | null;
  name: string;
  shortDescription: string | null;
  description: string | null;
  url: string | null;
  iconUrl: string | null;
  category: string;
  appType: MiniAppType;
  displayMode: MiniAppDisplayMode;
  priceModel: MiniAppPriceModel;
  permissions: MiniAppPermission[];
  screenshots: string[];
  privacyUrl: string | null;
  supportUrl: string | null;
  deepLink: string | null;
  isPinned: boolean;
  /**
   * `mini_apps.frame_blocked` — sayt to'g'ridan-to'g'ri iframe'ni bloklaydi.
   * Bu holda ochish rejasi `direct` qadamini tashlab, darhol proksiga o'tadi.
   */
  frameBlocked?: boolean;
  ownerId: string | null;
  publisher: {
    id: string | null;
    handle: string | null;
    name: string | null;
    type: PublisherType | null;
    verification: PublisherVerification;
  };
  author: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  rating: number;
  ratingCount: number;
  usersCount: number;
  opens30d: number;
  isInstalled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  score: number;
}

export interface MiniAppFeedPage {
  apps: MiniApp[];
  total: number;
  hasMore: boolean;
}

export interface MiniAppFeedParams {
  section?: MiniAppSection;
  category?: string | null;
  appType?: MiniAppType | 'all' | null;
  sort?: MiniAppSort;
  verifiedOnly?: boolean;
  priceModel?: MiniAppPriceModel | null;
  locale?: string | null;
  query?: string | null;
  limit?: number;
  offset?: number;
}

export interface MiniAppDraft {
  name: string;
  handle?: string | null;
  url: string;
  shortDescription?: string | null;
  description?: string | null;
  category: string;
  appType: MiniAppType;
  displayMode?: MiniAppDisplayMode;
  iconUrl?: string | null;
  publisherId?: string | null;
  permissions?: MiniAppPermission[];
  privacyUrl?: string | null;
  supportUrl?: string | null;
}

export type MiniAppEventName =
  | 'open'
  | 'close'
  | 'error'
  | 'install'
  | 'uninstall'
  | 'share'
  | 'payment';

export type MiniAppErrorCode =
  | 'timeout'
  | 'blocked'
  | 'invalid_url'
  | 'proxy_failed'
  | 'unknown';

export const MINI_APP_TYPE_LABELS: Record<MiniAppType, string> = {
  link: 'Havola',
  webapp: 'Web ilova',
  bot: 'Bot',
  native: 'Ichki modul',
};

export const MINI_APP_SORT_LABELS: Record<MiniAppSort, string> = {
  recommended: 'Tavsiya etilgan',
  trending: 'Trendda',
  popular: 'Eng ko\u2019p ishlatilgan',
  rating: 'Reyting bo\u2019yicha',
  new: 'Yangi',
};

export const MINI_APP_PERMISSION_LABELS: Record<MiniAppPermission, string> = {
  profile: 'Profil ma\u2019lumotlari',
  contacts: 'Kontaktlar',
  notifications: 'Bildirishnomalar',
  payments: 'To\u2019lovlar',
  location: 'Joylashuv',
  camera: 'Kamera',
  microphone: 'Mikrofon',
  clipboard: 'Vaqtinchalik xotira',
  storage: 'Fayl saqlash',
};
