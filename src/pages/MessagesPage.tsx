import { useState } from 'react';
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
  Paperclip,
  Smile,
  Mic,
  Send,
  Check,
  CheckCheck,
  Image as ImageIcon,
  File,
  MapPin,
  Contact
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type MessageTab = 'private' | 'groups' | 'channels' | 'requests';

interface Chat {
  id: string;
  name: string;
  avatar?: string;
  lastMessage: string;
  time: string;
  unread: number;
  isOnline?: boolean;
  isTyping?: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
  type: 'private' | 'group' | 'channel';
}

interface Message {
  id: string;
  content: string;
  time: string;
  isMine: boolean;
  status: 'sent' | 'delivered' | 'read';
  type: 'text' | 'image' | 'file' | 'voice';
}

// Mock data
const privateChats: Chat[] = [
  { id: '1', name: 'Sarah Johnson', avatar: 'https://i.pravatar.cc/150?img=1', lastMessage: 'Hey! How are you doing?', time: '2m', unread: 2, isOnline: true, type: 'private' },
  { id: '2', name: 'Alex Chen', avatar: 'https://i.pravatar.cc/150?img=2', lastMessage: 'The project is ready for review', time: '15m', unread: 0, isOnline: true, type: 'private', isPinned: true },
  { id: '3', name: 'Mike Wilson', avatar: 'https://i.pravatar.cc/150?img=3', lastMessage: 'Thanks for the help!', time: '1h', unread: 0, isOnline: false, type: 'private' },
  { id: '4', name: 'Emma Davis', avatar: 'https://i.pravatar.cc/150?img=4', lastMessage: 'Let\'s catch up tomorrow', time: '3h', unread: 5, isOnline: false, type: 'private' },
  { id: '5', name: 'John Smith', avatar: 'https://i.pravatar.cc/150?img=5', lastMessage: '📎 Document.pdf', time: 'Yesterday', unread: 0, isOnline: true, type: 'private' },
];

const groupChats: Chat[] = [
  { id: 'g1', name: 'Alsamos Team', avatar: '', lastMessage: 'Alex: Meeting at 3pm', time: '10m', unread: 12, type: 'group', isPinned: true },
  { id: 'g2', name: 'Project Alpha', avatar: '', lastMessage: 'Sarah: Updated the docs', time: '2h', unread: 0, type: 'group' },
  { id: 'g3', name: 'Design Squad', avatar: '', lastMessage: 'New mockups ready!', time: '5h', unread: 3, type: 'group' },
];

const channelChats: Chat[] = [
  { id: 'c1', name: 'Alsamos News', avatar: '', lastMessage: 'New feature announcement', time: '1h', unread: 8, type: 'channel' },
  { id: 'c2', name: 'Tech Updates', avatar: '', lastMessage: 'Weekly digest available', time: '3h', unread: 0, type: 'channel' },
];

const requestChats: Chat[] = [
  { id: 'r1', name: 'Unknown User', avatar: '', lastMessage: 'Hi, I found you through...', time: '2d', unread: 1, type: 'private' },
];

const mockMessages: Message[] = [
  { id: '1', content: 'Hey! How are you doing?', time: '10:30 AM', isMine: false, status: 'read', type: 'text' },
  { id: '2', content: 'I\'m doing great, thanks for asking! How about you?', time: '10:32 AM', isMine: true, status: 'read', type: 'text' },
  { id: '3', content: 'Pretty good! Just finished the project we discussed last week.', time: '10:33 AM', isMine: false, status: 'read', type: 'text' },
  { id: '4', content: 'That\'s awesome! Can\'t wait to see it.', time: '10:34 AM', isMine: true, status: 'read', type: 'text' },
  { id: '5', content: 'I\'ll send you the link in a bit. Also, wanted to ask if you\'re free for a call tomorrow?', time: '10:35 AM', isMine: false, status: 'read', type: 'text' },
  { id: '6', content: 'Sure! What time works for you?', time: '10:36 AM', isMine: true, status: 'delivered', type: 'text' },
];

export default function MessagesPage() {
  const [activeTab, setActiveTab] = useState<MessageTab>('private');
  const [selectedChat, setSelectedChat] = useState<Chat | null>(privateChats[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const tabs: { id: MessageTab; label: string; count?: number }[] = [
    { id: 'private', label: 'Private', count: privateChats.reduce((acc, c) => acc + c.unread, 0) },
    { id: 'groups', label: 'Groups', count: groupChats.reduce((acc, c) => acc + c.unread, 0) },
    { id: 'channels', label: 'Channels', count: channelChats.reduce((acc, c) => acc + c.unread, 0) },
    { id: 'requests', label: 'Requests', count: requestChats.length },
  ];

  const getChatsForTab = (): Chat[] => {
    switch (activeTab) {
      case 'private': return privateChats;
      case 'groups': return groupChats;
      case 'channels': return channelChats;
      case 'requests': return requestChats;
      default: return [];
    }
  };

  const filteredChats = getChatsForTab().filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen flex">
      {/* Left Panel - Chat List */}
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
              
              {/* Create Menu Dropdown */}
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
                {tab.count && tab.count > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                )}
              </span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto scrollbar-custom">
          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={cn(
                "w-full p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors border-b border-border/50",
                selectedChat?.id === chat.id && "bg-accent"
              )}
            >
              <div className="relative">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={chat.avatar} />
                  <AvatarFallback className={chat.type === 'group' ? 'bg-blue-500' : chat.type === 'channel' ? 'bg-violet-500' : 'bg-primary'}>
                    {chat.type === 'group' ? <Users className="h-5 w-5 text-primary-foreground" /> : 
                     chat.type === 'channel' ? <Megaphone className="h-5 w-5 text-primary-foreground" /> :
                     chat.name[0]}
                  </AvatarFallback>
                </Avatar>
                {chat.isOnline && (
                  <span className="absolute bottom-0 right-0 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-card" />
                )}
              </div>
              
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-medium text-sm truncate">{chat.name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{chat.time}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className={cn(
                    "text-sm truncate",
                    chat.unread > 0 ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {chat.isTyping ? (
                      <span className="text-primary">typing...</span>
                    ) : (
                      chat.lastMessage
                    )}
                  </p>
                  {chat.unread > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 ml-2">
                      {chat.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel - Chat Window */}
      <div className="flex-1 flex flex-col bg-background">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-border bg-card">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={selectedChat.avatar} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {selectedChat.name[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-semibold text-sm">{selectedChat.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedChat.isOnline ? 'online' : 'last seen recently'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon">
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

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-custom bg-muted/30">
              {mockMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.isMine ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-2xl px-4 py-2.5 animate-scale-in",
                      message.isMine 
                        ? "bg-primary text-primary-foreground rounded-br-md" 
                        : "bg-card text-card-foreground rounded-bl-md border border-border"
                    )}
                  >
                    <p className="text-sm leading-relaxed">{message.content}</p>
                    <div className={cn(
                      "flex items-center justify-end gap-1 mt-1",
                      message.isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}>
                      <span className="text-xs">{message.time}</span>
                      {message.isMine && (
                        message.status === 'read' ? (
                          <CheckCheck className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-border bg-card">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-muted-foreground">
                  <Paperclip className="h-5 w-5" />
                </Button>
                
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Write a message..."
                    className="w-full h-11 px-4 pr-12 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <Smile className="h-5 w-5" />
                  </button>
                </div>

                {messageInput ? (
                  <Button variant="hero" size="icon">
                    <Send className="h-5 w-5" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <Mic className="h-5 w-5" />
                  </Button>
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

// Import icon that wasn't declared
import { MessageCircle } from 'lucide-react';
