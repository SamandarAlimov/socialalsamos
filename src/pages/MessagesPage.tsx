import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  Plus, 
  Users, 
  Megaphone, 
  Lock, 
  User,
  MoreVertical,
  Phone,
  Video,
  Mic,
  Send,
  Check,
  CheckCheck,
  MessageCircle,
  X,
  PhoneOff,
  VideoOff,
  MicOff,
  Monitor,
  Hand
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, useMessages, Conversation, Message } from '@/hooks/useMessages';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { format } from 'date-fns';
import { FileUploadButton } from '@/components/FileUploadButton';
import { MessageAttachment } from '@/components/MessageAttachment';
import { EmojiPicker } from '@/components/EmojiPicker';
import { VoiceMessageRecorder } from '@/components/VoiceMessageRecorder';
import { MessageBubble } from '@/components/MessageBubble';

type MessageTab = 'private' | 'groups' | 'channels';

export default function MessagesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<MessageTab>('private');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video'>('video');
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { conversations, isLoading: conversationsLoading, refresh: refreshConversations } = useConversations(
    activeTab === 'private' ? 'private' : activeTab === 'groups' ? 'group' : 'channel'
  );
  
  const { 
    messages, 
    isLoading: messagesLoading, 
    typingUsers, 
    sendMessage, 
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

  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const tabs: { id: MessageTab; label: string; count?: number }[] = [
    { id: 'private', label: 'Private' },
    { id: 'groups', label: 'Groups' },
    { id: 'channels', label: 'Channels' },
  ];

  const filteredConversations = conversations.filter(conv => {
    const name = conv.type === 'private' 
      ? conv.other_participant?.display_name || conv.other_participant?.username 
      : conv.name;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() && !pendingAttachment) return;
    
    await sendMessage(
      messageInput || (pendingAttachment ? `[${pendingAttachment.name}]` : ''),
      pendingAttachment?.url,
      pendingAttachment?.type
    );
    setMessageInput('');
    setPendingAttachment(null);
    setTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleFileUpload = (url: string, type: string, name: string) => {
    setPendingAttachment({ url, type, name });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    setTyping(true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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

  const getConversationName = (conv: Conversation) => {
    if (conv.type === 'private') {
      return conv.other_participant?.display_name || conv.other_participant?.username || 'Unknown';
    }
    return conv.name || 'Unnamed';
  };

  const getConversationAvatar = (conv: Conversation) => {
    if (conv.type === 'private') {
      return conv.other_participant?.avatar_url;
    }
    return conv.avatar_url;
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'HH:mm');
  };

  return (
    <div className="h-screen flex">
      {/* Left Panel - Conversation List */}
      <div className="w-80 lg:w-96 border-r border-border flex flex-col bg-card">
        {/* Search & Create */}
        <div className="p-4 border-b border-border">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="h-4 w-4" />}
                className="bg-muted/50"
              />
            </div>
            <div className="relative">
              <Button 
                variant="default" 
                size="icon"
                onClick={() => setShowCreateMenu(!showCreateMenu)}
              >
                <Plus className="h-5 w-5" />
              </Button>
              
              {showCreateMenu && (
                <div className="absolute right-0 top-12 w-56 bg-popover border border-border rounded-xl shadow-lg py-2 z-50 animate-scale-in">
                  <button className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent transition-colors text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    New Private Chat
                  </button>
                  <button className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent transition-colors text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    New Group
                  </button>
                  <button className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent transition-colors text-sm">
                    <Megaphone className="h-4 w-4 text-muted-foreground" />
                    New Channel
                  </button>
                  <button className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent transition-colors text-sm">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    New Secret Chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Internal Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 py-3 text-sm font-medium relative transition-colors",
                activeTab === tab.id 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="flex items-center justify-center gap-1.5">
                {tab.label}
              </span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto scrollbar-custom">
          {conversationsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <MessageCircle className="h-8 w-8 mb-2" />
              <p className="text-sm">No conversations yet</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={cn(
                  "w-full p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors border-b border-border/50",
                  selectedConversation?.id === conv.id && "bg-accent"
                )}
              >
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={getConversationAvatar(conv) || ''} />
                    <AvatarFallback className={conv.type === 'group' ? 'bg-blue-500' : conv.type === 'channel' ? 'bg-violet-500' : 'bg-primary'}>
                      {conv.type === 'group' ? <Users className="h-5 w-5 text-primary-foreground" /> : 
                       conv.type === 'channel' ? <Megaphone className="h-5 w-5 text-primary-foreground" /> :
                       getConversationName(conv)[0]}
                    </AvatarFallback>
                  </Avatar>
                  {conv.type === 'private' && conv.other_participant?.is_online && (
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-card" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-sm truncate">{getConversationName(conv)}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {conv.last_message_at && format(new Date(conv.last_message_at), 'HH:mm')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={cn(
                      "text-sm truncate",
                      conv.unread_count && conv.unread_count > 0 ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {conv.last_message || 'No messages yet'}
                    </p>
                    {conv.unread_count && conv.unread_count > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 ml-2">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Chat Window */}
      <div className="flex-1 flex flex-col bg-background">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-border bg-card">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={getConversationAvatar(selectedConversation) || ''} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getConversationName(selectedConversation)[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-semibold text-sm">{getConversationName(selectedConversation)}</h2>
                  <p className="text-xs text-muted-foreground">
                    {typingUsers.length > 0 ? (
                      <span className="text-primary animate-pulse">typing...</span>
                    ) : selectedConversation.type === 'private' && selectedConversation.other_participant?.is_online ? (
                      'online'
                    ) : (
                      'last seen recently'
                    )}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => startCall('audio')}>
                  <Phone className="h-5 w-5 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => startCall('video')}>
                  <Video className="h-5 w-5 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5 text-muted-foreground" />
                </Button>
              </div>
            </div>

            {/* Video Call Overlay */}
            {isInCall && (
              <div className="absolute inset-0 bg-background/95 z-50 flex flex-col">
                <div className="flex-1 relative">
                  {/* Remote Videos */}
                  <div className="grid grid-cols-2 gap-4 p-4 h-full">
                    {participants.map((participant) => (
                      <div key={participant.id} className="relative bg-muted rounded-xl overflow-hidden">
                        {participant.stream ? (
                          <video
                            autoPlay
                            playsInline
                            ref={(el) => {
                              if (el && participant.stream) el.srcObject = participant.stream;
                            }}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Avatar className="h-24 w-24">
                              <AvatarFallback className="text-2xl">U</AvatarFallback>
                            </Avatar>
                          </div>
                        )}
                        <div className="absolute bottom-4 left-4 flex items-center gap-2">
                          {participant.isMuted && <MicOff className="h-4 w-4 text-red-500" />}
                          {!participant.isVideoOn && <VideoOff className="h-4 w-4 text-red-500" />}
                          {participant.isHandRaised && <Hand className="h-4 w-4 text-yellow-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Local Video (Picture-in-Picture) */}
                  <div className="absolute bottom-24 right-4 w-48 h-36 bg-muted rounded-xl overflow-hidden shadow-lg">
                    {localStream ? (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover mirror"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback>
                            {user?.email?.[0]?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    )}
                  </div>
                </div>

                {/* Call Controls */}
                <div className="h-20 flex items-center justify-center gap-4 bg-card/80 backdrop-blur">
                  <Button
                    variant={isMuted ? "destructive" : "outline"}
                    size="icon"
                    className="rounded-full h-12 w-12"
                    onClick={toggleMute}
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>
                  <Button
                    variant={!isVideoOn ? "destructive" : "outline"}
                    size="icon"
                    className="rounded-full h-12 w-12"
                    onClick={toggleVideo}
                  >
                    {isVideoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </Button>
                  <Button
                    variant={isScreenSharing ? "secondary" : "outline"}
                    size="icon"
                    className="rounded-full h-12 w-12"
                    onClick={toggleScreenShare}
                  >
                    <Monitor className="h-5 w-5" />
                  </Button>
                  <Button
                    variant={isHandRaised ? "secondary" : "outline"}
                    size="icon"
                    className="rounded-full h-12 w-12"
                    onClick={toggleHandRaise}
                  >
                    <Hand className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="rounded-full h-14 w-14"
                    onClick={endCall}
                  >
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                </div>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-custom bg-muted/30">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mb-4" />
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((message) => (
                  <MessageBubble 
                    key={message.id} 
                    message={message} 
                    isMine={message.sender_id === user?.id}
                    formatTime={formatMessageTime}
                  />
                ))
              )}
              
              {/* Typing Indicator */}
              {typingUsers.length > 0 && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-border bg-card">
              {/* Pending Attachment Preview */}
              {pendingAttachment && (
                <div className="mb-2 p-2 bg-muted rounded-lg flex items-center gap-2">
                  {pendingAttachment.type === 'image' ? (
                    <img src={pendingAttachment.url} alt="Preview" className="h-12 w-12 object-cover rounded" />
                  ) : (
                    <div className="h-12 w-12 bg-accent rounded flex items-center justify-center text-xs">
                      {pendingAttachment.type}
                    </div>
                  )}
                  <span className="flex-1 text-sm truncate">{pendingAttachment.name}</span>
                  <Button variant="ghost" size="icon" onClick={() => setPendingAttachment(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <FileUploadButton onUpload={handleFileUpload} />
                
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    placeholder="Write a message..."
                    className="w-full h-11 px-4 pr-12 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <EmojiPicker 
                    onSelect={(emoji) => setMessageInput(prev => prev + emoji)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground h-8 w-8"
                  />
                </div>

                {(messageInput || pendingAttachment) ? (
                  <Button variant="hero" size="icon" onClick={handleSendMessage}>
                    <Send className="h-5 w-5" />
                  </Button>
                ) : (
                  <VoiceMessageRecorder 
                    onSend={(url, duration) => {
                      sendMessage(`Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`, url, 'audio');
                    }}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
              <p className="text-muted-foreground text-sm">Choose a chat to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
