import { useState } from 'react';
import { 
  Plus, 
  BarChart3, 
  Eye, 
  MousePointerClick, 
  Users, 
  DollarSign,
  Pause,
  Play,
  Trash2,
  MoreHorizontal,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserAds, Ad } from '@/hooks/useAds';
import { CreateAdDialog } from './CreateAdDialog';
import { AdStatsDialog } from './AdStatsDialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export function AdsManagerPage() {
  const { ads, isLoading, pauseAd, resumeAd, deleteAd } = useUserAds();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'pending'>('all');

  const filteredAds = ads.filter(ad => {
    if (filter === 'all') return true;
    return ad.status === filter;
  });

  // Overall stats
  const totalImpressions = ads.reduce((sum, ad) => sum + ad.impressions_count, 0);
  const totalClicks = ads.reduce((sum, ad) => sum + ad.clicks_count, 0);
  const totalReach = ads.reduce((sum, ad) => sum + ad.reach_count, 0);
  const totalSpent = ads.reduce((sum, ad) => sum + ad.spent, 0);
  const overallCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  const getStatusBadge = (status: Ad['status']) => {
    const variants: Record<typeof status, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      active: { variant: 'default', label: 'Faol' },
      pending: { variant: 'secondary', label: 'Tekshirilmoqda' },
      paused: { variant: 'outline', label: 'To\'xtatilgan' },
      rejected: { variant: 'destructive', label: 'Rad etildi' },
      completed: { variant: 'secondary', label: 'Tugallandi' }
    };
    const { variant, label } = variants[status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Ads Manager</h1>
            <p className="text-sm text-muted-foreground">
              Reklamalaringizni boshqaring
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Yangi reklama
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Ko'rishlar</span>
                </div>
                <p className="text-2xl font-bold mt-1">
                  {totalImpressions.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Kliklar</span>
                </div>
                <p className="text-2xl font-bold mt-1">
                  {totalClicks.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Reach</span>
                </div>
                <p className="text-2xl font-bold mt-1">
                  {totalReach.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">CTR</span>
                </div>
                <p className="text-2xl font-bold mt-1">
                  {overallCTR.toFixed(2)}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Sarflangan</span>
                </div>
                <p className="text-2xl font-bold mt-1">
                  ${totalSpent.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs Filter */}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">Hammasi ({ads.length})</TabsTrigger>
              <TabsTrigger value="active">
                Faol ({ads.filter(a => a.status === 'active').length})
              </TabsTrigger>
              <TabsTrigger value="paused">
                To'xtatilgan ({ads.filter(a => a.status === 'paused').length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Kutilmoqda ({ads.filter(a => a.status === 'pending').length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Ads List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredAds.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-lg font-medium">Reklamalar yo'q</p>
              <p className="text-sm text-muted-foreground mb-4">
                Birinchi reklamangizni yarating
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Reklama yaratish
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAds.map(ad => (
                <Card key={ad.id} className="overflow-hidden">
                  <div className="flex gap-4 p-4">
                    {/* Media Preview */}
                    <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-secondary">
                      {ad.media_type === 'video' ? (
                        <video
                          src={ad.media_url}
                          className="w-full h-full object-cover"
                          muted
                        />
                      ) : (
                        <img
                          src={ad.media_url}
                          alt={ad.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold truncate">{ad.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {ad.ad_type === 'feed' ? '📰 Feed' : 
                             ad.ad_type === 'story' ? '📸 Story' : '✨ Hammasi'}
                          </p>
                        </div>
                        {getStatusBadge(ad.status)}
                      </div>

                      {/* Quick Stats */}
                      <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          {ad.impressions_count.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <MousePointerClick className="h-3.5 w-3.5" />
                          {ad.clicks_count.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          ${ad.spent.toFixed(2)} / ${ad.budget}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAdId(ad.id)}
                        >
                          <BarChart3 className="h-4 w-4 mr-1" />
                          Statistika
                        </Button>

                        {ad.status === 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => pauseAd(ad.id)}
                          >
                            <Pause className="h-4 w-4 mr-1" />
                            To'xtatish
                          </Button>
                        )}

                        {ad.status === 'paused' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resumeAd(ad.id)}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Davom ettirish
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteAd(ad.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              O'chirish
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Dialogs */}
      <CreateAdDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {selectedAdId && (
        <AdStatsDialog
          adId={selectedAdId}
          open={!!selectedAdId}
          onOpenChange={(open) => !open && setSelectedAdId(null)}
        />
      )}
    </div>
  );
}
