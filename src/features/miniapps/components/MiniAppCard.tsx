import { BadgeCheck, ExternalLink, Globe, Link2, Pin, Bot, Star, Users } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { MiniApp } from '../types';

interface MiniAppCardProps {
  app: MiniApp;
  categoryLabel: string;
  canManage: boolean;
  onOpen: (app: MiniApp) => void;
  onEdit: (app: MiniApp) => void;
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (value >= 1_000) return (value / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(value);
}

function TypeIcon({ type }: { type: MiniApp['appType'] }) {
  if (type === 'bot') return <Bot className="h-3.5 w-3.5" />;
  if (type === 'link') return <Link2 className="h-3.5 w-3.5" />;
  if (type === 'native') return <Pin className="h-3.5 w-3.5" />;
  return <Globe className="h-3.5 w-3.5" />;
}

export function MiniAppCard({ app, categoryLabel, canManage, onOpen, onEdit }: MiniAppCardProps) {
  const publisherName = app.publisher.name ?? app.author.displayName ?? app.author.username ?? 'Noma\u2019lum';
  const publisherHandle = app.publisher.handle ?? app.author.username;
  const isOfficial = app.publisher.verification === 'official';
  const isVerified = isOfficial || app.publisher.verification === 'domain_verified';

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md',
        app.isPinned && 'border-primary/40 bg-primary/[0.03]',
      )}
    >
      {app.isPinned && (
        <span className="absolute right-3 top-3 flex items-center gap-1 text-[10px] font-medium text-primary">
          <Pin className="h-3 w-3" /> Tanlangan
        </span>
      )}

      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12 rounded-xl">
          <AvatarImage src={app.iconUrl ?? undefined} alt={app.name} className="rounded-xl object-cover" />
          <AvatarFallback className="rounded-xl bg-muted text-sm font-semibold">
            {app.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h3 className="truncate font-semibold leading-tight">{app.name}</h3>
            {isVerified && (
              <BadgeCheck
                className={cn('h-4 w-4 shrink-0', isOfficial ? 'text-blue-500' : 'text-emerald-500')}
                aria-label={isOfficial ? 'Rasmiy' : 'Domen tasdiqlangan'}
              />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {publisherHandle ? '@' + publisherHandle : publisherName}
          </p>
        </div>
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
        {app.shortDescription || app.description || 'Tavsif kiritilmagan'}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="secondary" className="gap-1 font-normal">
          <TypeIcon type={app.appType} />
          {categoryLabel}
        </Badge>
        {app.priceModel !== 'free' && (
          <Badge variant="outline" className="font-normal">
            {app.priceModel === 'paid' ? 'Pullik' : 'Freemium'}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {app.ratingCount > 0 && (
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {app.rating.toFixed(1)}
            <span className="opacity-60">({formatCount(app.ratingCount)})</span>
          </span>
        )}
        {app.usersCount > 0 && (
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {formatCount(app.usersCount)}
          </span>
        )}
      </div>

      <div className="mt-auto flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => onOpen(app)}>
          Ochish
        </Button>
        {app.url && (
          <Button
            size="sm"
            variant="outline"
            aria-label="Brauzerda ochish"
            onClick={() => window.open(app.url as string, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => onEdit(app)}>
            Tahrirlash
          </Button>
        )}
      </div>
    </div>
  );
}
