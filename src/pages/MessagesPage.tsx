import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, 
  Plus, 
  MessageCircle,
  Inbox,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, useMessages, Conversation, Message } from '@/hooks/useMessages';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useToast } from '@/hooks/use-toast';

// Components
import { ChatListItem } from '@/components/messages/ChatListItem';
import { ChatHeader } from '@/components/messages/ChatHeader';
import { EnhancedMessageBubble } from '@/components/messages/EnhancedMessageBubble';
import { MessageInput } from '@/components/messages/MessageInput';
import { CreateChatDialog } from '@/components/messages/CreateChatDialog';
import { VideoCallOverlay } from '@/components/messages/VideoCallOverlay';
import { ForwardMessageDialog } from '@/components/ForwardMessageDialog';

type MessageTab = 'private' | 'groups' | 'channels' | 'requests';

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
  
  // Call State
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video'>('video');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { 
    conversations, 
    isLoading: conversationsLoading, 
    createPrivateConversation, 
    createGroup 
  } = useConversations(
    activeTab === 'private' ? 'private' : 
    activeTab === 'groups' ? 'group' : 
    activeTab === 'channels' ? 'channel' : undefined
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

  const {
    localStream,
    participants,
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
  } = useWebRTC(isInCall && selectedConversation ? selectedConversation.id : null);

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
              .select('id, username, display_name, avatar_url, is_online')
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
  }, [messages, scrollToBottom]);

  // Tab definitions
  const tabs: { id: MessageTab; label: string }[] = [
    { id: 'private', label: 'Private' },
    { id: 'groups', label: 'Groups' },
    { id: 'channels', label: 'Channels' },
    { id: 'requests', label: 'Requests' },
  ];

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    const name = conv.type === 'private' 
      ? conv.other_participant?.display_name || conv.other_participant?.username 
      : conv.name;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

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

  const handleReply = (message: Message) => {
    setReplyTo({
      id: message.id,
      content: message.content || '',
      sender_name: message.sender?.display_name || message.sender?.username || 'Unknown',
    });
  };

  const handleForward = (message: Message) => {
    setForwardMessage(message);
  };

  const handleEdit = (message: Message) => {
    // TODO: Implement edit dialog
    toast({
      title: 'Edit',
      description: 'Edit functionality coming soon',
    });
  };

  const handleDelete = async (messageId: string) => {
    await deleteMessage(messageId);
  };

  const handlePin = (messageId: string) => {
    // TODO: Implement pin functionality
    toast({
      title: 'Pinned',
      description: 'Message pinned',
    });
  };

  const startCall = async (type: 'audio' | 'video') => {
    setCallType(type);
    setIsInCall(true);
    await joinRoom();
  };

  const endCall = () => {
    leaveRoom();
    setIsInCall(false);
  };

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

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-background">
      {/* Video Call Overlay */}
      {isInCall && (
        <VideoCallOverlay
          localStream={localStream}
          participants={participants}
          isMuted={isMuted}
          isVideoOn={isVideoOn}
          isScreenSharing={isScreenSharing}
          isHandRaised={isHandRaised}
          callType={callType}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onToggleHandRaise={toggleHandRaise}
          onEndCall={endCall}
          currentUserName={user?.email?.split('@')[0]}
        />
      )}

      {/* Left Panel - Conversation List */}
      <div className={cn(
        "w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-card",
        showMobileChat && "hidden md:flex"
      )}>
        {/* Search & Create */}
        <div className="p-3 border-b border-border">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50"
              />
            </div>
            <Button 
              size="icon"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium relative transition-colors",
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
        <ScrollArea className="flex-1">
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
                onClick={() => handleSelectConversation(conv)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* Right Panel - Chat */}
      <div className={cn(
        "flex-1 flex flex-col bg-background",
        !showMobileChat && "hidden md:flex"
      )}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <ChatHeader
              conversation={selectedConversation}
              typingUsers={typingUsers}
              onBack={() => setShowMobileChat(false)}
              onAudioCall={() => startCall('audio')}
              onVideoCall={() => startCall('video')}
              onSearch={() => {}}
              onViewInfo={() => {}}
            />

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto scrollbar-custom bg-muted/20">
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
                <div className="p-4 space-y-4">
                  {messageGroups.map((group) => (
                    <div key={group.date}>
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
                      <div className="space-y-2">
                        {group.messages.map((message, idx) => {
                          const prevMessage = group.messages[idx - 1];
                          const showAvatar = !prevMessage || prevMessage.sender_id !== message.sender_id;
                          
                          return (
                            <EnhancedMessageBubble
                              key={message.id}
                              message={message}
                              isMine={message.sender_id === user?.id}
                              isGroup={selectedConversation.type === 'group'}
                              onReply={handleReply}
                              onForward={handleForward}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                              onPin={handlePin}
                              showAvatar={showAvatar}
                              showSender={selectedConversation.type === 'group' && showAvatar}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  
                  {/* Typing Indicator */}
                  {typingUsers.length > 0 && (
                    <div className="flex justify-start">
                      <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <MessageInput
              onSend={handleSendMessage}
              onTyping={setTyping}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
            />
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

      <ForwardMessageDialog
        message={forwardMessage}
        open={!!forwardMessage}
        onOpenChange={(open) => !open && setForwardMessage(null)}
      />
    </div>
  );
}
