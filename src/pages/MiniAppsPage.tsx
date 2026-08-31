import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, ShieldCheck, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { fetchMiniAppCategories } from '@/features/miniapps/api';
import { MiniAppCard } from '@/features/miniapps/components/MiniAppCard';
import { MiniAppFormDialog } from '@/features/miniapps/components/MiniAppFormDialog';
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

const FALLBACK_CATEGORIES: MiniAppCategory[] = [
  { id: 'religion', sortOrder: 10, icon: null, label: 'Diniy' },
  { id: 'education', sortOrder: 20, icon: null, label: 'Ta’lim' },
  { id: 'tools', sortOrder: 30, icon: null, label: 'Asboblar' },
  { id: 'other', sortOrder: 999, icon: null, label: 'Boshqa' },
];

export default function MiniAppsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [categories, setCategories] = useState<MiniAppCategory[]>(FALLBACK_CATEGORIES);
  const [section, setSection] = useState<MiniAppSection>('all');
  const [category, setCategory] = useState<string>('all');
  const [appType, setAppType] = useState<MiniAppType | 'all'>('all');
  const [sort, setSort] = useState<MiniAppSort>('recommended');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [query, setQuery] = useState('');

  const [viewerApp, setViewerApp] = useState<MiniApp | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<MiniApp | null>(null);

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

  const handleAdd = () => {
    if (!user) {
      toast({
        title: 'Tizimga kiring',
        description: 'Mini app qo’shish uchun avval hisobingizga kiring.',
        variant: 'destructive',
      });
      return;
    }
    setEditingApp(null);
    setFormOpen(true);
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

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
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

          <Select value={sort} onValueChange={(value) => setSort(value as MiniAppSort)}>
            <SelectTrigger className="sm:w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((item) => (
                <SelectItem key={item} value={item}>
                  {MINI_APP_SORT_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={appType}
            onValueChange={(value) => setAppType(value as MiniAppType | 'all')}
          >
            <SelectTrigger className="sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha turlar</SelectItem>
              {(['link', 'webapp', 'bot', 'native'] as MiniAppType[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {MINI_APP_TYPE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {visibleSections.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={section === item.id ? 'default' : 'outline'}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </Button>
          ))}

          <Button
            size="sm"
            variant={verifiedOnly ? 'default' : 'outline'}
            onClick={() => setVerifiedOnly((value) => !value)}
            className="gap-1"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Tasdiqlangan
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <Badge
            variant={category === 'all' ? 'default' : 'secondary'}
            className="cursor-pointer whitespace-nowrap px-3 py-1"
            onClick={() => setCategory('all')}
          >
            Barchasi
          </Badge>
          {categories.map((item) => (
            <Badge
              key={item.id}
              variant={category === item.id ? 'default' : 'secondary'}
              className="cursor-pointer whitespace-nowrap px-3 py-1"
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </Badge>
          ))}
        </div>
      </div>

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
            <p className="mb-3 text-xs text-muted-foreground">
              {feed.total} ilova
              {section === 'all' && sort === 'recommended' && ' · tanlangan platformalar birinchi'}
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {feed.apps.map((app) => (
                <MiniAppCard
                  key={app.id}
                  app={app}
                  categoryLabel={categoryLabels.get(app.category) ?? app.category}
                  canManage={Boolean(user && app.ownerId === user.id)}
                  onOpen={setViewerApp}
                  onEdit={(target) => {
                    setEditingApp(target);
                    setFormOpen(true);
                  }}
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

      <MiniAppFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        userId={user?.id ?? null}
        categories={categories}
        app={editingApp}
        onSaved={feed.refresh}
      />
    </div>
  );
}
