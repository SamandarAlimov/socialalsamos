import { useState, useCallback } from 'react';
import { Plus, Search, Megaphone, Users, TrendingUp, Bookmark } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChannels, Channel } from '@/hooks/useChannels';
import { ChannelCard } from '@/components/channels/ChannelCard';
import { ChannelView } from '@/components/channels/ChannelView';
import { CreateChannelDialog } from '@/components/channels/CreateChannelDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { PullToRefresh } from '@/components/PullToRefresh';
import { cn } from '@/lib/utils';

type ChannelTab = 'my' | 'discover' | 'popular';

export default function ChannelsPage() {
  const isMobile = useIsMobile();
  const { channels, isLoading, fetchChannels, createChannel, joinChannel, leaveChannel } = useChannels();
  const [activeTab, setActiveTab] = useState<ChannelTab>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const myChannels = channels.filter(c => c.is_member);
  const discoverChannels = channels.filter(c => !c.is_member && c.channel_type === 'public');
  const popularChannels = [...channels].sort((a, b) => b.subscriber_count - a.subscriber_count).slice(0, 20);

  const activeChannels = activeTab === 'my' ? myChannels
    : activeTab === 'discover' ? discoverChannels
    : popularChannels;

  const filteredChannels = activeChannels.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRefresh = useCallback(async () => {
    await fetchChannels();
  }, [fetchChannels]);

  // Show channel view
  if (selectedChannel) {
    return (
      <div className="h-[calc(100vh-4rem)] md:h-screen">
        <ChannelView channel={selectedChannel} onBack={() => setSelectedChannel(null)} />
      </div>
    );
  }

  const pageContent = (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Kanallar</h1>
            </div>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Yaratish</span>
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Kanallarni qidirish..."
              className="pl-10 bg-muted/50 border-0 h-10"
            />
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as ChannelTab)}>
            <TabsList className="w-full h-auto p-1 bg-muted/50 grid grid-cols-3">
              <TabsTrigger value="my" className="flex items-center gap-1.5 text-xs py-2">
                <Bookmark className="h-4 w-4" />
                <span>Mening</span>
              </TabsTrigger>
              <TabsTrigger value="discover" className="flex items-center gap-1.5 text-xs py-2">
                <Search className="h-4 w-4" />
                <span>Topish</span>
              </TabsTrigger>
              <TabsTrigger value="popular" className="flex items-center gap-1.5 text-xs py-2">
                <TrendingUp className="h-4 w-4" />
                <span>Mashhur</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Channels List */}
      <div className="max-w-3xl mx-auto px-4 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Megaphone className="h-16 w-16 mb-4 opacity-20" />
            <p className="font-medium mb-1">
              {activeTab === 'my' ? "Hali kanallaringiz yo'q" : "Kanal topilmadi"}
            </p>
            <p className="text-sm text-center">
              {activeTab === 'my'
                ? "Yangi kanal yarating yoki boshqa kanallarga obuna bo'ling"
                : "Boshqa kalit so'z bilan qidirib ko'ring"}
            </p>
            {activeTab === 'my' && (
              <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Kanal yaratish
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredChannels.map(channel => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                onSelect={setSelectedChannel}
                onJoin={joinChannel}
                onLeave={leaveChannel}
              />
            ))}
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
