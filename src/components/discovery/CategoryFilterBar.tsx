import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Cpu,
  Gamepad2,
  GraduationCap,
  Grid3x3,
  Heart,
  Music,
  Palette,
  Plane,
  Shirt,
  Trophy,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import db from '@/lib/supabaseAny';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Flutter: lib/features/discovery/presentation/widgets/category_filter_bar.dart
// bilan bir xil xatti-harakat: kategoriyalar `categories` jadvalidan yuklanadi,
// tanlov `user_interests` jadvaliga saqlanadi.

interface Category {
  id: string;
  name: string;
  icon?: string | null;
}

interface CategoryFilterBarProps {
  /** Tanlangan kategoriyalar o'zgarganda chaqiriladi (nomlar bo'yicha). */
  onCategoriesChanged?: (categories: string[]) => void;
  refreshKey?: number;
}

const ICON_MAP: Record<string, LucideIcon> = {
  trophy: Trophy,
  sports: Trophy,
  music: Music,
  cpu: Cpu,
  technology: Cpu,
  tech: Cpu,
  shirt: Shirt,
  fashion: Shirt,
  utensils: Utensils,
  food: Utensils,
  plane: Plane,
  travel: Plane,
  gamepad2: Gamepad2,
  gaming: Gamepad2,
  palette: Palette,
  art: Palette,
  graduationcap: GraduationCap,
  education: GraduationCap,
  briefcase: Briefcase,
  business: Briefcase,
  heart: Heart,
  health: Heart,
};

function iconFor(category: Category): LucideIcon {
  const key = (category.icon ?? category.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ICON_MAP[key] ?? Grid3x3;
}

export function CategoryFilterBar({ onCategoriesChanged, refreshKey = 0 }: CategoryFilterBarProps) {
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await db
        .from('categories')
        .select('id, name, icon, display_order, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      const list: Category[] = (data ?? []).map((row: any) => ({
        id: row.id as string,
        name: row.name as string,
        icon: row.icon as string | null,
      }));
      setCategories(list);
      setIsUnavailable(list.length === 0);

      if (user) {
        const { data: interests, error: interestsError } = await db
          .from('user_interests')
          .select('category_id, categories!inner(name)')
          .eq('user_id', user.id);

        if (!interestsError) {
          const names = (interests ?? [])
            .map((row: any) => row.categories?.name as string | undefined)
            .filter((name): name is string => !!name);
          setSelected(names);
          onCategoriesChanged?.(names);
        }
      }
    } catch (error) {
      // Jadval mavjud bo'lmasa yoki ruxsat yo'q bo'lsa — bo'limni yashiramiz.
      console.warn('Kategoriyalarni yuklash muvaffaqiyatsiz:', error);
      setIsUnavailable(true);
    } finally {
      setIsLoading(false);
    }
  }, [onCategoriesChanged, user]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, user?.id]);

  const persist = useCallback(
    async (names: string[]) => {
      if (!user) return;
      try {
        const ids = categories.filter((c) => names.includes(c.name)).map((c) => c.id);

        await db.from('user_interests').delete().eq('user_id', user.id);

        if (ids.length > 0) {
          const { error } = await db.from('user_interests').insert(
            ids.map((categoryId) => ({
              user_id: user.id,
              category_id: categoryId,
              weight: 1.0,
            })),
          );
          if (error) throw error;
        }
      } catch (error) {
        console.error('Qiziqishlarni saqlashda xatolik:', error);
        toast.error('Qiziqishlarni saqlab bo\u2018lmadi');
      }
    },
    [categories, user],
  );

  const toggle = useCallback(
    (name: string | 'all') => {
      triggerHaptic('light');

      let next: string[];
      if (name === 'all') {
        next = [];
      } else if (selected.includes(name)) {
        next = selected.filter((item) => item !== name);
      } else {
        next = [...selected, name];
      }

      setSelected(next);
      onCategoriesChanged?.(next);
      void persist(next);
    },
    [onCategoriesChanged, persist, selected, triggerHaptic],
  );

  const chips = useMemo(() => categories, [categories]);

  if (isUnavailable && !isLoading) return null;

  if (isLoading && categories.length === 0) {
    return (
      <div className="flex gap-2 overflow-hidden" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
      role="group"
      aria-label="Kategoriya filtri"
    >
      <button
        type="button"
        onClick={() => toggle('all')}
        aria-pressed={selected.length === 0}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          selected.length === 0
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        )}
      >
        <Grid3x3 className="h-4 w-4" />
        Hammasi
      </button>

      {chips.map((category) => {
        const Icon = iconFor(category);
        const isActive = selected.includes(category.name);
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => toggle(category.name)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}
          >
            <Icon className="h-4 w-4" />
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
