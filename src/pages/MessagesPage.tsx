import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Search,
  Plus,
  MessageCircle,
  Inbox,
  Archive,
  X,
  Forward,
  Trash2,
  Bookmark,
  Megaphone,
  ArrowDown,
  MapPin,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, useMessages, Conversation, Message } from '@/hooks/useMessages';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useVideoCall } from '@/hooks/useVideoCall';
import { useIncomingCalls } from '@/hooks/useIncomingCalls';
import { usePinnedMessages } from '@/hooks/usePinnedMessages';
import { useReadReceipts } from '@/hooks/useReadReceipts';
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { useSelfChat } from '@/hooks/useSelfChat';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { useToast } from '@/hooks/use-toast';
import { FolderChat } from '@/lib/chatFolders';

// Komponentlar
import { ChatListItem } from '@/components/messages/ChatListItem';
import { ChatFolderBar, FolderBarChat, SystemTab } from '@/components/messages/ChatFolderBar';
import { ChatHeader } from '@/components/messages/ChatHeader';
import { EnhancedMessageBubble } from '@/components/messages/EnhancedMessageBubble';
import { MessageInput } from '@/components/messages/MessageInput';
import { CreateChatDialog } from '@/components/messages/CreateChatDialog';
import { CreateGroupChannelDialog } from '@/components/messages/CreateGroupChannelDialog';
import { VideoCallOverlay } from '@/components/messages/VideoCallOverlay';
import { TelegramForwardDialog } from '@/components/messages/TelegramForwardDialog';
import { MessageSearch } from '@/components/messages/MessageSearch';
import { GlobalSearchResults } from '@/components/messages/GlobalSearchResults';
import { IncomingCallDialog } from '@/components/messages/IncomingCallDialog';
import { PinnedMessagesBar } from '@/components/messages/PinnedMessagesBar';
import { EditMessageDialog } from '@/components/messages/EditMessageDialog';
import { DeleteMessageDialog, DeleteScope } from '@/components/messages/DeleteMessageDialog';
import { JumpToDateDialog } from '@/components/messages/JumpToDateDialog';
import { TypingIndicator } from '@/components/messages/TypingIndicator';
import { GroupMemberManagement } from '@/components/messages/GroupMemberManagement';
import { ScheduledMessagesSheet } from '@/components/messages/ScheduledMessagesSheet';
import { MiniAudioPlayer } from '@/components/messages/MiniAudioPlayer';
import { MessageRequestBanner } from '@/components/messages/MessageRequestBanner';
import { useChannels, Channel } from '@/hooks/useChannels';
import { ChannelView } from '@/components/channels/ChannelView';
import { CreateChannelDialog } from '@/components/channels/CreateChannelDialog';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useIsMobile } from '@/hooks/use-mobile';

type MessageTab = 'all' | 'private' | 'groups' | 'channels' | 'requests' | 'archived';

const LOCATION_PREFIX = '\ud83d\udccd LOCATION:';

/** Sana yorlig'i: Bugun / Kecha / 12-mart, dushanba */
function formatDateLabel(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Bugun';
  if (date.toDateString() === yesterday.toDateString()) return 'Kecha';

  try {
    return date.toLocaleDateString('uz-UZ', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
      ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    });
  } catch {
    return date.toLocaleDateString();
  }
}

/** Suhbat nomini aniqlash (papka tanlash oynasi uchun) */
function conversationTitle(conv: Conversation): string {
  if (conv.name) return conv.name;
  const other = conv.other_participant;
  return other?.display_name || other?.username || 'Foydalanuvchi';
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const pendingSharedLocation = useMemo(() => {
    if (searchParams.get('share') !== 'location') return null;
    const latRaw = searchParams.get('lat');
    const lngRaw = searchParams.get('lng');
    if (latRaw == null || lngRaw == null) return null;
    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return null;
    }
    return {
      latitude,
      longitude,
      label: searchParams.get('label') || searchParams.get('name') || 'Joylashuv',
    };
  }, [searchParams]);

  // Interfeys holati
  const [activeTab, setActiveTab] = useState<MessageTab>('all');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [folderFilter, setFolderFilter] = useState<((chat: FolderChat) => boolean) | null>(
    null
  );

  // Xabar holati
  const [replyTo, setReplyTo] = useState<{
    id: string;
    content: string;
    sender_name: string;
  } | null>(null);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [showMemberManagement, setShowMemberManagement] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showCreateChannelDialog, setShowCreateChannelDialog] = useState(false);
  const [showJumpToDate, setShowJumpToDate] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [pendingJumpMessageId, setPendingJumpMessageId] = useState<string | null>(null);

  // Ko'p tanlash rejimi
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());

  // Qo'ng'iroq holati
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video'>('video');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const hasJoinedRoomRef = useRef(false);
  const processedCallLinkRef = useRef<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const lastConvIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unreadIncomingCount, setUnreadIncomingCount] = useState(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const markedReadRef = useRef<Set<string>>(new Set());

  const isArchivedTab = activeTab === 'archived';
  const isSearching = searchQuery.trim().length > 0;

  // Chat ro'yxati bir marta yuklanadi: bo'limlar almashganda qayta so'rov ketmaydi
  const {
    conversations: activeConversations,
    isLoading: activeLoading,
    createPrivateConversation,
    createGroup,
    refresh: refreshActive,
  } = useConversations(undefined, false);

  const {
    conversations: archivedConversations,
    isLoading: archivedLoading,
    refresh: refreshArchived,
  } = useConversations(undefined, true);

  const allConversations = activeConversations;

  const refreshConversations = useCallback(() => {
    void refreshActive();
    void refreshArchived();
  }, [refreshActive, refreshArchived]);

  const conversationsLoading = isArchivedTab ? archivedLoading : activeLoading;

  // Bo'lim filtri mijoz tomonida bajariladi (tez almashish uchun)
  const tabConversations = useMemo<Conversation[]>(() => {
    const source = isArchivedTab ? archivedConversations : activeConversations;
    if (activeTab === 'private') return source.filter((c) => c.type === 'private');
    if (activeTab === 'groups') return source.filter((c) => c.type === 'group');
    if (activeTab === 'channels') return source.filter((c) => c.type === 'channel');
    return source;
  }, [activeTab, isArchivedTab, activeConversations, archivedConversations]);

  const {
    messages,
    isLoading: messagesLoading,
    isLoadingMore: messagesLoadingMore,
    hasMore: hasMoreMessages,
    loadOlder: loadOlderMessages,
    typingUsers,
    sendMessage,
    retryMessage,
    editMessage,
    deleteMessage,
    deleteMessageForMe,
    setTyping,
  } = useMessages(selectedConversation?.id || null);

  const { markAsRead, isMessageRead, getMessageReadAt } = useReadReceipts(
    selectedConversation?.id || null
  );

  const { scheduleMessage, scheduledMessages } = useScheduledMessages(
    selectedConversation?.id || undefined
  );
  const [showScheduledMessages, setShowScheduledMessages] = useState(false);

  const { getOrCreateSelfChat, isCreating: isCreatingSelfChat } = useSelfChat();

  const { createChannel } = useChannels();

  const {
    currentCall,
    callParticipants,
    callEnded,
    createCall,
    joinCall,
    leaveCall: leaveVideoCall,
    resetCallState,
    updateMediaState,
    fetchParticipants,
    subscribeToParticipants,
  } = useVideoCall();

  const { incomingCall, handleCallHandled, declineCall } = useIncomingCalls();

  const {
    localStream,
    participants: webrtcParticipants,
    isConnected,
    isMuted,
    isVideoOn,
    isScreenSharing,
    isHandRaised,
    joinRoom,
    leaveRoom,
    closePeer,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleHandRaise,
  } = useWebRTC(activeCallId);

  const participantsWithProfiles = webrtcParticipants.map((p) => {
    const dbParticipant = callParticipants.find((cp) => cp.user_id === p.id);
    return {
      ...p,
      name:
        dbParticipant?.profile?.display_name ||
        dbParticipant?.profile?.username ||
        "A'zo",
      avatarUrl: dbParticipant?.profile?.avatar_url || undefined,
    };
  });

  // Jonli joylashuv
  const liveLocationSessionRef = useRef<{ messageId: string } | null>(null);
  const liveLocation = useLiveLocation({
    onUpdate: async ({ latitude, longitude }) => {
      const session = liveLocationSessionRef.current;
      if (!session) return;
      await supabase
        .from('messages')
        .update({ media_url: `${latitude},${longitude}` })
        .eq('id', session.messageId);
    },
  });

  // Chuqur havolalar
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId && !selectedConversation) {
      const conv = allConversations.find((c) => c.id === conversationId);
      if (conv) {
        setSelectedConversation(conv);
        setSearchParams({}, { replace: true });
        setShowMobileChat(true);
      } else if (!conversationsLoading) {
        fetchConversationById(conversationId);
      }
    }
  }, [searchParams, allConversations, selectedConversation, conversationsLoading]);

  // Marketplace/profile deep-link: ?user=<profile_id> opens or creates a private chat.
  useEffect(() => {
    const targetUserId = searchParams.get('user');
    if (!targetUserId || !user || targetUserId === user.id) return;

    let cancelled = false;

    void createPrivateConversation(targetUserId).then((conv) => {
      if (cancelled || !conv) return;
      setSelectedChannel(null);
      setSelectedConversation(conv);
      setShowMobileChat(true);

      const next = new URLSearchParams(searchParams);
      next.delete('user');
      setSearchParams(next, { replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [createPrivateConversation, searchParams, setSearchParams, user]);

  const fetchConversationById = async (conversationId: string) => {
    try {
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();

      if (convData) {
        let otherParticipant = null;
        if (convData.type === 'private' && user) {
          const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', user.id)
            .limit(1);

          if (participants && participants.length > 0) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url, is_online, last_seen')
              .eq('id', participants[0].user_id)
              .maybeSingle();
            otherParticipant = profile;
          }
        }

        const fullConv: Conversation = {
          ...convData,
          type: convData.type as 'private' | 'group' | 'channel',
          other_participant: otherParticipant,
          last_message: undefined,
          unread_count: 0,
        };

        setSelectedConversation(fullConv);
        setSearchParams({}, { replace: true });
        setShowMobileChat(true);
        return fullConv;
      }
    } catch (error) {
      console.error('Suhbatni yuklashda xatolik:', error);
    }
    return null;
  };

  const scrollToBottom = useCallback((smooth = false) => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const doScroll = () => {
      el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(() => {
      doScroll();
      requestAnimationFrame(doScroll);
      setTimeout(doScroll, 120);
    });
  }, []);

  useEffect(() => {
    const id = selectedConversation?.id ?? null;
    if (id !== lastConvIdRef.current) {
      lastConvIdRef.current = id;
      isAtBottomRef.current = true;
      setUnreadIncomingCount(0);
      setShowScrollToBottom(false);
      lastMessageIdRef.current = null;
      markedReadRef.current = new Set();
      scrollToBottom(false);
    }
  }, [selectedConversation?.id, scrollToBottom]);

  useEffect(() => {
    if (messages.length === 0) return;
    const newest = messages[messages.length - 1];
    const isNewMessage = newest && newest.id !== lastMessageIdRef.current;
    const prevId = lastMessageIdRef.current;
    lastMessageIdRef.current = newest?.id ?? null;

    if (isAtBottomRef.current) {
      scrollToBottom(false);
    } else if (isNewMessage && prevId && newest.sender_id !== user?.id) {
      setUnreadIncomingCount((c) => c + 1);
    }

    // Faqat hali belgilanmagan xabarlar uchun so'rov yuboriladi
    if (user) {
      const fresh = messages
        .filter((m) => m.sender_id !== user.id && !markedReadRef.current.has(m.id))
        .map((m) => m.id);
      if (fresh.length > 0) {
        for (const id of fresh) markedReadRef.current.add(id);
        markAsRead(fresh);
      }
    }
  }, [messages, markAsRead, user, scrollToBottom]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const handleLoad = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t || (t.tagName !== 'IMG' && t.tagName !== 'VIDEO')) return;
      if (isAtBottomRef.current) scrollToBottom(false);
    };
    el.addEventListener('load', handleLoad, true);
    return () => el.removeEventListener('load', handleLoad, true);
  }, [selectedConversation?.id, scrollToBottom]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 80;
    isAtBottomRef.current = atBottom;
    setShowScrollToBottom(distanceFromBottom > 240);
    if (atBottom) setUnreadIncomingCount(0);

    // Telegramdek: yuqoriga yetganda eski xabarlar sahifasi yuklanadi
    if (el.scrollTop < 160 && hasMoreMessages && !messagesLoadingMore) {
      const prevHeight = el.scrollHeight;
      const prevTop = el.scrollTop;
      void loadOlderMessages().then(() => {
        requestAnimationFrame(() => {
          const next = messagesScrollRef.current;
          if (!next) return;
          next.scrollTop = next.scrollHeight - prevHeight + prevTop;
        });
      });
    }
  }, [hasMoreMessages, messagesLoadingMore, loadOlderMessages]);

  const handleScrollToBottomClick = useCallback(() => {
    isAtBottomRef.current = true;
    setUnreadIncomingCount(0);
    setShowScrollToBottom(false);
    scrollToBottom(true);
  }, [scrollToBottom]);

  // Bo'limlar (o'zbekcha) - papkalar bilan bitta panelda ko'rinadi
  const tabsBase: { id: MessageTab; label: string }[] = [
    { id: 'all', label: 'Barchasi' },
    { id: 'private', label: 'Shaxsiy' },
    { id: 'groups', label: 'Guruhlar' },
    { id: 'channels', label: 'Kanallar' },
    { id: 'requests', label: "So'rovlar" },
    { id: 'archived', label: 'Arxiv' },
  ];

  const tabUnreadCounts = useMemo(() => {
    const counts: Record<MessageTab, number> = {
      all: 0,
      private: 0,
      groups: 0,
      channels: 0,
      requests: 0,
      archived: 0,
    };
    for (const conv of allConversations) {
      const isReq = Boolean((conv as any).is_request);
      const unread = conv.unread_count ?? 0;
      if (conv.is_muted) continue; // Telegram ovozsiz chatlarni umumiy hisobga qo'shmaydi
      if (isReq) {
        counts.requests += unread;
        continue;
      }
      counts.all += unread;
      if (conv.type === 'private') counts.private += unread;
      else if (conv.type === 'group') counts.groups += unread;
      else if (conv.type === 'channel') counts.channels += unread;
    }
    return counts;
  }, [allConversations]);

  const systemTabs = useMemo<SystemTab[]>(
    () => tabsBase.map((tab) => ({ id: tab.id, label: tab.label, count: tabUnreadCounts[tab.id] })),
    [tabUnreadCounts]
  );

  // Papka paneli uchun chatlar
  const folderChats = useMemo<FolderBarChat[]>(
    () =>
      allConversations.map((conv) => ({
        id: conv.id,
        type: conv.type,
        unreadCount: conv.unread_count ?? 0,
        isMuted: Boolean(conv.is_muted),
        isPinned: Boolean(conv.is_pinned),
        name: conversationTitle(conv),
        avatarUrl: conv.avatar_url || conv.other_participant?.avatar_url || undefined,
      })),
    [allConversations]
  );

  const filteredConversations = useMemo(
    () =>
      tabConversations.filter((conv) => {
        const isReq = Boolean((conv as any).is_request);
        if (activeTab === 'requests') {
          if (!isReq) return false;
        } else if (isReq) {
          return false;
        }

        // Papka filtri (arxiv va so'rovlar bo'limiga ta'sir qilmaydi)
        if (folderFilter && activeTab !== 'requests' && activeTab !== 'archived') {
          const matches = folderFilter({
            id: conv.id,
            type: conv.type,
            unreadCount: conv.unread_count ?? 0,
            isMuted: Boolean(conv.is_muted),
            isPinned: Boolean(conv.is_pinned),
          });
          if (!matches) return false;
        }

        return true;
      }),
    [tabConversations, activeTab, folderFilter]
  );

  /** Papkadagi barcha chatlarni ovozsiz qilish */
  const handleMuteFolderChats = async (chatIds: string[]) => {
    if (chatIds.length === 0) {
      toast({ title: 'Barcha chatlar allaqachon ovozsiz' });
      return;
    }
    try {
      await supabase
        .from('conversation_participants')
        .update({ is_muted: true })
        .in('conversation_id', chatIds)
        .eq('user_id', user?.id);

      refreshConversations();
      toast({
        title: 'Sukut qilindi',
        description: `${chatIds.length} ta chat ovozsiz qilindi`,
      });
    } catch {
      toast({
        title: 'Xatolik',
        description: 'Amalni bajarib bo\u2018lmadi',
        variant: 'destructive',
      });
    }
  };

  const handleUnarchiveConversation = async (conversationId: string) => {
    try {
      await supabase
        .from('conversation_participants')
        .update({ is_archived: false })
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id);

      refreshConversations();
      toast({ title: 'Arxivdan chiqarildi', description: 'Suhbat qaytarildi' });
    } catch {
      toast({
        title: 'Xatolik',
        description: 'Arxivdan chiqarib bo\u2018lmadi',
        variant: 'destructive',
      });
    }
  };

  const sendPendingSharedLocation = useCallback(
    async (conversationId: string) => {
      if (!pendingSharedLocation || !user) return;
      const content =
        LOCATION_PREFIX +
        pendingSharedLocation.latitude.toFixed(6) +
        ',' +
        pendingSharedLocation.longitude.toFixed(6) +
        '|' +
        pendingSharedLocation.label;

      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
      });

      if (error) {
        toast({
          title: 'Xatolik',
          description: 'Lokatsiyani chatga yuborib bo\u2018lmadi',
          variant: 'destructive',
        });
        return;
      }

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      const next = new URLSearchParams(searchParams);
      next.delete('share');
      next.delete('lat');
      next.delete('lng');
      next.delete('label');
      next.delete('name');
      setSearchParams(next, { replace: true });
      toast({ title: 'Lokatsiya yuborildi' });
    },
    [pendingSharedLocation, user, searchParams, setSearchParams, toast],
  );

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowMobileChat(true);
    setReplyTo(null);
    isAtBottomRef.current = true;
    if (pendingSharedLocation) void sendPendingSharedLocation(conv.id);
  };

  // Umumiy qidiruvdan chat/xabar tanlash
  const handleGlobalSelectConversation = async (
    conversationId: string,
    messageId?: string
  ) => {
    setSelectedChannel(null);
    const known =
      allConversations.find((c) => c.id === conversationId) ||
      archivedConversations.find((c) => c.id === conversationId);

    if (known) {
      handleSelectConversation(known);
    } else {
      await fetchConversationById(conversationId);
    }

    setSearchQuery('');
    if (messageId) setPendingJumpMessageId(messageId);
  };

  const handleGlobalSelectUser = async (userId: string) => {
    setSelectedChannel(null);
    setSearchQuery('');
    const conv = await createPrivateConversation(userId);
    if (conv) {
      setSelectedConversation(conv);
      setShowMobileChat(true);
    }
  };

  const handleSendMessage = async (content: string, mediaUrl?: string, mediaType?: string) => {
    const sent = await sendMessage(content, mediaUrl, mediaType, replyTo?.id || null);
    if (sent) setReplyTo(null);
    return sent;
  };

  const handleScheduleMessage = async (
    scheduledFor: Date,
    content: string,
    mediaUrl?: string,
    mediaType?: string,
    replyToId?: string | null
  ) => {
    if (!selectedConversation) return null;
    return scheduleMessage(
      selectedConversation.id,
      scheduledFor,
      content,
      mediaUrl,
      mediaType,
      replyToId || null
    );
  };

  // Joylashuv (oddiy va jonli)
  const handleShareLocation = async (location: {
    latitude: number;
    longitude: number;
    address?: string;
    liveDurationSeconds?: number;
  }) => {
    const base = `${LOCATION_PREFIX}${location.latitude},${location.longitude}${
      location.address ? `|${location.address}` : ''
    }`;

    if (!location.liveDurationSeconds || !selectedConversation || !user) {
      await sendMessage(base);
      return;
    }

    // Jonli joylashuv: xabarni yaratamiz va uni davriy yangilaymiz
    const expiresAt = new Date(Date.now() + location.liveDurationSeconds * 1000).toISOString();
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: selectedConversation.id,
        sender_id: user.id,
        content: `${base}|LIVE:${expiresAt}`,
        media_url: `${location.latitude},${location.longitude}`,
        media_type: 'live_location',
      })
      .select('id')
      .maybeSingle();

    if (error || !data) {
      toast({
        title: 'Xatolik',
        description: 'Jonli joylashuvni yuborib bo\u2018lmadi',
        variant: 'destructive',
      });
      return;
    }

    liveLocationSessionRef.current = { messageId: data.id };
    await liveLocation.start({
      messageId: data.id,
      conversationId: selectedConversation.id,
      durationSeconds: location.liveDurationSeconds,
    });
    toast({
      title: 'Jonli joylashuv yoqildi',
      description: 'Joylashuvingiz belgilangan vaqt davomida yangilanadi',
    });
  };

  useEffect(() => {
    if (!liveLocation.isSharing) {
      liveLocationSessionRef.current = null;
    }
  }, [liveLocation.isSharing]);

  const handleReply = (message: Message) => {
    const mediaFallback =
      message.media_type === 'audio'
        ? 'Ovozli xabar'
        : message.media_type === 'video'
          ? 'Video xabar'
          : message.media_type === 'image'
            ? 'Rasm'
            : message.media_type === 'sticker'
              ? 'Stiker'
              : message.media_type === 'gif'
                ? 'GIF'
                : message.media_url
                  ? 'Fayl'
                  : 'Xabar';

    setReplyTo({
      id: message.id,
      content: message.is_deleted ? "Xabar o'chirilgan" : message.content || mediaFallback,
      sender_name:
        message.sender?.display_name || message.sender?.username || 'Foydalanuvchi',
    });
  };

  const handleForward = (message: Message) => {
    setForwardMessages([message]);
  };

  const handleSelectMessage = (messageId: string) => {
    setSelectedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) newSet.delete(messageId);
      else newSet.add(messageId);
      return newSet;
    });
  };

  const handleEnterSelectionMode = (messageId: string) => {
    setIsSelectionMode(true);
    setSelectedMessages(new Set([messageId]));
  };

  const handleExitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedMessages(new Set());
  };

  // Sudrab tanlash
  const dragSelectActive = useRef(false);
  const dragSelectMode = useRef<'add' | 'remove'>('add');
  const dragVisited = useRef<Set<string>>(new Set());
  const dragAnchorId = useRef<string | null>(null);

  const findMessageIdAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const wrap = el?.closest('[data-message-id]') as HTMLElement | null;
    return wrap?.getAttribute('data-message-id') || null;
  };

  const handleMessagesPointerDown = (e: React.PointerEvent) => {
    if (!isSelectionMode) return;
    const id = findMessageIdAt(e.clientX, e.clientY);
    if (!id) return;
    dragAnchorId.current = id;
    dragVisited.current = new Set([id]);
    dragSelectMode.current = selectedMessages.has(id) ? 'remove' : 'add';
    dragSelectActive.current = false;
  };

  const handleMessagesPointerMove = (e: React.PointerEvent) => {
    if (!isSelectionMode || !dragAnchorId.current) return;
    const id = findMessageIdAt(e.clientX, e.clientY);
    if (!id || dragVisited.current.has(id)) return;
    dragSelectActive.current = true;
    dragVisited.current.add(id);
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (dragSelectMode.current === 'add') next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleMessagesPointerUp = () => {
    const wasDrag = dragSelectActive.current;
    dragAnchorId.current = null;
    dragVisited.current = new Set();
    if (wasDrag) {
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener('click', swallow, true);
      };
      window.addEventListener('click', swallow, true);
    }
    setTimeout(() => {
      dragSelectActive.current = false;
    }, 0);
  };

  const handleForwardSelected = () => {
    const selectedMsgs = messages.filter((m) => selectedMessages.has(m.id));
    selectedMsgs.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setForwardMessages(selectedMsgs);
    handleExitSelectionMode();
  };

  const handleDeleteSelected = async () => {
    // Telegramdek: 1:1 chatda ikki tomon ham o'chira oladi
    const isPrivate = selectedConversation?.type === 'private';
    const targets = messages.filter(
      (m) => selectedMessages.has(m.id) && (isPrivate || m.sender_id === user?.id)
    );
    for (const msg of targets) {
      await deleteMessage(msg.id);
    }
    handleExitSelectionMode();
    toast({
      title: "O'chirildi",
      description: `${targets.length} ta xabar o'chirildi`,
    });
  };

  const handleEdit = (message: Message) => setEditingMessage(message);

  const handleEditSave = async (messageId: string, newContent: string) => {
    await editMessage(messageId, newContent);
    setEditingMessage(null);
  };

  const handleDelete = async (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (message) setDeletingMessage(message);
  };

  const handleDeleteConfirm = async (scope: DeleteScope) => {
    if (deletingMessage) {
      if (scope === 'for_everyone') {
        await deleteMessage(deletingMessage.id);
      } else {
        await deleteMessageForMe(deletingMessage.id);
      }
      setDeletingMessage(null);
    }
  };

  const { pinnedMessages, pinMessage, unpinMessage, isMessagePinned } = usePinnedMessages(
    selectedConversation?.id || null
  );

  const handlePin = async (messageId: string) => {
    if (isMessagePinned(messageId)) await unpinMessage(messageId);
    else await pinMessage(messageId);
  };

  const highlightMessage = useCallback((messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
      return true;
    }
    return false;
  }, []);

  // Qidiruvdan tanlangan xabarga o'tish (chat yuklanib bo'lgach)
  useEffect(() => {
    if (!pendingJumpMessageId || messagesLoading || messages.length === 0) return;
    const timer = setTimeout(() => {
      const found = highlightMessage(pendingJumpMessageId);
      if (!found) {
        toast({
          title: 'Xabar topilmadi',
          description: 'Eski xabarlar uchun yuqoriga surib yuklang',
        });
      }
      setPendingJumpMessageId(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [pendingJumpMessageId, messagesLoading, messages, highlightMessage, toast]);

  const handleScrollToPinnedMessage = (messageId: string) => highlightMessage(messageId);

  const handleJumpToMessage = useCallback(
    async (messageId: string) => {
      if (highlightMessage(messageId)) return;

      if (hasMoreMessages && !messagesLoadingMore) {
        await loadOlderMessages();
        requestAnimationFrame(() => {
          if (!highlightMessage(messageId)) {
            setPendingJumpMessageId(messageId);
          }
        });
        return;
      }

      setPendingJumpMessageId(messageId);
    },
    [
      hasMoreMessages,
      highlightMessage,
      loadOlderMessages,
      messagesLoadingMore,
    ]
  );

  const handleArchiveConversation = async (conversationId: string) => {
    try {
      await supabase
        .from('conversation_participants')
        .update({ is_archived: true })
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id);

      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null);
        setShowMobileChat(false);
      }

      refreshConversations();
      toast({ title: 'Arxivlandi', description: 'Suhbat arxivga solindi' });
    } catch {
      toast({
        title: 'Xatolik',
        description: 'Arxivlab bo\u2018lmadi',
        variant: 'destructive',
      });
    }
  };

  const handlePinConversation = async (conversationId: string) => {
    try {
      const { data: participant } = await supabase
        .from('conversation_participants')
        .select('is_pinned')
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id)
        .maybeSingle();

      const newPinnedStatus = !(participant?.is_pinned ?? false);

      // Telegramdek: bir vaqtda 5 tagacha chatni qadash mumkin
      if (newPinnedStatus) {
        const pinnedCount = allConversations.filter((conv) => conv.is_pinned).length;
        if (pinnedCount >= 5) {
          toast({
            title: 'Chegaraga yetdingiz',
            description: 'Eng ko\u2018pi bilan 5 ta chatni qadash mumkin',
            variant: 'destructive',
          });
          return;
        }
      }

      await supabase
        .from('conversation_participants')
        .update({ is_pinned: newPinnedStatus })
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id);

      refreshConversations();
      toast({
        title: newPinnedStatus ? 'Qadaldi' : 'Qadash bekor qilindi',
        description: newPinnedStatus
          ? 'Suhbat yuqoriga qadaldi'
          : 'Suhbat oddiy holatga qaytdi',
      });
    } catch {
      toast({ title: 'Xatolik', description: 'Amalni bajarib bo\u2018lmadi', variant: 'destructive' });
    }
  };

  const handleMuteConversation = async (conversationId: string) => {
    try {
      const { data: participant } = await supabase
        .from('conversation_participants')
        .select('is_muted')
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id)
        .maybeSingle();

      const newMutedStatus = !(participant?.is_muted ?? false);

      await supabase
        .from('conversation_participants')
        .update({ is_muted: newMutedStatus })
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id);

      refreshConversations();
      toast({
        title: newMutedStatus ? 'Ovozsiz qilindi' : 'Ovoz yoqildi',
        description: newMutedStatus
          ? 'Bildirishnomalar o\u2018chirildi'
          : 'Bildirishnomalar yoqildi',
      });
    } catch {
      toast({ title: 'Xatolik', description: 'Amalni bajarib bo\u2018lmadi', variant: 'destructive' });
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      await supabase
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id);

      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null);
        setShowMobileChat(false);
      }

      refreshConversations();
      toast({ title: "O'chirildi", description: 'Suhbat o\u2018chirildi' });
    } catch {
      toast({ title: 'Xatolik', description: 'O\u2018chirib bo\u2018lmadi', variant: 'destructive' });
    }
  };

  const handleMarkRead = async (conversationId: string) => {
    try {
      const { data: unreadMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .neq('sender_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (unreadMessages && unreadMessages.length > 0) {
        const readReceipts = unreadMessages.map((m) => ({
          message_id: m.id,
          user_id: user?.id,
        }));

        await supabase
          .from('message_reads')
          .upsert(readReceipts, { onConflict: 'message_id,user_id' });
      }

      refreshConversations();
      toast({ title: "O'qilgan deb belgilandi" });
    } catch {
      toast({ title: 'Xatolik', description: 'Amalni bajarib bo\u2018lmadi', variant: 'destructive' });
    }
  };

  const handleMarkUnread = async (conversationId: string) => {
    try {
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .neq('sender_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentMessages && recentMessages.length > 0) {
        await supabase
          .from('message_reads')
          .delete()
          .eq('user_id', user?.id)
          .in(
            'message_id',
            recentMessages.map((m) => m.id)
          );
      }

      refreshConversations();
      toast({ title: "O'qilmagan deb belgilandi" });
    } catch {
      toast({ title: 'Xatolik', description: 'Amalni bajarib bo\u2018lmadi', variant: 'destructive' });
    }
  };

  const startCall = async (type: 'audio' | 'video') => {
    if (!selectedConversation) {
      toast({ title: 'Xatolik', description: 'Suhbat tanlanmagan', variant: 'destructive' });
      return;
    }

    setCallType(type);

    const callId = await createCall(selectedConversation.id, type);
    if (callId) {
      handleCallHandled(callId);
      setActiveCallId(callId);
      setIsInCall(true);
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) return;

    const success = await joinCall(incomingCall.id, incomingCall.call_type === 'video');
    if (success) {
      handleCallHandled(incomingCall.id);
      setCallType(incomingCall.call_type);
      setActiveCallId(incomingCall.id);
      setIsInCall(true);
    } else {
      toast({
        title: 'Xatolik',
        description: "Qo'ng'iroqqa qo'shilib bo\u2018lmadi",
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    const callId = searchParams.get('call');
    const requestedType = searchParams.get('type');
    if (!callId || processedCallLinkRef.current === callId || isInCall) return;

    processedCallLinkRef.current = callId;
    let cancelled = false;

    const openLinkedCall = async () => {
      const { data: call, error } = await supabase
        .from('video_calls')
        .select('id, conversation_id, call_type, status, ended_at')
        .eq('id', callId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !call || call.status === 'ended' || call.ended_at) {
        processedCallLinkRef.current = null;
        setSearchParams({}, { replace: true });
        toast({
          title: "Qo'ng'iroq tugagan",
          description: "Bu qo'ng'iroq endi mavjud emas",
          variant: 'destructive',
        });
        return;
      }

      const linkedType: 'audio' | 'video' =
        call.call_type === 'audio' || requestedType === 'audio' ? 'audio' : 'video';
      const joined = await joinCall(callId, linkedType === 'video');
      if (cancelled) return;

      if (!joined) {
        processedCallLinkRef.current = null;
        setSearchParams({}, { replace: true });
        return;
      }

      if (call.conversation_id && selectedConversation?.id !== call.conversation_id) {
        const knownConversation = allConversations.find(
          (item) => item.id === call.conversation_id
        );
        if (knownConversation) {
          setSelectedConversation(knownConversation);
          setShowMobileChat(true);
        } else {
          await fetchConversationById(call.conversation_id);
        }
      }

      handleCallHandled(callId);
      setCallType(linkedType);
      setActiveCallId(callId);
      setIsInCall(true);
      setSearchParams({}, { replace: true });
    };

    void openLinkedCall();
    return () => {
      cancelled = true;
    };
  }, [
    searchParams,
    isInCall,
    joinCall,
    allConversations,
    selectedConversation?.id,
    handleCallHandled,
    setSearchParams,
    toast,
  ]);

  const endCall = useCallback(async () => {
    const duration = currentCall?.started_at
      ? Math.floor((Date.now() - new Date(currentCall.started_at).getTime()) / 1000)
      : 0;

    const conversationForHistory = selectedConversation;
    const callForHistory = currentCall;

    leaveRoom();
    const callFullyEnded = await leaveVideoCall();

    if (callFullyEnded && conversationForHistory && callForHistory) {
      const callHistoryData = {
        type: callType,
        status: 'ended' as const,
        duration: duration > 0 ? duration : undefined,
        timestamp: new Date().toISOString(),
        caller_id: callForHistory.host_id,
        callee_id: user?.id || '',
      };

      await supabase.from('messages').insert({
        conversation_id: conversationForHistory.id,
        sender_id: user?.id,
        content: JSON.stringify(callHistoryData),
        media_type: 'call_history',
      });
    }

    setIsInCall(false);
    setActiveCallId(null);
    hasJoinedRoomRef.current = false;
    resetCallState();
  }, [
    currentCall,
    selectedConversation,
    callType,
    user?.id,
    leaveRoom,
    leaveVideoCall,
    resetCallState,
  ]);

  useEffect(() => {
    if (!isInCall || !currentCall) return;

    fetchParticipants();

    const unsubscribe = subscribeToParticipants((leftUserId) => {
      closePeer(leftUserId);
    });

    return () => {
      unsubscribe();
    };
  }, [isInCall, currentCall, fetchParticipants, subscribeToParticipants]);

  useEffect(() => {
    if (isInCall && currentCall) {
      updateMediaState(isMuted, isVideoOn, isScreenSharing, isHandRaised);
    }
  }, [isMuted, isVideoOn, isScreenSharing, isHandRaised, isInCall, currentCall, updateMediaState]);

  useEffect(() => {
    if (!activeCallId || !isInCall) return;
    if (hasJoinedRoomRef.current) return;

    hasJoinedRoomRef.current = true;
    void joinRoom(callType === 'video');
  }, [activeCallId, isInCall, callType, joinRoom]);

  useEffect(() => {
    if (callEnded && isInCall) {
      leaveRoom();
      setIsInCall(false);
      setActiveCallId(null);
      hasJoinedRoomRef.current = false;
      resetCallState();
    }
  }, [callEnded, isInCall, leaveRoom, resetCallState]);

  const handleCreatePrivate = async (userId: string) => {
    const conv = await createPrivateConversation(userId);
    if (conv) {
      setSelectedConversation(conv);
      setShowMobileChat(true);
    }
    return conv;
  };

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    const conv = await createGroup(name, memberIds);
    if (conv) setActiveTab('groups');
    return conv;
  };

  const handleOpenSelfChat = async () => {
    const selfConv = await getOrCreateSelfChat();
    if (selfConv) {
      setSelectedConversation(selfConv);
      setShowMobileChat(true);
      setActiveTab('private');
    }
  };

  // Xabarlarni sanaga ko'ra guruhlash
  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';

    const activeMessages = msgs.filter((msg) => !msg.is_deleted);

    activeMessages.forEach((msg) => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  };

  const messageGroups = useMemo(() => groupMessagesByDate(messages), [messages]);

  // Kun tanlash oynasi uchun mavjud sanalar
  const availableDates = useMemo(
    () => messageGroups.map((g) => new Date(g.date).toISOString()),
    [messageGroups]
  );

  const handleJumpToDate = useCallback(
    (date: Date) => {
      const target = date.toDateString();
      const group = messageGroups.find((g) => g.date === target);
      setShowJumpToDate(false);
      if (!group || group.messages.length === 0) {
        toast({ title: 'Bu kunda xabar yo\u2018q' });
        return;
      }
      const firstId = group.messages[0].id;
      setTimeout(() => highlightMessage(firstId), 60);
    },
    [messageGroups, highlightMessage, toast]
  );

  // 1:1 chatda suhbatdoshning avatar ikonkasi ko'rsatilmaydi (Telegramdek)
  const showBubbleAvatars = selectedConversation?.type !== 'private';

  type FlatItem =
    | { kind: 'date'; key: string; date: string }
    | {
        kind: 'message';
        key: string;
        message: Message;
        showAvatar: boolean;
        isMine: boolean;
      };
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    for (const group of messageGroups) {
      items.push({ kind: 'date', key: `date-${group.date}`, date: group.date });
      group.messages.forEach((message, idx) => {
        const prev = group.messages[idx - 1];
        const showAvatar = !prev || prev.sender_id !== message.sender_id;
        items.push({
          kind: 'message',
          key: message.id,
          message,
          showAvatar,
          isMine: message.sender_id === user?.id,
        });
      });
    }
    return items;
  }, [messageGroups, user?.id]);

  const VIRTUALIZE_THRESHOLD = 80;
  const useVirtualization = flatItems.length > VIRTUALIZE_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => messagesScrollRef.current,
    estimateSize: (index) => (flatItems[index]?.kind === 'date' ? 44 : 72),
    overscan: 8,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 72,
    getItemKey: (index) => flatItems[index]?.key ?? index,
  });

  const mediaTracksForPlaylist = useMemo(() => {
    return messages
      .filter(
        (msg) => !msg.is_deleted && msg.media_url && msg.media_type === 'audio'
      )
      .map((msg) => ({
        id: msg.id,
        url: msg.media_url!,
        name: 'Ovozli xabar',
        artist: msg.sender?.display_name || msg.sender?.username || 'Foydalanuvchi',
        title: 'Ovozli xabar',
        senderName: msg.sender?.display_name || msg.sender?.username,
        type: 'audio' as const,
      }));
  }, [messages]);

  // Chatni surib yopish
  const isMobile = useIsMobile();
  const [chatSwipeOffset, setChatSwipeOffset] = useState(0);
  const [isChatSwiping, setIsChatSwiping] = useState(false);
  const chatSwipeStartX = useRef(0);
  const chatSwipeStartY = useRef(0);
  const chatSwipeAxis = useRef<'unknown' | 'horizontal' | 'vertical'>('unknown');
  const chatSwipeThreshold = 100;

  const handleChatSwipeStart = useCallback((e: React.TouchEvent) => {
    chatSwipeStartX.current = e.touches[0].clientX;
    chatSwipeStartY.current = e.touches[0].clientY;
    chatSwipeAxis.current = 'unknown';
    setIsChatSwiping(true);
  }, []);

  const handleChatSwipeMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isChatSwiping) return;
      const dx = e.touches[0].clientX - chatSwipeStartX.current;
      const dy = e.touches[0].clientY - chatSwipeStartY.current;

      if (chatSwipeAxis.current === 'unknown') {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        chatSwipeAxis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      if (chatSwipeAxis.current !== 'horizontal') return;

      // Faqat chap chetdan boshlangan surish chatni yopadi (Telegramdek)
      if (chatSwipeStartX.current > 60) return;
      if (dx > 0) setChatSwipeOffset(Math.min(dx, 200));
    },
    [isChatSwiping]
  );

  const handleChatSwipeEnd = useCallback(() => {
    if (chatSwipeOffset >= chatSwipeThreshold) {
      setShowMobileChat(false);
      setSelectedConversation(null);
    }
    setChatSwipeOffset(0);
    setIsChatSwiping(false);
    chatSwipeAxis.current = 'unknown';
  }, [chatSwipeOffset]);

  // Ixcham chat ro'yxati
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const leftPanelHandleRef = useRef<any>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(320);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHint, setResizeHint] = useState<'compact' | 'expanded' | null>(null);

  const COMPACT_PX = 72;
  const SNAP_THRESHOLD_PX = 220;

  const deviceClass = useMemo(() => {
    if (typeof window === 'undefined') return 'desktop';
    const w = window.innerWidth;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    if (w < 1440) return 'desktop';
    return 'wide';
  }, []);
  const defaults = useMemo(() => {
    switch (deviceClass) {
      case 'tablet':
        return { defaultPct: 38, minPct: 6, maxPct: 55, expandedPct: 38 };
      case 'desktop':
        return { defaultPct: 32, minPct: 4, maxPct: 50, expandedPct: 32 };
      case 'wide':
        return { defaultPct: 26, minPct: 3, maxPct: 45, expandedPct: 26 };
      default:
        return { defaultPct: 100, minPct: 100, maxPct: 100, expandedPct: 100 };
    }
  }, [deviceClass]);
  const STORAGE_KEY = `messages.chatlist.width.${deviceClass}`;
  const initialPct = useMemo(() => {
    if (typeof window === 'undefined') return defaults.defaultPct;
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0 && saved <= defaults.maxPct + 1) return saved;
    return defaults.defaultPct;
  }, [STORAGE_KEY, defaults]);

  useEffect(() => {
    const el = leftPanelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setLeftPanelWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const latestSizeRef = useRef<number>(initialPct);
  const saveTimerRef = useRef<number | null>(null);
  const handlePanelResize = (size: number) => {
    latestSizeRef.current = size;
    const groupEl = leftPanelRef.current?.closest('[data-panel-group]') as HTMLElement | null;
    const groupWidth = groupEl?.getBoundingClientRect().width || window.innerWidth;
    const px = (size / 100) * groupWidth;
    if (isResizing) setResizeHint(px < SNAP_THRESHOLD_PX ? 'compact' : 'expanded');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(size));
      } catch {}
    }, 250);
  };
  const handleDragging = (isDragging: boolean) => {
    setIsResizing(isDragging);
    if (isDragging) return;
    setResizeHint(null);
    const size = latestSizeRef.current;
    const groupEl = leftPanelRef.current?.closest('[data-panel-group]') as HTMLElement | null;
    const groupWidth = groupEl?.getBoundingClientRect().width || window.innerWidth;
    const px = (size / 100) * groupWidth;
    const handle = leftPanelHandleRef.current;
    if (!handle) return;
    const compactPct = Math.max(defaults.minPct, (COMPACT_PX / groupWidth) * 100);
    const minExpandedPct = (SNAP_THRESHOLD_PX / groupWidth) * 100;
    if (px < SNAP_THRESHOLD_PX) {
      if (Math.abs(size - compactPct) > 0.5) handle.resize(compactPct);
    } else if (px < SNAP_THRESHOLD_PX + 30) {
      handle.resize(Math.max(defaults.expandedPct, minExpandedPct));
    }
  };

  const isCompactList = !isMobile && leftPanelWidth > 0 && leftPanelWidth < 140;

  const renderDatePill = (date: string, className?: string) => (
    <div className={cn('flex items-center justify-center', className)}>
      <button
        type="button"
        onClick={() => setShowJumpToDate(true)}
        className="tg-transition rounded-full bg-muted/90 px-3 py-1 text-xs text-muted-foreground backdrop-blur hover:bg-muted active:scale-95"
        title="Kun tanlash"
      >
        {formatDateLabel(date)}
      </button>
    </div>
  );

  // Chap panel
  const leftPanelContent = (
    <div
      ref={leftPanelRef}
      className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-card"
    >
      {isCompactList ? (
        <div className="flex flex-shrink-0 flex-col items-center gap-2 border-b border-border p-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-full"
            onClick={handleOpenSelfChat}
            disabled={isCreatingSelfChat}
            title="Saqlangan xabarlar"
          >
            <Bookmark className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={() =>
              activeTab === 'channels'
                ? setShowCreateChannelDialog(true)
                : setShowCreateDialog(true)
            }
            title="Yangi suhbat"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      ) : (
        <>
          {/* Qidiruv va yaratish */}
          <div className="flex-shrink-0 space-y-3 border-b border-border p-3 sm:p-4 md:p-3">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground md:h-4 md:w-4" />
                <Input
                  placeholder="Qidirish"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 bg-muted/50 pl-11 pr-10 text-base sm:h-12 md:h-10 md:pl-10 md:text-sm"
                />
                {isSearching && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Qidiruvni tozalash"
                    className="tg-transition absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="h-11 w-11 shrink-0 border-border bg-muted hover:bg-accent sm:h-12 sm:w-12 md:h-10 md:w-10"
                onClick={handleOpenSelfChat}
                disabled={isCreatingSelfChat}
                title="Saqlangan xabarlar"
              >
                <Bookmark className="h-5 w-5 text-foreground md:h-4 md:w-4" />
              </Button>
              <Button
                size="icon"
                className="h-11 w-11 shrink-0 sm:h-12 sm:w-12 md:h-10 md:w-10"
                onClick={() => {
                  if (activeTab === 'channels') setShowCreateChannelDialog(true);
                  else if (activeTab === 'groups') setShowGroupDialog(true);
                  else setShowCreateDialog(true);
                }}
                title="Yangi"
              >
                <Plus className="h-6 w-6 md:h-5 md:w-5" />
              </Button>
            </div>
          </div>

          {/* YAKKA varaq paneli: bo'limlar + papkalar (qidiruv paytida yashiriladi) */}
          {!isSearching && (
            <div className="flex-shrink-0 border-b border-border">
              <ChatFolderBar
                chats={folderChats}
                systemTabs={systemTabs}
                activeSystemTabId={activeTab}
                onSelectSystemTab={(id) => setActiveTab(id as MessageTab)}
                onFilterChange={(predicate) => setFolderFilter(() => predicate)}
                onMuteChats={handleMuteFolderChats}
              />
            </div>
          )}
        </>
      )}

      {pendingSharedLocation && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-primary/5 px-3 py-2">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">Lokatsiyani yuborish</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {pendingSharedLocation.label} — chatni tanlang
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('share');
              next.delete('lat');
              next.delete('lng');
              next.delete('label');
              next.delete('name');
              setSearchParams(next, { replace: true });
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Ulashishni bekor qilish"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Natijalar / suhbatlar - guruh, kanal va shaxsiy chatlar bitta ko'rinishda */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!w-full [&_[data-radix-scroll-area-viewport]>div]:!min-w-0">
        {isSearching ? (
          <GlobalSearchResults
            query={searchQuery}
            conversations={allConversations}
            onSelectConversation={handleGlobalSelectConversation}
            onSelectUser={handleGlobalSelectUser}
          />
        ) : conversationsLoading && filteredConversations.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center px-6 text-center text-muted-foreground">
            {activeTab === 'requests' ? (
              <>
                <Inbox className="mb-3 h-10 w-10 opacity-50" />
                <p className="text-sm">So'rovlar yo'q</p>
              </>
            ) : activeTab === 'archived' ? (
              <>
                <Archive className="mb-3 h-10 w-10 opacity-50" />
                <p className="text-sm">Arxivda hech nima yo'q</p>
              </>
            ) : activeTab === 'channels' ? (
              <>
                <Megaphone className="mb-3 h-10 w-10 opacity-50" />
                <p className="text-sm">Kanallar yo'q</p>
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={() => setShowCreateChannelDialog(true)}
                >
                  Kanal yaratish
                </Button>
              </>
            ) : (
              <>
                <MessageCircle className="mb-3 h-10 w-10 opacity-50" />
                <p className="text-sm">Bu papkada suhbat yo'q</p>
                <Button variant="link" className="mt-2" onClick={() => setShowCreateDialog(true)}>
                  Yangi suhbat boshlash
                </Button>
              </>
            )}
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <ChatListItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedConversation?.id === conv.id}
              isPinned={conv.is_pinned}
              isMuted={conv.is_muted}
              isArchived={isArchivedTab}
              compact={isCompactList}
              onClick={() => {
                handleSelectConversation(conv);
                setSelectedChannel(null);
              }}
              onArchive={() => handleArchiveConversation(conv.id)}
              onUnarchive={() => handleUnarchiveConversation(conv.id)}
              onPin={() => handlePinConversation(conv.id)}
              onMute={() => handleMuteConversation(conv.id)}
              onDelete={() => handleDeleteConversation(conv.id)}
              onMarkRead={() => handleMarkRead(conv.id)}
              onMarkUnread={() => handleMarkUnread(conv.id)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );

  // O'ng panel
  const rightPanelContent = (
    <div
      className="chat-shell flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
      style={{
        transform: isMobile ? `translateX(${chatSwipeOffset}px)` : undefined,
        transition:
          isMobile && !isChatSwiping ? 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
      }}
      onTouchStart={isMobile ? handleChatSwipeStart : undefined}
      onTouchMove={isMobile ? handleChatSwipeMove : undefined}
      onTouchEnd={isMobile ? handleChatSwipeEnd : undefined}
      onTouchCancel={isMobile ? handleChatSwipeEnd : undefined}
    >
      {selectedChannel ? (
        <ChannelView
          channel={selectedChannel}
          onBack={() => {
            setSelectedChannel(null);
            setShowMobileChat(false);
          }}
        />
      ) : selectedConversation ? (
        <>
          {isSelectionMode ? (
            <div className="z-20 flex-shrink-0 animate-in border-b border-border bg-card/90 backdrop-blur-xl duration-200 slide-in-from-top">
              <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3 md:p-4">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleExitSelectionMode}
                    className="h-9 w-9 shrink-0 rounded-full"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                  <span className="truncate text-sm font-semibold sm:text-base">
                    {selectedMessages.size > 0
                      ? `${selectedMessages.size} ta tanlandi`
                      : 'Xabarlarni tanlang'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleForwardSelected}
                    disabled={selectedMessages.size === 0}
                    className="h-9 w-9 rounded-full"
                  >
                    <Forward className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDeleteSelected}
                    disabled={selectedMessages.size === 0}
                    className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="z-20 flex-shrink-0 bg-card">
                <ChatHeader
                  conversation={selectedConversation}
                  typingUsers={typingUsers}
                  onBack={() => setShowMobileChat(false)}
                  onAudioCall={() => startCall('audio')}
                  onVideoCall={() => startCall('video')}
                  onSearch={() => setShowMessageSearch(true)}
                  onViewInfo={() => {}}
                  onManageMembers={
                    selectedConversation.type === 'group'
                      ? () => setShowMemberManagement(true)
                      : undefined
                  }
                  onViewScheduled={() => setShowScheduledMessages(true)}
                  scheduledCount={scheduledMessages.length}
                  isAdmin={selectedConversation.owner_id === user?.id}
                />
              </div>
              <MiniAudioPlayer />
            </>
          )}

          {showMessageSearch && !isSelectionMode && (
            <MessageSearch
              messages={messages}
              onHighlightMessage={(id) => highlightMessage(id)}
              onClose={() => setShowMessageSearch(false)}
            />
          )}

          {(selectedConversation as any).is_request && (
            <MessageRequestBanner
              conversationId={selectedConversation.id}
              otherUserId={selectedConversation.other_participant?.id}
              otherUserName={
                selectedConversation.other_participant?.display_name ||
                selectedConversation.other_participant?.username ||
                undefined
              }
              onResolved={() => {
                refreshConversations();
                setSelectedConversation(null);
                setShowMobileChat(false);
              }}
            />
          )}

          {pinnedMessages.length > 0 && !isSelectionMode && (
            <PinnedMessagesBar
              pinnedMessages={pinnedMessages}
              onUnpin={unpinMessage}
              onScrollToMessage={handleScrollToPinnedMessage}
            />
          )}

          <div className="relative min-h-0 flex-1">
            <div
              ref={messagesScrollRef}
              onScroll={handleMessagesScroll}
              className="scrollbar-custom absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-muted/20"
              style={isSelectionMode ? { touchAction: 'pan-y' } : undefined}
              onPointerDown={handleMessagesPointerDown}
              onPointerMove={handleMessagesPointerMove}
              onPointerUp={handleMessagesPointerUp}
              onPointerCancel={handleMessagesPointerUp}
            >
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
                  <MessageCircle className="mb-4 h-16 w-16 opacity-30" />
                  <p className="mb-1 text-lg font-medium">Hozircha xabar yo'q</p>
                  <p className="text-sm">Suhbatni boshlang!</p>
                </div>
              ) : useVirtualization ? (
                <>
                  {messagesLoadingMore && (
                    <div className="flex justify-center py-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
                    </div>
                  )}
                  <div
                    className="relative min-w-0 max-w-full px-2 pb-2 pt-4 sm:px-4"
                    style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const item = flatItems[virtualRow.index];
                      if (!item) return null;
                      return (
                        <div
                          key={virtualRow.key}
                          data-index={virtualRow.index}
                          ref={rowVirtualizer.measureElement}
                          className="absolute left-0 right-0 min-w-0 px-2 sm:px-4"
                          style={{ transform: `translateY(${virtualRow.start}px)` }}
                        >
                          {item.kind === 'date' ? (
                            renderDatePill(item.date, 'my-3')
                          ) : (
                            (() => {
                              const message = item.message;
                              const senderId = message.sender_id || '';
                              const readByOther =
                                item.isMine && senderId
                                  ? isMessageRead(message.id, senderId)
                                  : false;
                              const readAt =
                                item.isMine && senderId
                                  ? getMessageReadAt(message.id, senderId)
                                  : null;
                              return (
                                <div
                                  id={`message-${message.id}`}
                                  data-message-id={message.id}
                                  className={cn(
                                    'min-w-0 py-1',
                                    highlightedMessageId === message.id &&
                                      'animate-pulse rounded-lg bg-primary/10'
                                  )}
                                >
                                  <EnhancedMessageBubble
                                    message={{
                                      ...message,
                                      is_read: readByOther,
                                      status: readByOther ? 'read' : message.status,
                                      read_at: readAt || undefined,
                                    }}
                                    isMine={item.isMine}
                                    isGroup={selectedConversation.type === 'group'}
                                    canDeleteForEveryone={
                                      selectedConversation.type === 'private' ||
                                      selectedConversation.owner_id === user?.id
                                    }
                                    onReply={handleReply}
                                    onForward={handleForward}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                    onPin={handlePin}
                                    onSelect={handleSelectMessage}
                                    onLongPress={handleEnterSelectionMode}
                                onJumpToMessage={handleJumpToMessage}
                                onRetry={(failedMessage) => {
                                      void retryMessage(failedMessage.tempId || failedMessage.id);
                                    }}
                                    isPinned={isMessagePinned(message.id)}
                                    isSelected={selectedMessages.has(message.id)}
                                    isSelectionMode={isSelectionMode}
                                    showAvatar={showBubbleAvatars && item.showAvatar}
                                    showSender={
                                      selectedConversation.type === 'group' && item.showAvatar
                                    }
                                    allMediaTracks={mediaTracksForPlaylist}
                                  />
                                </div>
                              );
                            })()
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="min-w-0 max-w-full space-y-4 p-2 sm:p-4">
                  {messagesLoadingMore && (
                    <div className="flex justify-center py-1">
                      <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
                    </div>
                  )}
                  {messageGroups.map((group) => (
                    <div key={group.date} className="min-w-0">
                      {renderDatePill(group.date, 'my-4')}
                      <div className="min-w-0 space-y-2">
                        {group.messages.map((message, idx) => {
                          const prevMessage = group.messages[idx - 1];
                          const showAvatar =
                            !prevMessage || prevMessage.sender_id !== message.sender_id;
                          const isMine = message.sender_id === user?.id;
                          const senderId = message.sender_id || '';
                          const readByOther =
                            isMine && senderId ? isMessageRead(message.id, senderId) : false;
                          const readAt =
                            isMine && senderId ? getMessageReadAt(message.id, senderId) : null;
                          return (
                            <div
                              key={message.id}
                              id={`message-${message.id}`}
                              data-message-id={message.id}
                              className={cn(
                                'min-w-0',
                                highlightedMessageId === message.id &&
                                  'animate-pulse rounded-lg bg-primary/10'
                              )}
                            >
                              <EnhancedMessageBubble
                                message={{
                                  ...message,
                                  is_read: readByOther,
                                  status: readByOther ? 'read' : message.status,
                                  read_at: readAt || undefined,
                                }}
                                isMine={isMine}
                                isGroup={selectedConversation.type === 'group'}
                                canDeleteForEveryone={
                                  selectedConversation.type === 'private' ||
                                  selectedConversation.owner_id === user?.id
                                }
                                onReply={handleReply}
                                onForward={handleForward}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onPin={handlePin}
                                onSelect={handleSelectMessage}
                                onLongPress={handleEnterSelectionMode}
                                    onJumpToMessage={handleJumpToMessage}
                                    onRetry={(failedMessage) => {
                                      void retryMessage(failedMessage.tempId || failedMessage.id);
                                    }}
                                isPinned={isMessagePinned(message.id)}
                                isSelected={selectedMessages.has(message.id)}
                                isSelectionMode={isSelectionMode}
                                showAvatar={showBubbleAvatars && showAvatar}
                                showSender={
                                  selectedConversation.type === 'group' && showAvatar
                                }
                                allMediaTracks={mediaTracksForPlaylist}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {typingUsers.length > 0 && <TypingIndicator userNames={typingUsers} />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Pastga o'tish tugmasi */}
            {showScrollToBottom && (
              <button
                type="button"
                onClick={handleScrollToBottomClick}
                aria-label="Eng oxirgi xabarga o'tish"
                className="tg-transition absolute bottom-4 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-accent active:scale-95 sm:right-4"
              >
                <ArrowDown className="h-5 w-5" />
                {unreadIncomingCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                    {unreadIncomingCount > 99 ? '99+' : unreadIncomingCount}
                  </span>
                )}
              </button>
            )}

            {/* Jonli joylashuv paneli */}
            {liveLocation.isSharing && (
              <div className="absolute bottom-4 left-3 z-20 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 shadow-lg backdrop-blur sm:left-4">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                <span className="text-xs font-medium">Jonli joylashuv yoqilgan</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 rounded-full px-2 text-xs text-destructive"
                  onClick={() => liveLocation.stop()}
                >
                  To'xtatish
                </Button>
              </div>
            )}
          </div>

          <div className="pb-safe mb-16 flex-shrink-0 border-t border-border bg-card md:mb-0">
            <MessageInput
              conversationId={selectedConversation.id}
              onSend={handleSendMessage}
              onSchedule={handleScheduleMessage}
              onTyping={setTyping}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onShareLocation={handleShareLocation}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">Suhbatni tanlang</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Yozishni boshlash uchun chatni tanlang
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Yangi suhbat
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background md:h-screen">
      {/* Qo'ng'iroq oynasi */}
      {isInCall && (
        <VideoCallOverlay
          localStream={localStream}
          participants={participantsWithProfiles}
          isMuted={isMuted}
          isVideoOn={isVideoOn}
          isScreenSharing={isScreenSharing}
          isHandRaised={isHandRaised}
          callType={callType}
          callStartedAt={currentCall?.started_at ?? null}
          isCallConnected={isConnected}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onToggleHandRaise={toggleHandRaise}
          onEndCall={endCall}
          currentUserName={user?.email?.split('@')[0]}
        />
      )}

      {/* Kiruvchi qo'ng'iroq */}
      <IncomingCallDialog
        isOpen={!!incomingCall && !isInCall}
        callerName={
          incomingCall?.host_profile?.display_name ||
          incomingCall?.host_profile?.username ||
          'Foydalanuvchi'
        }
        callerAvatar={incomingCall?.host_profile?.avatar_url || undefined}
        callType={incomingCall?.call_type || 'video'}
        onAccept={acceptIncomingCall}
        onDecline={declineCall}
      />

      {/* Mobil ko'rinish */}
      {isMobile ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className={cn(
              'flex h-[calc(100dvh-3.5rem)] flex-1 flex-col pb-16',
              showMobileChat && 'hidden'
            )}
          >
            {leftPanelContent}
          </div>
          <div
            className={cn(
              'fixed inset-0 z-10 flex h-[100dvh] flex-col',
              !showMobileChat && 'hidden'
            )}
          >
            {rightPanelContent}
          </div>
        </div>
      ) : (
        <ResizablePanelGroup
          direction="horizontal"
          className="flex-1 overflow-hidden"
          autoSaveId={`messages-layout-${deviceClass}`}
        >
          <ResizablePanel
            ref={leftPanelHandleRef}
            defaultSize={initialPct}
            minSize={defaults.minPct}
            maxSize={defaults.maxPct}
            onResize={handlePanelResize}
            className="min-w-0 overflow-hidden border-r border-border transition-[flex-basis] duration-150 ease-out"
          >
            {leftPanelContent}
          </ResizablePanel>
          <ResizableHandle
            onDragging={handleDragging}
            className={cn(
              'group/handle relative z-20 w-px bg-border',
              "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 after:content-['']",
              'hover:bg-primary/30 data-[resize-handle-active]:bg-primary',
              'transition-colors'
            )}
          >
            {isResizing && (
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary/60" />
            )}
            {isResizing && resizeHint && (
              <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md">
                {resizeHint === 'compact'
                  ? 'Ixcham (faqat ikonkalar)'
                  : `${Math.round(leftPanelWidth)}px`}
              </div>
            )}
          </ResizableHandle>
          <ResizablePanel
            defaultSize={100 - initialPct}
            minSize={40}
            className="min-w-0 overflow-hidden"
          >
            {rightPanelContent}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {/* Oynalar */}
      <CreateChatDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreatePrivate={handleCreatePrivate}
        onCreateGroup={handleCreateGroup}
      />
      <CreateGroupChannelDialog
        open={showGroupDialog}
        onOpenChange={setShowGroupDialog}
        onCreated={() => {
          setShowGroupDialog(false);
          setActiveTab('groups');
          refreshConversations();
        }}
      />
      <TelegramForwardDialog
        messages={forwardMessages}
        open={forwardMessages.length > 0}
        onOpenChange={(open) => !open && setForwardMessages([])}
      />
      <EditMessageDialog
        message={editingMessage}
        open={!!editingMessage}
        onOpenChange={(open) => !open && setEditingMessage(null)}
        onSave={handleEditSave}
      />
      <DeleteMessageDialog
        open={!!deletingMessage}
        onOpenChange={(open) => !open && setDeletingMessage(null)}
        onConfirm={handleDeleteConfirm}
        messagePreview={deletingMessage?.content || undefined}
        isMine={deletingMessage?.sender_id === user?.id}
      />
      <JumpToDateDialog
        open={showJumpToDate}
        onOpenChange={setShowJumpToDate}
        availableDates={availableDates}
        onSelectDate={handleJumpToDate}
      />
      {selectedConversation && selectedConversation.type === 'group' && (
        <GroupMemberManagement
          open={showMemberManagement}
          onOpenChange={setShowMemberManagement}
          conversationId={selectedConversation.id}
          conversationName={selectedConversation.name || undefined}
          isAdmin={selectedConversation.owner_id === user?.id}
        />
      )}
      <ScheduledMessagesSheet
        open={showScheduledMessages}
        onOpenChange={setShowScheduledMessages}
        conversationId={selectedConversation?.id}
      />
      <CreateChannelDialog
        open={showCreateChannelDialog}
        onOpenChange={setShowCreateChannelDialog}
        onCreateChannel={createChannel}
      />
    </div>
  );
}
