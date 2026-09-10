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
 * Category glyphs stay consistent through Lucide, while every category also
 * gets a stable accent tone. This gives the catalogue the visual scanning
 * speed of large commerce apps without falling back to platform-dependent
 * emoji or making every category monochrome.
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

const CATEGORY_TONES = [
  { icon: 'text-violet-600 dark:text-violet-400', box: 'bg-violet-500/12' },
  { icon: 'text-sky-600 dark:text-sky-400', box: 'bg-sky-500/12' },
  { icon: 'text-emerald-600 dark:text-emerald-400', box: 'bg-emerald-500/12' },
  { icon: 'text-amber-600 dark:text-amber-400', box: 'bg-amber-500/14' },
  { icon: 'text-rose-600 dark:text-rose-400', box: 'bg-rose-500/12' },
  { icon: 'text-cyan-600 dark:text-cyan-400', box: 'bg-cyan-500/12' },
  { icon: 'text-fuchsia-600 dark:text-fuchsia-400', box: 'bg-fuchsia-500/12' },
  { icon: 'text-lime-700 dark:text-lime-400', box: 'bg-lime-500/12' },
  { icon: 'text-orange-600 dark:text-orange-400', box: 'bg-orange-500/12' },
  { icon: 'text-indigo-600 dark:text-indigo-400', box: 'bg-indigo-500/12' },
] as const;

function categoryTone(slug?: string | null, name?: string | null) {
  const value = `${slug ?? ''}:${name ?? ''}` || 'category';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return CATEGORY_TONES[Math.abs(hash) % CATEGORY_TONES.length];
}

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
  /** Renders the icon inside a stable category-coloured tile. */
  boxed?: boolean;
}

export function CategoryIcon({ slug, name, className, boxed = false }: CategoryIconProps) {
  const Icon = resolveCategoryIcon(slug, name);
  const tone = categoryTone(slug, name);

  if (!boxed) {
    return (
      <Icon
        className={cn('h-3.5 w-3.5 shrink-0', tone.icon, className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
        tone.box,
        tone.icon,
      )}
    >
      <Icon className={cn('h-[18px] w-[18px]', className)} aria-hidden="true" />
    </span>
  );
}
