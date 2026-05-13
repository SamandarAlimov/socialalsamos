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
  CheckSquare,
  Bookmark,
  Megaphone,
  ArrowDown,
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
import { useToast } from '@/hooks/use-toast';

// Components
import { ChatListItem } from '@/components/messages/ChatListItem';
import { ChatHeader } from '@/components/messages/ChatHeader';
import { EnhancedMessageBubble } from '@/components/messages/EnhancedMessageBubble';
import { MessageInput } from '@/components/messages/MessageInput';
import { CreateChatDialog } from '@/components/messages/CreateChatDialog';
import { CreateGroupChannelDialog } from '@/components/messages/CreateGroupChannelDialog';
import { VideoCallOverlay } from '@/components/messages/VideoCallOverlay';
import { ForwardMessageDialog } from '@/components/ForwardMessageDialog';
import { TelegramForwardDialog } from '@/components/messages/TelegramForwardDialog';
import { MessageSearch } from '@/components/messages/MessageSearch';
import { IncomingCallDialog } from '@/components/messages/IncomingCallDialog';
import { PinnedMessagesBar } from '@/components/messages/PinnedMessagesBar';
import { EditMessageDialog } from '@/components/messages/EditMessageDialog';
import { DeleteMessageDialog, DeleteScope } from '@/components/messages/DeleteMessageDialog';
import { TypingIndicator } from '@/components/messages/TypingIndicator';
import { GroupMemberManagement } from '@/components/messages/GroupMemberManagement';
import { ScheduledMessagesSheet } from '@/components/messages/ScheduledMessagesSheet';
import { MiniAudioPlayer } from '@/components/messages/MiniAudioPlayer';
import { useChannels, Channel } from '@/hooks/useChannels';
import { ChannelView } from '@/components/channels/ChannelView';
import { CreateChannelDialog } from '@/components/channels/CreateChannelDialog';
import { ChannelCard } from '@/components/channels/ChannelCard';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useIsMobile } from '@/hooks/use-mobile';

type MessageTab = 'private' | 'groups' | 'channels' | 'requests' | 'archived';

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // UI State
  const [activeTab, setActiveTab] = useState<MessageTab>('private');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  
  // Message State
  const [replyTo, setReplyTo] = useState<{ id: string; content: string; sender_name: string } | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [showMemberManagement, setShowMemberManagement] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showCreateChannelDialog, setShowCreateChannelDialog] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  
  // Selection mode for multi-select
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  // Call State
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video'>('video');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const hasJoinedRoomRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const lastConvIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unreadIncomingCount, setUnreadIncomingCount] = useState(0);
  const lastMessageIdRef = useRef<string | null>(null);

  // Determine if we're showing archived tab
  const isArchivedTab = activeTab === 'archived';

  // Hooks - main conversations (non-archived)
  const { 
    conversations, 
    isLoading: conversationsLoading, 
    createPrivateConversation, 
    createGroup,
    refresh: refreshConversations,
  } = useConversations(
    activeTab === 'private' ? 'private' : 
    activeTab === 'groups' ? 'group' : 
    activeTab === 'channels' ? 'channel' : 
    activeTab === 'archived' ? undefined : undefined,
    isArchivedTab // showArchived flag
  );

  const { 
    messages, 
    isLoading: messagesLoading, 
    typingUsers, 
    sendMessage, 
    editMessage,
    deleteMessage,
    deleteMessageForMe,
    setTyping 
  } = useMessages(selectedConversation?.id || null);

  // Read receipts
  const { markAsRead, isMessageRead, getMessageReadAt } = useReadReceipts(selectedConversation?.id || null);

  // Scheduled messages
  const { scheduleMessage, scheduledMessages } = useScheduledMessages(selectedConversation?.id || undefined);
  const [showScheduledMessages, setShowScheduledMessages] = useState(false);

  // Self-chat (saved messages)
  const { getOrCreateSelfChat, isCreating: isCreatingSelfChat } = useSelfChat();

  // Channels hook
  const { channels: channelsList, isLoading: channelsLoading, fetchChannels, createChannel, joinChannel, leaveChannel } = useChannels();

  // Video call management
  const {
    currentCall,
    callParticipants,
    isCreatingCall,
    callEnded,
    createCall,
    joinCall,
    leaveCall: leaveVideoCall,
    resetCallState,
    updateMediaState,
    fetchParticipants,
    subscribeToParticipants,
  } = useVideoCall();

  // Incoming call notifications
  const {
    incomingCall,
    handleCallHandled,
    declineCall,
  } = useIncomingCalls();

  // WebRTC for actual peer connections - use call ID as room ID for authorization
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
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleHandRaise,
  } = useWebRTC(activeCallId);

  // Merge WebRTC participants with profile data from database
  const participantsWithProfiles = webrtcParticipants.map(p => {
    const dbParticipant = callParticipants.find(cp => cp.user_id === p.id);
    return {
      ...p,
      name: dbParticipant?.profile?.display_name || dbParticipant?.profile?.username || 'Participant',
      avatarUrl: dbParticipant?.profile?.avatar_url || undefined,
    };
  });

  // Deep link handling
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId && !selectedConversation) {
      const conv = conversations.find(c => c.id === conversationId);
      if (conv) {
        setSelectedConversation(conv);
        setSearchParams({}, { replace: true });
        setShowMobileChat(true);
      } else if (!conversationsLoading) {
        fetchConversationById(conversationId);
      }
    }
  }, [searchParams, conversations, selectedConversation, conversationsLoading]);

  const fetchConversationById = async (conversationId: string) => {
    try {
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();
      
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
              .single();
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
      }
    } catch (error) {
      console.error('Error fetching conversation:', error);
    }
  };

  // Auto scroll to bottom — robust against late-loading media/avatars
  const scrollToBottom = useCallback((smooth = false) => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const doScroll = () => {
      el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(() => {
      doScroll();
      // Run again after layout settles (fonts, images)
      requestAnimationFrame(doScroll);
      setTimeout(doScroll, 120);
      setTimeout(doScroll, 350);
    });
  }, []);

  // Force-scroll to bottom whenever the selected conversation changes (Telegram-style: latest message at bottom)
  useEffect(() => {
    const id = selectedConversation?.id ?? null;
    if (id !== lastConvIdRef.current) {
      lastConvIdRef.current = id;
      isAtBottomRef.current = true;
      setUnreadIncomingCount(0);
      setShowScrollToBottom(false);
      lastMessageIdRef.current = null;
      scrollToBottom(false);
    }
  }, [selectedConversation?.id, scrollToBottom]);

  // When new messages arrive, scroll only if user is at/near bottom; otherwise show badge
  useEffect(() => {
    if (messages.length === 0) return;
    const newest = messages[messages.length - 1];
    const isNewMessage = newest && newest.id !== lastMessageIdRef.current;
    const prevId = lastMessageIdRef.current;
    lastMessageIdRef.current = newest?.id ?? null;

    if (isAtBottomRef.current) {
      scrollToBottom(false);
    } else if (isNewMessage && prevId && newest.sender_id !== user?.id) {
      // User scrolled up and a new incoming message arrived
      setUnreadIncomingCount((c) => c + 1);
    }

    // Mark messages as read when viewing them
    if (user) {
      const otherUserMessages = messages
        .filter(m => m.sender_id !== user.id)
        .map(m => m.id);
      if (otherUserMessages.length > 0) {
        markAsRead(otherUserMessages);
      }
    }
  }, [messages, markAsRead, user, scrollToBottom]);

  // Re-scroll when media inside the viewport finishes loading
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

  // Track whether the user is at the bottom (within 80px)
  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 80;
    isAtBottomRef.current = atBottom;
    setShowScrollToBottom(distanceFromBottom > 240);
    if (atBottom) setUnreadIncomingCount(0);
  }, []);

  const handleScrollToBottomClick = useCallback(() => {
    isAtBottomRef.current = true;
    setUnreadIncomingCount(0);
    setShowScrollToBottom(false);
    scrollToBottom(true);
  }, [scrollToBottom]);

  // Tab definitions
  const tabs: { id: MessageTab; label: string }[] = [
    { id: 'private', label: 'Private' },
    { id: 'groups', label: 'Groups' },
    { id: 'channels', label: 'Channels' },
    { id: 'requests', label: 'Requests' },
    { id: 'archived', label: 'Archived' },
  ];

  // Filter conversations - for requests tab, only show message requests (not yet accepted)
  const filteredConversations = conversations.filter(conv => {
    // For requests tab, filter to only show incoming requests (placeholder logic - needs backend support)
    if (activeTab === 'requests') {
      // This would require a field like `is_request` in the database
      // For now, return empty to show "No message requests"
      return false;
    }
    
    const name = conv.type === 'private' 
      ? conv.other_participant?.display_name || conv.other_participant?.username 
      : conv.name;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Unarchive conversation handler
  const handleUnarchiveConversation = async (conversationId: string) => {
    try {
      await supabase
        .from('conversation_participants')
        .update({ is_archived: false })
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id);
      
      refreshConversations();
      toast({ title: 'Unarchived', description: 'Conversation restored' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to unarchive conversation', variant: 'destructive' });
    }
  };

  // Handlers
  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowMobileChat(true);
    setReplyTo(null);
    isAtBottomRef.current = true;
    // Scroll handled by selectedConversation effect
  };

  const handleSendMessage = async (content: string, mediaUrl?: string, mediaType?: string) => {
    await sendMessage(content, mediaUrl, mediaType);
    setReplyTo(null);
  };

  const handleScheduleMessage = async (scheduledFor: Date, content: string, mediaUrl?: string, mediaType?: string) => {
    if (selectedConversation) {
      await scheduleMessage(selectedConversation.id, scheduledFor, content, mediaUrl, mediaType);
    }
  };

  const handleReply = (message: Message) => {
    setReplyTo({
      id: message.id,
      content: message.content || '',
      sender_name: message.sender?.display_name || message.sender?.username || 'Unknown',
    });
  };

  const handleForward = (message: Message) => {
    // Single message forward
    setForwardMessages([message]);
  };

  // Multi-select handlers
  const handleSelectMessage = (messageId: string) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
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

  // Drag-to-select (pointer-based, works for touch + mouse)
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
    setSelectedMessages(prev => {
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
      // Swallow the next click so the bubble's tap-toggle doesn't undo the drag
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener('click', swallow, true);
      };
      window.addEventListener('click', swallow, true);
    }
    setTimeout(() => { dragSelectActive.current = false; }, 0);
  };

  const handleForwardSelected = () => {
    const selectedMsgs = messages.filter(m => selectedMessages.has(m.id));
    // Sort by created_at to maintain order
    selectedMsgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    setForwardMessages(selectedMsgs);
    handleExitSelectionMode();
  };

  const handleDeleteSelected = async () => {
    // Only delete own messages
    const mySelectedMessages = messages.filter(m => selectedMessages.has(m.id) && m.sender_id === user?.id);
    for (const msg of mySelectedMessages) {
      await deleteMessage(msg.id);
    }
    handleExitSelectionMode();
    toast({
      title: 'Deleted',
      description: `${mySelectedMessages.length} message${mySelectedMessages.length > 1 ? 's' : ''} deleted`,
    });
  };

  const handleEdit = (message: Message) => {
    setEditingMessage(message);
  };

  const handleEditSave = async (messageId: string, newContent: string) => {
    await editMessage(messageId, newContent);
    setEditingMessage(null);
  };

  const handleDelete = async (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      setDeletingMessage(message);
    }
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

  // Pinned Messages
  const { 
    pinnedMessages, 
    pinMessage, 
    unpinMessage, 
    isMessagePinned 
  } = usePinnedMessages(selectedConversation?.id || null);

  const handlePin = async (messageId: string) => {
    const isPinned = isMessagePinned(messageId);
    if (isPinned) {
      await unpinMessage(messageId);
    } else {
      await pinMessage(messageId);
    }
  };

  const handleScrollToPinnedMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  };

  // Conversation context menu handlers
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
      toast({ title: 'Archived', description: 'Conversation archived' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to archive conversation', variant: 'destructive' });
    }
  };

  const handlePinConversation = async (conversationId: string) => {
    try {
      // Toggle pin status
      const { data: participant } = await supabase
        .from('conversation_participants')
        .select('is_pinned')
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id)
        .single();
      
      const newPinnedStatus = !(participant?.is_pinned ?? false);
      
      await supabase
        .from('conversation_participants')
        .update({ is_pinned: newPinnedStatus })
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id);
      
      refreshConversations();
      toast({ 
        title: newPinnedStatus ? 'Pinned' : 'Unpinned', 
        description: newPinnedStatus ? 'Conversation pinned to top' : 'Conversation unpinned' 
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update pin status', variant: 'destructive' });
    }
  };

  const handleMuteConversation = async (conversationId: string) => {
    try {
      // Toggle mute status
      const { data: participant } = await supabase
        .from('conversation_participants')
        .select('is_muted')
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id)
        .single();
      
      const newMutedStatus = !(participant?.is_muted ?? false);
      
      await supabase
        .from('conversation_participants')
        .update({ is_muted: newMutedStatus })
        .eq('conversation_id', conversationId)
        .eq('user_id', user?.id);
      
      refreshConversations();
      toast({ 
        title: newMutedStatus ? 'Muted' : 'Unmuted', 
        description: newMutedStatus ? 'Notifications muted' : 'Notifications enabled' 
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update mute status', variant: 'destructive' });
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      // Remove participant (soft delete for user)
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
      toast({ title: 'Deleted', description: 'Conversation deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete conversation', variant: 'destructive' });
    }
  };

  const handleMarkRead = async (conversationId: string) => {
    try {
      // Get all unread messages in this conversation
      const { data: unreadMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .neq('sender_id', user?.id);
      
      if (unreadMessages && unreadMessages.length > 0) {
        // Insert read receipts for all messages
        const readReceipts = unreadMessages.map(m => ({
          message_id: m.id,
          user_id: user?.id,
        }));
        
        await supabase
          .from('message_reads')
          .upsert(readReceipts, { onConflict: 'message_id,user_id' });
      }
      
      refreshConversations();
      toast({ title: 'Marked as read', description: 'All messages marked as read' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to mark as read', variant: 'destructive' });
    }
  };

  const handleMarkUnread = async (conversationId: string) => {
    try {
      // Delete read receipts for the last few messages to make it appear unread
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
          .in('message_id', recentMessages.map(m => m.id));
      }
      
      refreshConversations();
      toast({ title: 'Marked as unread', description: 'Conversation marked as unread' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to mark as unread', variant: 'destructive' });
    }
  };

  const startCall = async (type: 'audio' | 'video') => {
    if (!selectedConversation) {
      toast({
        title: 'Error',
        description: 'No conversation selected',
        variant: 'destructive',
      });
      return;
    }

    setCallType(type);
    
    // Create call record in database for authorization
    const callId = await createCall(selectedConversation.id, type);
    if (callId) {
      handleCallHandled(callId); // Mark as handled so we don't get incoming notification
      setActiveCallId(callId);
      setIsInCall(true);
      // WebRTC will auto-join when activeCallId is set
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) return;
    
    const success = await joinCall(incomingCall.id);
    if (success) {
      handleCallHandled(incomingCall.id);
      setCallType(incomingCall.call_type);
      setActiveCallId(incomingCall.id);
      setIsInCall(true);
      
      toast({
        title: 'Call joined',
        description: `Connected to ${incomingCall.host_profile?.display_name || 'caller'}`,
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to join call',
        variant: 'destructive',
      });
    }
  };

  const endCall = useCallback(async () => {
    // Calculate call duration
    const duration = currentCall?.started_at 
      ? Math.floor((Date.now() - new Date(currentCall.started_at).getTime()) / 1000)
      : 0;
    
    // Insert call history message with structured data
    if (selectedConversation && currentCall) {
      const callHistoryData = {
        type: callType,
        status: 'ended' as const,
        duration: duration > 0 ? duration : undefined,
        timestamp: new Date().toISOString(),
        caller_id: currentCall.host_id,
        callee_id: user?.id || '',
      };
      
      await supabase.from('messages').insert({
        conversation_id: selectedConversation.id,
        sender_id: user?.id,
        content: JSON.stringify(callHistoryData),
        media_type: 'call_history',
      });
    }
    
    leaveRoom();
    await leaveVideoCall();
    
    // Reset UI state after backend update
    setIsInCall(false);
    setActiveCallId(null);
    hasJoinedRoomRef.current = false;
    resetCallState();
  }, [currentCall, selectedConversation, callType, user?.id, leaveRoom, leaveVideoCall, resetCallState]);

  const formatCallDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Subscribe to participant changes and sync media state
  useEffect(() => {
    if (!isInCall || !currentCall) return;

    // Fetch initial participants
    fetchParticipants();

    // Subscribe to changes
    const unsubscribe = subscribeToParticipants();

    return () => {
      unsubscribe();
    };
  }, [isInCall, currentCall, fetchParticipants, subscribeToParticipants]);

  // Sync media state to database
  useEffect(() => {
    if (isInCall && currentCall) {
      updateMediaState(isMuted, isVideoOn, isScreenSharing, isHandRaised);
    }
  }, [isMuted, isVideoOn, isScreenSharing, isHandRaised, isInCall, currentCall, updateMediaState]);

  // Auto-join WebRTC room when call is created/joined (only once per call)
  useEffect(() => {
    if (!activeCallId || !isInCall) return;
    if (hasJoinedRoomRef.current) return;

    hasJoinedRoomRef.current = true;
    joinRoom();
  }, [activeCallId, isInCall, joinRoom]);

  // Auto-end call when other participant ends it (via realtime database update)
  useEffect(() => {
    if (callEnded && isInCall) {
      console.log('[MessagesPage] Call ended by other participant, cleaning up');
      
      // Clean up WebRTC first
      leaveRoom();
      
      // Reset all call UI state
      setIsInCall(false);
      setActiveCallId(null);
      hasJoinedRoomRef.current = false;
      
      // Reset video call hook state
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
    if (conv) {
      setActiveTab('groups');
    }
    return conv;
  };

  // Handle opening self-chat (saved messages)
  const handleOpenSelfChat = async () => {
    const selfConv = await getOrCreateSelfChat();
    if (selfConv) {
      setSelectedConversation(selfConv);
      setShowMobileChat(true);
      setActiveTab('private');
    }
  };

  // Group messages by date (filter out deleted messages completely)
  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    
    // Filter out deleted messages - they should not appear at all
    const activeMessages = msgs.filter(msg => !msg.is_deleted);
    
    activeMessages.forEach(msg => {
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

  // Flatten groups -> items for virtualization
  type FlatItem =
    | { kind: 'date'; key: string; date: string }
    | { kind: 'message'; key: string; message: Message; showAvatar: boolean; isMine: boolean };
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
    overscan: 12,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 72,
    getItemKey: (index) => flatItems[index]?.key ?? index,
  });

  // Build media tracks playlist for sequential playback (Telegram-style)
  const mediaTracksForPlaylist = useMemo(() => {
    return messages
      .filter(msg => 
        !msg.is_deleted && 
        msg.media_url && 
        (msg.media_type === 'audio' || msg.media_type === 'video')
      )
      .map(msg => ({
        id: msg.id,
        url: msg.media_url!,
        name: msg.media_type === 'audio' ? 'Voice message' : 'Video message',
        artist: msg.sender?.display_name || msg.sender?.username || 'Unknown',
        title: msg.media_type === 'audio' ? 'Voice message' : 'Video message',
        senderName: msg.sender?.display_name || msg.sender?.username,
        type: msg.media_type as 'audio' | 'video',
      }));
  }, [messages]);
  // Swipe to close state
  const isMobile = useIsMobile();
  const [chatSwipeOffset, setChatSwipeOffset] = useState(0);
  const [isChatSwiping, setIsChatSwiping] = useState(false);
  const chatSwipeStartX = useRef(0);
  const chatSwipeThreshold = 100;

  const handleChatSwipeStart = useCallback((e: React.TouchEvent) => {
    chatSwipeStartX.current = e.touches[0].clientX;
    setIsChatSwiping(true);
  }, []);

  const handleChatSwipeMove = useCallback((e: React.TouchEvent) => {
    if (!isChatSwiping) return;
    const diff = e.touches[0].clientX - chatSwipeStartX.current;
    if (diff > 0) {
      setChatSwipeOffset(Math.min(diff, 200));
    }
  }, [isChatSwiping]);

  const handleChatSwipeEnd = useCallback(() => {
    if (chatSwipeOffset >= chatSwipeThreshold) {
      setShowMobileChat(false);
      setSelectedConversation(null);
    }
    setChatSwipeOffset(0);
    setIsChatSwiping(false);
  }, [chatSwipeOffset]);

  // Detect compact (Telegram-style icon-only) chat list when panel is narrow
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const leftPanelHandleRef = useRef<any>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(320);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHint, setResizeHint] = useState<'compact' | 'expanded' | null>(null);

  // Snap target sizes (single compact size, single expanded size — no in-between)
  const COMPACT_PX = 72;
  const SNAP_THRESHOLD_PX = 220; // below this → compact; above → expanded

  // Device-aware default width and bounds (saved per device class)
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
      case 'tablet': return { defaultPct: 38, minPct: 6, maxPct: 55, expandedPct: 38 };
      case 'desktop': return { defaultPct: 32, minPct: 4, maxPct: 50, expandedPct: 32 };
      case 'wide': return { defaultPct: 26, minPct: 3, maxPct: 45, expandedPct: 26 };
      default: return { defaultPct: 100, minPct: 100, maxPct: 100, expandedPct: 100 };
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
      for (const entry of entries) {
        setLeftPanelWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track latest size during drag; snap only when user releases the handle
  const latestSizeRef = useRef<number>(initialPct);
  const saveTimerRef = useRef<number | null>(null);
  const handlePanelResize = (size: number) => {
    latestSizeRef.current = size;
    // Live hint while dragging
    const groupEl = leftPanelRef.current?.closest('[data-panel-group]') as HTMLElement | null;
    const groupWidth = groupEl?.getBoundingClientRect().width || window.innerWidth;
    const px = (size / 100) * groupWidth;
    if (isResizing) {
      setResizeHint(px < SNAP_THRESHOLD_PX ? 'compact' : 'expanded');
    }
    // Debounced persist
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      try { window.localStorage.setItem(STORAGE_KEY, String(size)); } catch {}
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

  // Left panel content
  const leftPanelContent = (
    <div ref={leftPanelRef} className="flex flex-col h-full bg-card overflow-hidden min-w-0 w-full">
      {isCompactList ? (
        /* Telegram-style icon-only header */
        <div className="p-2 border-b border-border flex-shrink-0 flex flex-col gap-2 items-center">
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-full"
            onClick={handleOpenSelfChat}
            disabled={isCreatingSelfChat}
            title="Saved Messages"
          >
            <Bookmark className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={() => activeTab === 'channels' ? setShowCreateChannelDialog(true) : setShowCreateDialog(true)}
            title="Yangi suhbat"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      ) : (
      <>
      {/* Search & Create */}
      <div className="p-4 md:p-3 border-b border-border flex-shrink-0 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 md:pl-10 h-12 md:h-10 text-base md:text-sm bg-muted/50"
            />
          </div>
          <Button 
            size="icon"
            variant="outline"
            className="h-12 w-12 md:h-10 md:w-10 bg-muted border-border hover:bg-accent"
            onClick={handleOpenSelfChat}
            disabled={isCreatingSelfChat}
            title="Saved Messages"
          >
            <Bookmark className="h-5 w-5 md:h-4 md:w-4 text-foreground" />
          </Button>
          <Button 
            size="icon"
            className="h-12 w-12 md:h-10 md:w-10"
            onClick={() => {
              if (activeTab === 'channels') {
                setShowCreateChannelDialog(true);
              } else {
                setShowCreateDialog(true);
              }
            }}
          >
            <Plus className="h-6 w-6 md:h-5 md:w-5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0 overflow-x-auto scrollbar-hide relative isolate" style={{ zIndex: 0 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-shrink-0 px-3 py-3 md:py-2.5 text-sm md:text-xs font-medium relative transition-colors active:bg-accent/50 whitespace-nowrap",
              activeTab === tab.id 
                ? "text-primary" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>
      </>
      )}

      {/* Conversation / Channel List */}
      <ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0 [&_[data-radix-scroll-area-viewport]>div]:!w-full">
        {activeTab === 'channels' ? (
          channelsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : channelsList.filter(c => c.is_member || c.channel_type === 'public').length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Megaphone className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">Hozircha kanallar yo'q</p>
              <Button variant="link" className="mt-2" onClick={() => setShowCreateChannelDialog(true)}>
                Kanal yaratish
              </Button>
            </div>
          ) : (
            channelsList
              .filter(c => {
                const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  c.username?.toLowerCase().includes(searchQuery.toLowerCase());
                return matchesSearch && (c.is_member || c.channel_type === 'public');
              })
              .map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  onSelect={(ch) => { setSelectedChannel(ch); setSelectedConversation(null); setShowMobileChat(true); }}
                  onJoin={joinChannel}
                  onLeave={leaveChannel}
                />
              ))
          )
        ) : (
          conversationsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              {activeTab === 'requests' ? (
                <><Inbox className="h-10 w-10 mb-3 opacity-50" /><p className="text-sm">No message requests</p></>
              ) : activeTab === 'archived' ? (
                <><Archive className="h-10 w-10 mb-3 opacity-50" /><p className="text-sm">No archived chats</p></>
              ) : (
                <><MessageCircle className="h-10 w-10 mb-3 opacity-50" /><p className="text-sm">No conversations yet</p>
                  <Button variant="link" className="mt-2" onClick={() => setShowCreateDialog(true)}>Start a new chat</Button></>
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
                onClick={() => { handleSelectConversation(conv); setSelectedChannel(null); }}
                onArchive={() => handleArchiveConversation(conv.id)}
                onUnarchive={() => handleUnarchiveConversation(conv.id)}
                onPin={() => handlePinConversation(conv.id)}
                onMute={() => handleMuteConversation(conv.id)}
                onDelete={() => handleDeleteConversation(conv.id)}
                onMarkRead={() => handleMarkRead(conv.id)}
                onMarkUnread={() => handleMarkUnread(conv.id)}
              />
            ))
          )
        )}
      </ScrollArea>
    </div>
  );

  // Right panel content
  const rightPanelContent = (
    <div 
      className="flex-1 flex flex-col bg-background min-w-0 h-full overflow-hidden"
      style={{
        transform: isMobile ? `translateX(${chatSwipeOffset}px)` : undefined,
        transition: isMobile && !isChatSwiping ? 'transform 0.2s ease-out' : 'none',
      }}
      onTouchStart={isMobile ? handleChatSwipeStart : undefined}
      onTouchMove={isMobile ? handleChatSwipeMove : undefined}
      onTouchEnd={isMobile ? handleChatSwipeEnd : undefined}
    >
      {selectedChannel ? (
        <ChannelView channel={selectedChannel} onBack={() => { setSelectedChannel(null); setShowMobileChat(false); }} />
      ) : selectedConversation ? (
        <>
          {isSelectionMode ? (
            <div className="flex-shrink-0 z-20 bg-card/90 backdrop-blur-xl border-b border-border animate-in slide-in-from-top duration-200">
              <div className="flex items-center justify-between p-3 md:p-4">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={handleExitSelectionMode} className="rounded-full"><X className="h-5 w-5" /></Button>
                  <span className="font-semibold text-base">
                    {selectedMessages.size > 0 ? `${selectedMessages.size} ta tanlandi` : 'Xabarlarni tanlang'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={handleForwardSelected} disabled={selectedMessages.size === 0} className="rounded-full"><Forward className="h-5 w-5" /></Button>
                  <Button variant="ghost" size="icon" onClick={handleDeleteSelected} disabled={selectedMessages.size === 0} className="rounded-full text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-5 w-5" /></Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 z-20 bg-card">
                <ChatHeader
                  conversation={selectedConversation}
                  typingUsers={typingUsers}
                  onBack={() => setShowMobileChat(false)}
                  onAudioCall={() => startCall('audio')}
                  onVideoCall={() => startCall('video')}
                  onSearch={() => setShowMessageSearch(true)}
                  onViewInfo={() => {}}
                  onManageMembers={selectedConversation.type === 'group' ? () => setShowMemberManagement(true) : undefined}
                  onViewScheduled={() => setShowScheduledMessages(true)}
                  scheduledCount={scheduledMessages.length}
                />
              </div>
              <MiniAudioPlayer />
            </>
          )}
          
          {showMessageSearch && !isSelectionMode && (
            <MessageSearch
              messages={messages}
              onHighlightMessage={(id) => {
                setHighlightedMessageId(id);
                const element = document.getElementById(`message-${id}`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => setHighlightedMessageId(null), 2000);
              }}
              onClose={() => setShowMessageSearch(false)}
            />
          )}
          
          {pinnedMessages.length > 0 && !isSelectionMode && (
            <PinnedMessagesBar pinnedMessages={pinnedMessages} onUnpin={unpinMessage} onScrollToMessage={handleScrollToPinnedMessage} />
          )}
          
          <div className="flex-1 relative min-h-0">
            <div
              ref={messagesScrollRef}
              onScroll={handleMessagesScroll}
              className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-custom bg-muted/20 overscroll-contain"
              style={isSelectionMode ? { touchAction: 'pan-y' } : undefined}
              onPointerDown={handleMessagesPointerDown}
              onPointerMove={handleMessagesPointerMove}
              onPointerUp={handleMessagesPointerUp}
              onPointerCancel={handleMessagesPointerUp}
            >
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageCircle className="h-16 w-16 mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">No messages yet</p>
                  <p className="text-sm">Start the conversation!</p>
                </div>
              ) : useVirtualization ? (
                <div
                  className="relative px-4 pt-4 pb-2 min-w-0 max-w-full"
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
                        className="absolute left-0 right-0 px-4 min-w-0"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        {item.kind === 'date' ? (
                          <div className="flex items-center justify-center my-3">
                            <span className="px-3 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                              {new Date(item.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        ) : (() => {
                          const message = item.message;
                          const senderId = message.sender_id || '';
                          const readByOther = item.isMine && senderId ? isMessageRead(message.id, senderId) : false;
                          const readAt = item.isMine && senderId ? getMessageReadAt(message.id, senderId) : null;
                          return (
                            <div id={`message-${message.id}`} data-message-id={message.id} className={cn('min-w-0 py-1', highlightedMessageId === message.id && 'animate-pulse bg-primary/10 rounded-lg')}>
                              <EnhancedMessageBubble
                                message={{ ...message, is_read: readByOther, status: readByOther ? 'read' : message.status, read_at: readAt || undefined }}
                                isMine={item.isMine}
                                isGroup={selectedConversation.type === 'group'}
                                onReply={handleReply}
                                onForward={handleForward}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onPin={handlePin}
                                onSelect={handleSelectMessage}
                                onLongPress={handleEnterSelectionMode}
                                isPinned={isMessagePinned(message.id)}
                                isSelected={selectedMessages.has(message.id)}
                                isSelectionMode={isSelectionMode}
                                showAvatar={item.showAvatar}
                                showSender={selectedConversation.type === 'group' && item.showAvatar}
                                allMediaTracks={mediaTracksForPlaylist}
                              />
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 space-y-4 min-w-0 max-w-full">
                  {messageGroups.map((group) => (
                    <div key={group.date} className="min-w-0">
                      <div className="flex items-center justify-center my-4">
                        <span className="px-3 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                          {new Date(group.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="space-y-2 min-w-0">
                        {group.messages.map((message, idx) => {
                          const prevMessage = group.messages[idx - 1];
                          const showAvatar = !prevMessage || prevMessage.sender_id !== message.sender_id;
                          const isMine = message.sender_id === user?.id;
                          const senderId = message.sender_id || '';
                          const readByOther = isMine && senderId ? isMessageRead(message.id, senderId) : false;
                          const readAt = isMine && senderId ? getMessageReadAt(message.id, senderId) : null;
                          return (
                            <div key={message.id} id={`message-${message.id}`} data-message-id={message.id} className={cn('min-w-0', highlightedMessageId === message.id && 'animate-pulse bg-primary/10 rounded-lg')}>
                              <EnhancedMessageBubble
                                key={message.id}
                                message={{ ...message, is_read: readByOther, status: readByOther ? 'read' : message.status, read_at: readAt || undefined }}
                                isMine={isMine}
                                isGroup={selectedConversation.type === 'group'}
                                onReply={handleReply}
                                onForward={handleForward}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onPin={handlePin}
                                onSelect={handleSelectMessage}
                                onLongPress={handleEnterSelectionMode}
                                isPinned={isMessagePinned(message.id)}
                                isSelected={selectedMessages.has(message.id)}
                                isSelectionMode={isSelectionMode}
                                showAvatar={showAvatar}
                                showSender={selectedConversation.type === 'group' && showAvatar}
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

            {/* Scroll-to-bottom floating button */}
            {showScrollToBottom && (
              <button
                type="button"
                onClick={handleScrollToBottomClick}
                aria-label="Eng oxirgi xabarga o'tish"
                className="absolute bottom-4 right-4 z-20 h-11 w-11 rounded-full bg-card border border-border shadow-lg flex items-center justify-center text-foreground hover:bg-accent transition-all active:scale-95"
              >
                <ArrowDown className="h-5 w-5" />
                {unreadIncomingCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center">
                    {unreadIncomingCount > 99 ? '99+' : unreadIncomingCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex-shrink-0 border-t border-border bg-card pb-safe mb-16 md:mb-0">
            <MessageInput
              onSend={handleSendMessage}
              onSchedule={handleScheduleMessage}
              onTyping={setTyping}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onShareLocation={async (location) => {
                const locationMessage = `📍 LOCATION:${location.latitude},${location.longitude}${location.address ? `|${location.address}` : ''}`;
                await sendMessage(locationMessage);
              }}
            />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
            <p className="text-muted-foreground text-sm mb-4">Choose a chat to start messaging</p>
            <Button onClick={() => setShowCreateDialog(true)}><Plus className="h-4 w-4 mr-2" />New Chat</Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-[100dvh] md:h-screen flex flex-col bg-background overflow-hidden">
      {/* Video Call Overlay */}
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

      {/* Incoming Call Dialog */}
      <IncomingCallDialog
        isOpen={!!incomingCall && !isInCall}
        callerName={incomingCall?.host_profile?.display_name || incomingCall?.host_profile?.username || 'Unknown'}
        callerAvatar={incomingCall?.host_profile?.avatar_url || undefined}
        callType={incomingCall?.call_type || 'video'}
        onAccept={acceptIncomingCall}
        onDecline={declineCall}
      />

      {/* Mobile Layout */}
      {isMobile ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className={cn("flex-1 flex flex-col h-[calc(100dvh-3.5rem)] pb-16", showMobileChat && "hidden")}>
            {leftPanelContent}
          </div>
          <div className={cn("fixed inset-0 z-10 flex flex-col h-[100dvh]", !showMobileChat && "hidden")}>
            {rightPanelContent}
          </div>
        </div>
      ) : (
        /* Desktop/Tablet Layout with Resizable Panels */
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden" autoSaveId={`messages-layout-${deviceClass}`}>
          <ResizablePanel
            ref={leftPanelHandleRef}
            defaultSize={initialPct}
            minSize={defaults.minPct}
            maxSize={defaults.maxPct}
            onResize={handlePanelResize}
            className="border-r border-border overflow-hidden min-w-0 transition-[flex-basis] duration-150 ease-out"
          >
            {leftPanelContent}
          </ResizablePanel>
          <ResizableHandle
            onDragging={handleDragging}
            className={cn(
              "group/handle relative w-px bg-border z-20",
              // Larger invisible hitbox for easier grabbing (12px wide)
              "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 after:content-['']",
              "hover:bg-primary/30 data-[resize-handle-active]:bg-primary",
              "transition-colors"
            )}
          >
            {/* Ghost guide line — only visible while dragging */}
            {isResizing && (
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]" />
            )}
            {/* Snap tooltip */}
            {isResizing && resizeHint && (
              <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-30 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs font-medium border border-border shadow-md whitespace-nowrap">
                {resizeHint === 'compact' ? 'Compact (icons only)' : `${Math.round(leftPanelWidth)}px`}
              </div>
            )}
          </ResizableHandle>
          <ResizablePanel defaultSize={100 - initialPct} minSize={40} className="overflow-hidden min-w-0">
            {rightPanelContent}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {/* Dialogs */}
      <CreateChatDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onCreatePrivate={handleCreatePrivate} onCreateGroup={handleCreateGroup} />
      <CreateGroupChannelDialog open={showGroupDialog} onOpenChange={setShowGroupDialog} onCreated={(id) => { setShowGroupDialog(false); setActiveTab('groups'); }} />
      <TelegramForwardDialog messages={forwardMessages} open={forwardMessages.length > 0} onOpenChange={(open) => !open && setForwardMessages([])} />
      <EditMessageDialog message={editingMessage} open={!!editingMessage} onOpenChange={(open) => !open && setEditingMessage(null)} onSave={handleEditSave} />
      <DeleteMessageDialog open={!!deletingMessage} onOpenChange={(open) => !open && setDeletingMessage(null)} onConfirm={handleDeleteConfirm} messagePreview={deletingMessage?.content || undefined} isMine={deletingMessage?.sender_id === user?.id} />
      {selectedConversation && selectedConversation.type === 'group' && (
        <GroupMemberManagement open={showMemberManagement} onOpenChange={setShowMemberManagement} conversationId={selectedConversation.id} conversationName={selectedConversation.name || undefined} isAdmin={selectedConversation.owner_id === user?.id} />
      )}
      <ScheduledMessagesSheet open={showScheduledMessages} onOpenChange={setShowScheduledMessages} conversationId={selectedConversation?.id} />
      <CreateChannelDialog open={showCreateChannelDialog} onOpenChange={setShowCreateChannelDialog} onCreateChannel={createChannel} />
    </div>
  );
}
