/**
 * Mavjud taksi parklarini ulash (o'z taksoparkimizni qurmaymiz).
 *
 * Har bir provayder uchun chuqur havola (deep link) yasaymiz: foydalanuvchi
 * "Buyurtma" bosganda to'g'ridan-to'g'ri o'sha ilovada manzil to'ldirilgan
 * holda buyurtma ekrani ochiladi. Ilova bo'lmasa - veb versiya.
 */

export interface TaxiPoint {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface TaxiProvider {
  slug: string;
  name: string;
  emoji: string;
  /** Taxminiy tarif (so'm). */
  baseFare: number;
  perKm: number;
  perMin: number;
  minFare: number;
  phone?: string;
  build: (from: TaxiPoint, to: TaxiPoint) => string;
}

function q(value: number): string {
  return String(Number(value.toFixed(6)));
}

export const TAXI_PROVIDERS: TaxiProvider[] = [
  {
    slug: 'yandex_go',
    name: 'Yandex Go',
    emoji: '\ud83d\ude96',
    baseFare: 8000,
    perKm: 2200,
    perMin: 350,
    minFare: 12000,
    build: (from, to) =>
      'https://3.redirect.appmetrica.yandex.com/route?start-lat=' +
      q(from.latitude) +
      '&start-lon=' +
      q(from.longitude) +
      '&end-lat=' +
      q(to.latitude) +
      '&end-lon=' +
      q(to.longitude) +
      '&level=50&appmetrica_tracking_id=1178268795219780156&ref=alsamos',
  },
  {
    slug: 'yandex_maps_taxi',
    name: 'Yandex Maps taksi',
    emoji: '\ud83d\uddfa\ufe0f',
    baseFare: 8000,
    perKm: 2200,
    perMin: 350,
    minFare: 12000,
    build: (from, to) =>
      'https://yandex.uz/maps/?rtext=' +
      q(from.latitude) +
      ',' +
      q(from.longitude) +
      '~' +
      q(to.latitude) +
      ',' +
      q(to.longitude) +
      '&rtt=taxi',
  },
  {
    slug: 'mytaxi',
    name: 'MyTaxi',
    emoji: '\ud83d\ude95',
    baseFare: 7000,
    perKm: 2000,
    perMin: 300,
    minFare: 10000,
    phone: '+998712000909',
    build: (from, to) =>
      'https://mytaxi.uz/?pickup_lat=' +
      q(from.latitude) +
      '&pickup_lng=' +
      q(from.longitude) +
      '&drop_lat=' +
      q(to.latitude) +
      '&drop_lng=' +
      q(to.longitude) +
      '&utm_source=alsamos',
  },
  {
    slug: 'indrive',
    name: 'inDrive',
    emoji: '\ud83d\udfe9',
    baseFare: 6000,
    perKm: 1800,
    perMin: 250,
    minFare: 9000,
    build: (from, to) =>
      'https://indrive.com/?from=' +
      q(from.latitude) +
      ',' +
      q(from.longitude) +
      '&to=' +
      q(to.latitude) +
      ',' +
      q(to.longitude) +
      '&utm_source=alsamos',
  },
  {
    slug: 'millennium',
    name: 'Millennium 1080',
    emoji: '\u260e\ufe0f',
    baseFare: 6000,
    perKm: 1700,
    perMin: 250,
    minFare: 9000,
    phone: '1080',
    build: () => 'tel:1080',
  },
];

export interface TaxiOffer {
  provider: TaxiProvider;
  url: string;
  /** Taxminiy narx (so'm). */
  estimate: number;
  estimateLabel: string;
}

export function formatSum(value: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(value / 500) * 500) + ' so\u2018m';
}

/**
 * Taksi taklifla ro'yxati: masofa (km) va vaqt (daqiqa) bo'yicha taxminiy narx.
 * Aniq narx provayder ilovasida ko'rsatiladi - biz faqat mo'ljal beramiz.
 */
export function buildTaxiOffers(
  from: TaxiPoint,
  to: TaxiPoint,
  distanceKm: number,
  durationMin: number,
): TaxiOffer[] {
  return TAXI_PROVIDERS.map((provider) => {
    const raw =
      provider.baseFare + provider.perKm * distanceKm + provider.perMin * durationMin;
    const estimate = Math.max(provider.minFare, raw);
    return {
      provider,
      url: provider.build(from, to),
      estimate,
      estimateLabel: formatSum(estimate),
    };
  }).sort((a, b) => a.estimate - b.estimate);
}
