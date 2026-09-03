import {
  Cpu, Shirt, Home, Dumbbell, Car, BookOpen, Sparkles, Baby, PawPrint,
  Gamepad2, Wrench, Utensils, Briefcase, Music, Palette, Flower2,
  Smartphone, Laptop, Watch, Camera, Bike, Sofa, Package, Gem,
  Plane, HeartPulse, GraduationCap, Ticket, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Professional category iconography.
 *
 * The marketplace previously rendered whatever emoji string was stored in
 * `product_categories.icon`, which looked like chat stickers, rendered
 * inconsistently across platforms, had no size/colour control and no
 * fallback. Categories are now mapped to a real Lucide icon set keyed by
 * slug, with keyword matching and a neutral fallback.
 */

const SLUG_ICONS: Record<string, LucideIcon> = {
  electronics: Cpu,
  'electronics-gadgets': Cpu,
  phones: Smartphone,
  mobile: Smartphone,
  computers: Laptop,
  laptops: Laptop,
  cameras: Camera,
  watches: Watch,
  fashion: Shirt,
  clothing: Shirt,
  jewelry: Gem,
  'home-garden': Home,
  home: Home,
  furniture: Sofa,
  garden: Flower2,
  'sports-outdoors': Dumbbell,
  sports: Dumbbell,
  bicycles: Bike,
  vehicles: Car,
  cars: Car,
  'books-media': BookOpen,
  books: BookOpen,
  music: Music,
  'health-beauty': Sparkles,
  beauty: Sparkles,
  health: HeartPulse,
  'kids-baby': Baby,
  baby: Baby,
  kids: Baby,
  pets: PawPrint,
  gaming: Gamepad2,
  games: Gamepad2,
  tools: Wrench,
  services: Briefcase,
  business: Briefcase,
  food: Utensils,
  'food-drinks': Utensils,
  art: Palette,
  handmade: Palette,
  travel: Plane,
  education: GraduationCap,
  events: Ticket,
  tickets: Ticket,
};

const KEYWORD_ICONS: Array<[RegExp, LucideIcon]> = [
  [/electron|texnika|gadget/i, Cpu],
  [/phone|telefon|smart/i, Smartphone],
  [/laptop|komput|noutbuk/i, Laptop],
  [/fashion|kiyim|moda|shoe/i, Shirt],
  [/home|uy|garden|bog/i, Home],
  [/furnit|mebel/i, Sofa],
  [/sport|fitnes/i, Dumbbell],
  [/vehicle|avto|mashina|car/i, Car],
  [/book|kitob|media/i, BookOpen],
  [/health|beauty|salomat|go'zal/i, Sparkles],
  [/baby|bola|kids/i, Baby],
  [/pet|hayvon/i, PawPrint],
  [/gam(e|ing)|o'yin/i, Gamepad2],
  [/tool|asbob/i, Wrench],
  [/food|oziq|ovqat/i, Utensils],
  [/service|xizmat/i, Briefcase],
  [/music|musiqa/i, Music],
  [/art|hunar/i, Palette],
  [/travel|sayohat/i, Plane],
  [/educat|ta'lim|kurs/i, GraduationCap],
  [/event|ticket|chipta/i, Ticket],
];

/** Resolves the best icon for a category by slug, then by name keywords. */
export function resolveCategoryIcon(
  slug?: string | null,
  name?: string | null,
): LucideIcon {
  if (slug) {
    const direct = SLUG_ICONS[slug.toLowerCase()];
    if (direct) return direct;
  }
  const haystack = `${slug ?? ''} ${name ?? ''}`;
  for (const [pattern, icon] of KEYWORD_ICONS) {
    if (pattern.test(haystack)) return icon;
  }
  return Package;
}

interface CategoryIconProps {
  slug?: string | null;
  name?: string | null;
  className?: string;
  /** Renders the icon inside a tinted square (used in category grids). */
  boxed?: boolean;
}

export function CategoryIcon({ slug, name, className, boxed = false }: CategoryIconProps) {
  const Icon = resolveCategoryIcon(slug, name);

  if (!boxed) {
    return <Icon className={cn('h-3.5 w-3.5 shrink-0', className)} aria-hidden="true" />;
  }

  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/10 text-foreground shrink-0">
      <Icon className={cn('h-4.5 w-4.5', className)} aria-hidden="true" />
    </span>
  );
}
