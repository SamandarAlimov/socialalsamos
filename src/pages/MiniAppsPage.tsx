import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { fetchMiniAppCategories } from '@/features/miniapps/api';
import { MiniAppCard } from '@/features/miniapps/components/MiniAppCard';
import { MiniAppViewer } from '@/features/miniapps/components/MiniAppViewer';
import { useMiniAppFeed } from '@/features/miniapps/hooks/useMiniAppFeed';
import {
  MINI_APP_SORT_LABELS,
  MINI_APP_TYPE_LABELS,
  type MiniApp,
  type MiniAppCategory,
  type MiniAppSection,
  type MiniAppSort,
  type MiniAppType,
} from '@/features/miniapps/types';

const SECTIONS: Array<{ id: MiniAppSection; label: string; authOnly?: boolean }> = [
  { id: 'all', label: 'Hammasi' },
  { id: 'official', label: 'Rasmiy' },
  { id: 'trending', label: 'Trendda' },
  { id: 'new', label: 'Yangi' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'installed', label: 'Mening ilovalarim', authOnly: true },
];

const SORTS: MiniAppSort[] = ['recommended', 'trending', 'popular', 'rating', 'new'];

const APP_TYPES: MiniAppType[] = ['link', 'webapp', 'bot', 'native'];

const FALLBACK_CATEGORIES: MiniAppCategory[] = [
  { id: 'religion', sortOrder: 10, icon: null, label: 'Diniy' },
  { id: 'education', sortOrder: 20, icon: null, label: 'Ta’lim' },
  { id: 'tools', sortOrder: 30, icon: null, label: 'Asboblar' },
  { id: 'other', sortOrder: 999, icon: null, label: 'Boshqa' },
];

const DEFAULT_SECTION: MiniAppSection = 'all';
const DEFAULT_SORT: MiniAppSort = 'recommended';

export default function MiniAppsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<MiniAppCategory[]>(FALLBACK_CATEGORIES);
  const [section, setSection] = useState<MiniAppSection>(DEFAULT_SECTION);
  const [category, setCategory] = useState<string>('all');
  const [appType, setAppType] = useState<MiniAppType | 'all'>('all');
  const [sort, setSort] = useState<MiniAppSort>(DEFAULT_SORT);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [viewerApp, setViewerApp] = useState<MiniApp | null>(null);

  const feed = useMiniAppFeed({
    section,
    category,
    appType,
    sort,
    verifiedOnly,
    query,
  });

  useEffect(() => {
    fetchMiniAppCategories('uz')
      .then((items) => {
        if (items.length > 0) setCategories(items);
      })
      .catch(() => {
        // Kategoriyalar yuklanmasa ham feed ishlashi kerak.
      });
  }, []);

  useEffect(() => {
    if (feed.error) {
      toast({
        title: 'Ilovalar yuklanmadi',
        description: feed.error,
        variant: 'destructive',
      });
    }
  }, [feed.error, toast]);

  const categoryLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of categories) map.set(item.id, item.label);
    return map;
  }, [categories]);

  const visibleSections = SECTIONS.filter((item) => !item.authOnly || Boolean(user));

  // Filter ikonkasidagi hisoblagich: nechta shart standartdan farq qiladi.
  const activeFilterCount =
    (section !== DEFAULT_SECTION ? 1 : 0) +
    (category !== 'all' ? 1 : 0) +
    (appType !== 'all' ? 1 : 0) +
    (sort !== DEFAULT_SORT ? 1 : 0) +
    (verifiedOnly ? 1 : 0);

  const resetFilters = () => {
    setSection(DEFAULT_SECTION);
    setCategory('all');
    setAppType('all');
    setSort(DEFAULT_SORT);
    setVerifiedOnly(false);
  };

  const activeSummary = [
    section !== DEFAULT_SECTION ? visibleSections.find((item) => item.id === section)?.label : null,
    category !== 'all' ? (categoryLabels.get(category) ?? category) : null,
    appType !== 'all' ? MINI_APP_TYPE_LABELS[appType] : null,
    sort !== DEFAULT_SORT ? MINI_APP_SORT_LABELS[sort] : null,
    verifiedOnly ? 'Tasdiqlangan' : null,
  ].filter(Boolean) as string[];

  const handleAdd = () => {
    if (!user) {
      toast({
        title: 'Tizimga kiring',
        description: 'Mini app qo’shish uchun avval hisobingizga kiring.',
        variant: 'destructive',
      });
      return;
    }
    navigate('/mini-apps/new');
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mini Apps</h1>
          <p className="text-sm text-muted-foreground">
            Kompaniyalar va dasturchilarning ilovalari — foydalanishga qarab tartiblanadi.
          </p>
        </div>
        <Button onClick={handleAdd} className="shrink-0 gap-1">
          <Plus className="h-4 w-4" />
          Qo’shish
        </Button>
      </header>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ilova yoki kompaniya nomi"
            className="pl-9 pr-9"
            aria-label="Qidirish"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Tozalash"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={activeFilterCount > 0 ? 'default' : 'outline'}
              size="icon"
              className="relative shrink-0"
              aria-label="Filtrlar"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-medium">Filtrlar</p>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetFilters}>
                  Tozalash
                </Button>
              )}
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Bo’lim</p>
                <div className="flex flex-wrap gap-1.5">
                  {visibleSections.map((item) => (
                    <Button
                      key={item.id}
                      size="sm"
                      variant={section === item.id ? 'default' : 'outline'}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setSection(item.id)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Kategoriya</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={category === 'all' ? 'default' : 'secondary'}
                    className="cursor-pointer whitespace-nowrap px-2.5 py-1 font-normal"
                    onClick={() => setCategory('all')}
                  >
                    Barchasi
                  </Badge>
                  {categories.map((item) => (
                    <Badge
                      key={item.id}
                      variant={category === item.id ? 'default' : 'secondary'}
                      className="cursor-pointer whitespace-nowrap px-2.5 py-1 font-normal"
                      onClick={() => setCategory(item.id)}
                    >
                      {item.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Saralash</p>
                <div className="flex flex-wrap gap-1.5">
                  {SORTS.map((item) => (
                    <Button
                      key={item}
                      size="sm"
                      variant={sort === item ? 'default' : 'outline'}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setSort(item)}
                    >
                      {MINI_APP_SORT_LABELS[item]}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Ilova turi</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant={appType === 'all' ? 'default' : 'outline'}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setAppType('all')}
                  >
                    Barcha turlar
                  </Button>
                  {APP_TYPES.map((item) => (
                    <Button
                      key={item}
                      size="sm"
                      variant={appType === item ? 'default' : 'outline'}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setAppType(item)}
                    >
                      {MINI_APP_TYPE_LABELS[item]}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                variant={verifiedOnly ? 'default' : 'outline'}
                size="sm"
                className="w-full gap-1"
                onClick={() => setVerifiedOnly((value) => !value)}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Faqat tasdiqlangan nashriyotlar
              </Button>
            </div>

            <div className="border-t px-4 py-3">
              <Button className="w-full" size="sm" onClick={() => setFiltersOpen(false)}>
                Ko’rish
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {activeSummary.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {activeSummary.map((label) => (
            <Badge key={label} variant="secondary" className="font-normal">
              {label}
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={resetFilters}>
            Tozalash
          </Button>
        </div>
      )}

      <div className="mt-5">
        {feed.loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-52 animate-pulse rounded-2xl border bg-muted/40"
                aria-hidden
              />
            ))}
          </div>
        ) : feed.apps.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <p className="font-medium">Ilova topilmadi</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {query
                ? 'Qidiruv shartlarini o’zgartirib ko’ring.'
                : 'Bu bo’limda hozircha moderatsiyadan o’tgan ilova yo’q.'}
            </p>
            <Button className="mt-4" onClick={handleAdd}>
              Birinchi ilovani qo’shish
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{feed.total} ilova</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {feed.apps.map((app) => (
                <MiniAppCard
                  key={app.id}
                  app={app}
                  categoryLabel={categoryLabels.get(app.category) ?? app.category}
                  canManage={Boolean(user && app.ownerId === user.id)}
                  onOpen={setViewerApp}
                  onEdit={(target) => navigate('/mini-apps/' + target.id + '/edit')}
                />
              ))}
            </div>

            {feed.hasMore && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  onClick={feed.loadMore}
                  disabled={feed.loadingMore}
                  className={cn(feed.loadingMore && 'opacity-70')}
                >
                  {feed.loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Ko’proq yuklash
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {viewerApp && <MiniAppViewer app={viewerApp} onClose={() => setViewerApp(null)} />}
    </div>
  );
}
