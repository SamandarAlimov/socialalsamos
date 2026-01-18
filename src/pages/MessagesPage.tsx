import { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
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
import { DeleteMessageDialog } from '@/components/messages/DeleteMessageDialog';
import { TypingIndicator } from '@/components/messages/TypingIndicator';
import { GroupMemberManagement } from '@/components/messages/GroupMemberManagement';
import { ScheduledMessagesSheet } from '@/components/messages/ScheduledMessagesSheet';
import { MiniAudioPlayer } from '@/components/messages/MiniAudioPlayer';

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
    setTyping 
  } = useMessages(selectedConversation?.id || null);

  // Read receipts
  const { markAsRead, isMessageRead, getMessageReadAt } = useReadReceipts(selectedConversation?.id || null);

  // Scheduled messages
  const { scheduleMessage, scheduledMessages } = useScheduledMessages(selectedConversation?.id || undefined);
  const [showScheduledMessages, setShowScheduledMessages] = useState(false);

  // Self-chat (saved messages)
  const { getOrCreateSelfChat, isCreating: isCreatingSelfChat } = useSelfChat();

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

  // Auto scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
    
    // Mark messages as read when viewing them
    if (messages.length > 0 && user) {
      const otherUserMessages = messages
        .filter(m => m.sender_id !== user.id)
        .map(m => m.id);
      if (otherUserMessages.length > 0) {
        markAsRead(otherUserMessages);
      }
    }
  }, [messages, scrollToBottom, markAsRead, user]);

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

  const handleDeleteConfirm = async () => {
    if (deletingMessage) {
      await deleteMessage(deletingMessage.id);
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

  // Group messages by date
  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    
    msgs.forEach(msg => {
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

  const messageGroups = groupMessagesByDate(messages);

  // Swipe to close state
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

  return (
    <div className="h-[100dvh] md:h-screen flex flex-col md:flex-row bg-background overflow-hidden">
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

      {/* Left Panel - Conversation List */}
      <div className={cn(
        "w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-card flex-shrink-0",
        "h-[calc(100dvh-3.5rem)] md:h-full pb-16 md:pb-0",
        showMobileChat && "hidden md:flex"
      )}>
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
              className="h-12 w-12 md:h-10 md:w-10 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30 hover:bg-amber-500/20"
              onClick={handleOpenSelfChat}
              disabled={isCreatingSelfChat}
              title="Saved Messages"
            >
              <Bookmark className="h-5 w-5 md:h-4 md:w-4 text-amber-600" />
            </Button>
            <Button 
              size="icon"
              className="h-12 w-12 md:h-10 md:w-10"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-6 w-6 md:h-5 md:w-5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border flex-shrink-0 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 min-w-fit px-4 py-3 md:py-2.5 text-base md:text-sm font-medium relative transition-colors active:bg-accent/50",
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

        {/* Conversation List */}
        <ScrollArea className="flex-1 min-h-0">
          {conversationsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              {activeTab === 'requests' ? (
                <>
                  <Inbox className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm">No message requests</p>
                </>
              ) : activeTab === 'archived' ? (
                <>
                  <Archive className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm">No archived chats</p>
                </>
              ) : (
                <>
                  <MessageCircle className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm">No conversations yet</p>
                  <Button 
                    variant="link" 
                    className="mt-2"
                    onClick={() => setShowCreateDialog(true)}
                  >
                    Start a new chat
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
                onClick={() => handleSelectConversation(conv)}
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

      {/* Right Panel - Chat */}
      <div 
        className={cn(
          "flex-1 flex flex-col bg-background min-w-0",
          "fixed inset-0 md:relative md:inset-auto",
          "h-[100dvh] md:h-full",
          !showMobileChat && "hidden md:flex"
        )}
        style={{
          transform: `translateX(${chatSwipeOffset}px)`,
          transition: isChatSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleChatSwipeStart}
        onTouchMove={handleChatSwipeMove}
        onTouchEnd={handleChatSwipeEnd}
      >
        {selectedConversation ? (
          <>
            {/* Selection Mode Header */}
            {isSelectionMode ? (
              <div className="flex-shrink-0 z-20 bg-card border-b border-border">
                <div className="flex items-center justify-between p-3 md:p-4">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleExitSelectionMode}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                    <span className="font-medium">
                      {selectedMessages.size} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleForwardSelected}
                      disabled={selectedMessages.size === 0}
                    >
                      <Forward className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDeleteSelected}
                      disabled={selectedMessages.size === 0}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Chat Header - Fixed at top */
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
                
                {/* Mini Audio Player - Telegram style */}
                <MiniAudioPlayer />
              </>
            )}
            
            {/* Message Search Bar */}
            {showMessageSearch && !isSelectionMode && (
              <MessageSearch
                messages={messages}
                onHighlightMessage={(id) => {
                  setHighlightedMessageId(id);
                  // Scroll to message
                  const element = document.getElementById(`message-${id}`);
                  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  // Clear highlight after animation
                  setTimeout(() => setHighlightedMessageId(null), 2000);
                }}
                onClose={() => setShowMessageSearch(false)}
              />
            )}
            
            {/* Pinned Messages Bar */}
            {pinnedMessages.length > 0 && !isSelectionMode && (
              <PinnedMessagesBar
                pinnedMessages={pinnedMessages}
                onUnpin={unpinMessage}
                onScrollToMessage={handleScrollToPinnedMessage}
              />
            )}
            
            {/* Messages Area - Scrollable - Takes remaining space between fixed header and input */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-custom bg-muted/20 overscroll-contain">
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
              ) : (
                <div className="p-4 space-y-4 min-w-0 max-w-full">
                  {messageGroups.map((group) => (
                    <div key={group.date} className="min-w-0">
                      {/* Date separator */}
                      <div className="flex items-center justify-center my-4">
                        <span className="px-3 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                          {new Date(group.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      
                      {/* Messages */}
                      <div className="space-y-2 min-w-0">
                        {group.messages.map((message, idx) => {
                          const prevMessage = group.messages[idx - 1];
                          const showAvatar = !prevMessage || prevMessage.sender_id !== message.sender_id;
                          const isMine = message.sender_id === user?.id;
                          const senderId = message.sender_id || '';
                          const readByOther = isMine && senderId ? isMessageRead(message.id, senderId) : false;
                          const readAt = isMine && senderId ? getMessageReadAt(message.id, senderId) : null;
                          
                          return (
                            <div
                              key={message.id}
                              id={`message-${message.id}`}
                              className={cn(
                                'min-w-0',
                                highlightedMessageId === message.id && 'animate-pulse bg-primary/10 rounded-lg'
                              )}
                            >
                              <EnhancedMessageBubble
                                key={message.id}
                                message={{
                                  ...message,
                                  is_read: readByOther,
                                  status: readByOther ? 'read' : message.status,
                                  read_at: readAt || undefined,
                                }}
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
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  
                  {/* Typing Indicator */}
                  {typingUsers.length > 0 && (
                    <TypingIndicator userNames={typingUsers} />
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input - Fixed at bottom, above BottomNavbar on mobile */}
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
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateChatDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreatePrivate={handleCreatePrivate}
        onCreateGroup={handleCreateGroup}
      />

      <CreateGroupChannelDialog
        open={showGroupDialog}
        onOpenChange={setShowGroupDialog}
        onCreated={(id) => {
          setShowGroupDialog(false);
          setActiveTab('groups');
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
    </div>
  );
}
