import { Fragment, useState, useCallback, useEffect } from 'react';
import { Plus, Search, Megaphone, TrendingUp, Bookmark } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useChannels, Channel } from '@/hooks/useChannels';
import { ChannelCard } from '@/components/channels/ChannelCard';
import { ChannelView } from '@/components/channels/ChannelView';
import { CreateChannelDialog } from '@/components/channels/CreateChannelDialog';
import { ChannelSponsoredCard } from '@/components/ads/ChannelSponsoredCard';
import { useActiveAds } from '@/hooks/useAds';
import { useIsMobile } from '@/hooks/use-mobile';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useSearchParams } from 'react-router-dom';

type ChannelTab = 'my' | 'discover' | 'popular';

export default function ChannelsPage() {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const { channels, isLoading, fetchChannels, createChannel, joinChannel, leaveChannel } = useChannels();
  const {
    ads: channelAds,
    trackImpression,
    trackClick,
    submitFeedback,
  } = useActiveAds('channel', 2);
  const [activeTab, setActiveTab] = useState<ChannelTab>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    const requested = searchParams.get('channel')?.trim();
    if (!requested || channels.length === 0) return;
    const normalized = requested.toLocaleLowerCase();
    const match = channels.find((channel) =>
      channel.id === requested ||
      channel.username?.toLocaleLowerCase() === normalized,
    );
    if (match) setSelectedChannel(match);
  }, [channels, searchParams]);

  const myChannels = channels.filter((c) => c.is_member);
  const discoverChannels = channels.filter((c) => !c.is_member && c.channel_type === 'public');
  const popularChannels = [...channels].sort((a, b) => b.subscriber_count - a.subscriber_count).slice(0, 20);

  const activeChannels = activeTab === 'my'
    ? myChannels
    : activeTab === 'discover'
      ? discoverChannels
      : popularChannels;

  const filteredChannels = activeChannels.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.username?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const sponsored = activeTab === 'my' ? null : channelAds[0] || null;

  const handleRefresh = useCallback(async () => {
    await fetchChannels();
  }, [fetchChannels]);

  // Show channel view. Ads never get injected into a private/direct
  // conversation here; sponsored units are limited to public discovery lists.
  if (selectedChannel) {
    return (
      <div className="h-[calc(100vh-4rem)] md:h-screen">
        <ChannelView channel={selectedChannel} onBack={() => setSelectedChannel(null)} />
      </div>
    );
  }

  const sponsoredCard = sponsored ? (
    <ChannelSponsoredCard
      ad={sponsored}
      onImpression={(id) => void trackImpression(id, 'channel')}
      onClick={(id) => void trackClick(id, 'channel')}
      onFeedback={(id, feedback) => void submitFeedback(id, feedback, 'channel')}
    />
  ) : null;

  const pageContent = (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-muted-foreground" />
              <h1 className="text-xl font-bold">Kanallar</h1>
            </div>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Yaratish</span>
            </Button>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Kanallarni qidirish..."
              className="h-10 border-0 bg-muted/50 pl-10"
            />
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ChannelTab)}>
            <TabsList className="grid h-auto w-full grid-cols-3 bg-muted/50 p-1">
              <TabsTrigger value="my" className="flex items-center gap-1.5 py-2 text-xs">
                <Bookmark className="h-4 w-4" />
                <span>Mening</span>
              </TabsTrigger>
              <TabsTrigger value="discover" className="flex items-center gap-1.5 py-2 text-xs">
                <Search className="h-4 w-4" />
                <span>Topish</span>
              </TabsTrigger>
              <TabsTrigger value="popular" className="flex items-center gap-1.5 py-2 text-xs">
                <TrendingUp className="h-4 w-4" />
                <span>Mashhur</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-muted-foreground" />
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Megaphone className="mb-4 h-16 w-16 opacity-20" />
            <p className="mb-1 font-medium">
              {activeTab === 'my' ? "Hali kanallaringiz yo'q" : 'Kanal topilmadi'}
            </p>
            <p className="text-center text-sm">
              {activeTab === 'my'
                ? "Yangi kanal yarating yoki boshqa kanallarga obuna bo'ling"
                : "Boshqa kalit so'z bilan qidirib ko'ring"}
            </p>
            {activeTab === 'my' && (
              <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Kanal yaratish
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredChannels.map((channel, index) => (
              <Fragment key={channel.id}>
                <ChannelCard
                  channel={channel}
                  onSelect={setSelectedChannel}
                  onJoin={joinChannel}
                  onLeave={leaveChannel}
                />
                {index === 3 && sponsoredCard}
              </Fragment>
            ))}
            {filteredChannels.length < 4 && sponsoredCard}
          </div>
        )}
      </div>

      <CreateChannelDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreateChannel={createChannel}
      />
    </div>
  );

  if (isMobile) {
    return (
      <PullToRefresh onRefresh={handleRefresh} className="h-full">
        {pageContent}
      </PullToRefresh>
    );
  }

  return pageContent;
}
