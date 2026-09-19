import type { Category } from '@/hooks/useMarketplace';

export interface CatalogGuideGroup {
  title: string;
  items: string[];
}

export interface CatalogGuide {
  label: string;
  groups: CatalogGuideGroup[];
}

const CATEGORY_LABELS: Record<string, string> = {
  electronics: 'Elektronika',
  'electronics-gadgets': 'Elektronika va gadjetlar',
  phones: 'Telefonlar',
  computers: 'Kompyuterlar',
  fashion: 'Kiyim va moda',
  clothing: 'Kiyim',
  'home-garden': 'Uy va bog‘',
  home: 'Uy-ro‘zg‘or',
  furniture: 'Mebel',
  'sports-outdoors': 'Sport va hordiq',
  sports: 'Sport',
  vehicles: 'Transport',
  cars: 'Avtomobillar',
  'books-media': 'Kitob va media',
  books: 'Kitoblar',
  'health-beauty': 'Go‘zallik va parvarish',
  beauty: 'Go‘zallik',
  health: 'Salomatlik',
  'kids-baby': 'Bolalar',
  kids: 'Bolalar',
  baby: 'Chaqaloqlar',
  pets: 'Hayvonlar uchun',
  gaming: 'Gaming va o‘yinlar',
  games: 'O‘yinlar',
  tools: 'Asboblar',
  services: 'Xizmatlar',
  business: 'Biznes uchun',
  food: 'Oziq-ovqat',
  'food-drinks': 'Oziq-ovqat va ichimliklar',
  art: 'Ijod va hunarmandchilik',
  handmade: 'Qo‘l mehnati',
  travel: 'Sayohat',
  education: 'Ta’lim',
  events: 'Tadbirlar',
  tickets: 'Chiptalar',
};

export function catalogCategoryLabel(category: Category): string {
  return CATEGORY_LABELS[category.slug.toLocaleLowerCase()] || category.name;
}

const GUIDES: Array<{
  match: RegExp;
  guide: CatalogGuide;
}> = [
  {
    match: /electron|texnika|gadget/i,
    guide: {
      label: 'Elektronika',
      groups: [
        { title: 'Telefon va gadjetlar', items: ['Smartfonlar', 'Telefon aksessuarlari', 'Smart-soatlar', 'Planshetlar'] },
        { title: 'Kompyuter texnikasi', items: ['Noutbuklar', 'Kompyuterlar', 'Monitorlar', 'Klaviatura va sichqoncha'] },
        { title: 'Audio va video', items: ['Quloqchinlar', 'Kolonkalar', 'Televizorlar', 'Media qurilmalar'] },
        { title: 'Foto va qurilmalar', items: ['Kameralar', 'Videokameralar', 'Xotira kartalari', 'Zaryadlovchilar'] },
      ],
    },
  },
  {
    match: /fashion|kiyim|moda|clothing/i,
    guide: {
      label: 'Moda',
      groups: [
        { title: 'Ayollar uchun', items: ['Ayollar kiyimi', 'Ayollar poyabzali', 'Sumkalar', 'Aksessuarlar'] },
        { title: 'Erkaklar uchun', items: ['Erkaklar kiyimi', 'Erkaklar poyabzali', 'Soatlar', 'Aksessuarlar'] },
        { title: 'Bolalar uchun', items: ['Qizlar kiyimi', 'O‘g‘il bolalar kiyimi', 'Bolalar poyabzali', 'Maktab uchun'] },
        { title: 'Mavsumiy', items: ['Kurtkalar', 'Sport kiyimi', 'Uy kiyimi', 'Bosh kiyimlar'] },
      ],
    },
  },
  {
    match: /home|garden|uy|mebel|furniture/i,
    guide: {
      label: 'Uy va ro‘zg‘or',
      groups: [
        { title: 'Mebel', items: ['Divanlar', 'Kreslolar', 'Stol va stullar', 'Shkaflar'] },
        { title: 'Oshxona', items: ['Idish-tovoq', 'Oshxona jihozlari', 'Saqlash idishlari', 'Pishirish uchun'] },
        { title: 'Uy tekstili', items: ['Choyshablar', 'Sochiqlar', 'Pardalar', 'Gilamlar'] },
        { title: 'Bog‘ va ta’mirlash', items: ['Bog‘ jihozlari', 'Asboblar', 'Yoritish', 'Uy dekoratsiyasi'] },
      ],
    },
  },
  {
    match: /sport|outdoor|fitnes/i,
    guide: {
      label: 'Sport va hordiq',
      groups: [
        { title: 'Fitness', items: ['Trenajyorlar', 'Gantellar', 'Yoga', 'Fitness aksessuarlari'] },
        { title: 'Faol hordiq', items: ['Velosipedlar', 'Skuterlar', 'Turizm', 'Piknik uchun'] },
        { title: 'Sport turlari', items: ['Futbol', 'Basketbol', 'Tennis', 'Suzish'] },
        { title: 'Sport kiyimi', items: ['Krossovkalar', 'Sport kiyimi', 'Ryukzaklar', 'Himoya vositalari'] },
      ],
    },
  },
  {
    match: /vehicle|avto|car|transport/i,
    guide: {
      label: 'Transport',
      groups: [
        { title: 'Avtomobillar', items: ['Yengil avtomobillar', 'Yuk avtomobillari', 'Elektromobillar', 'Avtomobil qismlari'] },
        { title: 'Moto va skuter', items: ['Mototsikllar', 'Skuterlar', 'Moto aksessuarlar', 'Shlemlar'] },
        { title: 'Avto aksessuarlar', items: ['Registratorlar', 'Avto elektronika', 'Chexollar', 'Salon aksessuarlari'] },
        { title: 'Xizmat va ehtiyot qismlar', items: ['Shinalar', 'Disklar', 'Ehtiyot qismlar', 'Asbob-uskunalar'] },
      ],
    },
  },
  {
    match: /book|media|kitob/i,
    guide: {
      label: 'Kitob va media',
      groups: [
        { title: 'Kitoblar', items: ['Badiiy adabiyot', 'Biznes kitoblar', 'Bolalar kitoblari', 'Darsliklar'] },
        { title: 'Ta’lim', items: ['Til o‘rganish', 'Imtihonlar', 'Qo‘llanmalar', 'Kanselyariya'] },
        { title: 'Ijod', items: ['Rasm chizish', 'Musiqa', 'Hobbi', 'To‘plamlar'] },
      ],
    },
  },
  {
    match: /health|beauty|salomat|go.?zal/i,
    guide: {
      label: 'Go‘zallik va salomatlik',
      groups: [
        { title: 'Parvarish', items: ['Yuz parvarishi', 'Tana parvarishi', 'Soch parvarishi', 'Gigiyena'] },
        { title: 'Kosmetika', items: ['Makiyaj', 'Atirlar', 'Tirnoq parvarishi', 'Kosmetik aksessuarlar'] },
        { title: 'Salomatlik', items: ['Tibbiy qurilmalar', 'Massaj', 'Optika', 'Sport salomatligi'] },
      ],
    },
  },
  {
    match: /baby|kids|bola/i,
    guide: {
      label: 'Bolalar',
      groups: [
        { title: 'Kiyim va poyabzal', items: ['Chaqaloqlar kiyimi', 'Qizlar kiyimi', 'O‘g‘il bolalar kiyimi', 'Bolalar poyabzali'] },
        { title: 'O‘yinchoqlar', items: ['Rivojlantiruvchi', 'Konstruktorlar', 'Qo‘g‘irchoqlar', 'Mashinalar'] },
        { title: 'Parvarish', items: ['Bolalar gigiyenasi', 'Ovqatlantirish', 'Aravachalar', 'Bolalar mebeli'] },
      ],
    },
  },
  {
    match: /pet|hayvon/i,
    guide: {
      label: 'Hayvonlar uchun',
      groups: [
        { title: 'Mushuklar', items: ['Ozuqa', 'Idishlar', 'To‘shaklar', 'O‘yinchoqlar'] },
        { title: 'Itlar', items: ['Ozuqa', 'Tasma va bo‘yinbog‘', 'Parvarish', 'O‘yinchoqlar'] },
        { title: 'Boshqa hayvonlar', items: ['Qushlar', 'Baliqlar', 'Kemiruvchilar', 'Aksessuarlar'] },
      ],
    },
  },
  {
    match: /gam(e|ing)|o.?yin/i,
    guide: {
      label: 'Gaming',
      groups: [
        { title: 'Konsollar', items: ['PlayStation', 'Xbox', 'Nintendo', 'Konsol aksessuarlari'] },
        { title: 'PC gaming', items: ['Gaming noutbuklar', 'Monitorlar', 'Klaviaturalar', 'Sichqonchalar'] },
        { title: 'Aksessuarlar', items: ['Geympadlar', 'Quloqchinlar', 'Gaming stullar', 'Mikrofonlar'] },
      ],
    },
  },
];

export function getCatalogGuide(category?: Category | null): CatalogGuide | null {
  if (!category) return null;
  const haystack = `${category.slug} ${category.name}`;
  return GUIDES.find(entry => entry.match.test(haystack))?.guide ?? null;
}

export function categoryMatchesCatalogQuery(category: Category, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;

  if (
    category.name.toLocaleLowerCase().includes(needle) ||
    category.slug.toLocaleLowerCase().includes(needle) ||
    catalogCategoryLabel(category).toLocaleLowerCase().includes(needle)
  ) {
    return true;
  }

  const guide = getCatalogGuide(category);
  return Boolean(
    guide?.groups.some(group =>
      group.title.toLocaleLowerCase().includes(needle) ||
      group.items.some(item => item.toLocaleLowerCase().includes(needle)),
    ),
  );
}
