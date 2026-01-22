import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Search,
  Loader2,
  Trash2,
  Eye,
  Ban,
  MessageSquare,
  Heart,
  Play,
  Image as ImageIcon,
  FileText,
  MoreVertical,
  UserX,
  UserCheck,
  Mail,
  Calendar,
  MapPin,
  Globe,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  visibility: string | null;
  created_at: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  likes_count: number;
  created_at: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  is_online: boolean | null;
  last_seen: string | null;
  country: string | null;
  birth_date: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  created_at: string;
  location: string | null;
  website: string | null;
}

export function AdminContentManagement() {
  const [activeTab, setActiveTab] = useState('posts');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Posts state
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  
  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  
  // Users state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [userComments, setUserComments] = useState<Comment[]>([]);
  
  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'post' | 'comment' | 'user'; id: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (activeTab === 'posts') {
      fetchPosts();
    } else if (activeTab === 'comments') {
      fetchComments();
    } else if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profile:profiles!posts_user_id_fkey(
          username, display_name, avatar_url, is_verified
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setPosts(data as unknown as Post[]);
    }
    setLoading(false);
  };

  const fetchComments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        profile:profiles!comments_user_id_fkey(
          username, display_name, avatar_url, is_verified
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setComments(data as unknown as Comment[]);
    }
    setLoading(false);
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setUsers(data as UserProfile[]);
    }
    setLoading(false);
  };

  const fetchUserDetails = async (userId: string) => {
    setLoading(true);
    
    // Fetch user's posts
    const { data: postsData } = await supabase
      .from('posts')
      .select(`
        *,
        profile:profiles!posts_user_id_fkey(
          username, display_name, avatar_url, is_verified
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    // Fetch user's comments
    const { data: commentsData } = await supabase
      .from('comments')
      .select(`
        *,
        profile:profiles!comments_user_id_fkey(
          username, display_name, avatar_url, is_verified
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (postsData) setUserPosts(postsData as unknown as Post[]);
    if (commentsData) setUserComments(commentsData as unknown as Comment[]);
    
    setLoading(false);
  };

  const handleDeletePost = async (postId: string) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      
      toast.success("Post o'chirildi");
      setPosts(posts.filter(p => p.id !== postId));
      setUserPosts(userPosts.filter(p => p.id !== postId));
    } catch (error) {
      toast.error("Postni o'chirishda xato");
    } finally {
      setProcessing(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      
      toast.success("Izoh o'chirildi");
      setComments(comments.filter(c => c.id !== commentId));
      setUserComments(userComments.filter(c => c.id !== commentId));
    } catch (error) {
      toast.error("Izohni o'chirishda xato");
    } finally {
      setProcessing(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleToggleVerification = async (userId: string, currentStatus: boolean) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      
      toast.success(currentStatus ? "Verifikatsiya olib tashlandi" : "Foydalanuvchi tasdiqlandi");
      setUsers(users.map(u => u.id === userId ? { ...u, is_verified: !currentStatus } : u));
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, is_verified: !currentStatus });
      }
    } catch (error) {
      toast.error("Verifikatsiyani o'zgartirishda xato");
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    
    if (deleteTarget.type === 'post') {
      handleDeletePost(deleteTarget.id);
    } else if (deleteTarget.type === 'comment') {
      handleDeleteComment(deleteTarget.id);
    }
  };

  const openUserDetails = (user: UserProfile) => {
    setSelectedUser(user);
    fetchUserDetails(user.id);
  };

  const getMediaIcon = (mediaType: string | null) => {
    if (mediaType === 'video') return <Play className="h-4 w-4" />;
    if (mediaType === 'image') return <ImageIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const filteredPosts = posts.filter(p => 
    p.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.profile?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredComments = comments.filter(c => 
    c.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.profile?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="posts" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            Postlar
          </TabsTrigger>
          <TabsTrigger value="comments" className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            Izohlar
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1">
            <UserCheck className="h-4 w-4" />
            Foydalanuvchilar
          </TabsTrigger>
        </TabsList>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Posts Tab */}
        <TabsContent value="posts" className="mt-4">
          <ScrollArea className="h-[calc(100vh-400px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Foydalanuvchi</TableHead>
                    <TableHead>Kontent</TableHead>
                    <TableHead>Turi</TableHead>
                    <TableHead>Statistika</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPosts.map((post) => (
                    <TableRow key={post.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={post.profile?.avatar_url || ''} />
                            <AvatarFallback>{post.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-sm">
                                {post.profile?.display_name || post.profile?.username}
                              </span>
                              {post.profile?.is_verified && <VerifiedBadge size="sm" />}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              @{post.profile?.username}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate text-sm">{post.content || 'Media post'}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getMediaIcon(post.media_type)}
                          <span className="text-xs capitalize">{post.media_type || 'text'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" /> {post.likes_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> {post.comments_count}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(post.created_at), 'dd.MM.yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedPost(post)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ko'rish
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => {
                                setDeleteTarget({ type: 'post', id: post.id });
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              O'chirish
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comments" className="mt-4">
          <ScrollArea className="h-[calc(100vh-400px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Foydalanuvchi</TableHead>
                    <TableHead>Izoh</TableHead>
                    <TableHead>Likes</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredComments.map((comment) => (
                    <TableRow key={comment.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={comment.profile?.avatar_url || ''} />
                            <AvatarFallback>{comment.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-sm">
                                {comment.profile?.display_name || comment.profile?.username}
                              </span>
                              {comment.profile?.is_verified && <VerifiedBadge size="sm" />}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              @{comment.profile?.username}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <p className="truncate text-sm">{comment.content}</p>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Heart className="h-3 w-3" /> {comment.likes_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(comment.created_at), 'dd.MM.yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeleteTarget({ type: 'comment', id: comment.id });
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="mt-4">
          <ScrollArea className="h-[calc(100vh-400px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Foydalanuvchi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Davlat</TableHead>
                    <TableHead>Statistika</TableHead>
                    <TableHead>Ro'yxatdan</TableHead>
                    <TableHead className="text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar_url || ''} />
                            <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {user.is_online && (
                            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-sm">
                                {user.display_name || user.username}
                              </span>
                              {user.is_verified && <VerifiedBadge size="sm" />}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              @{user.username}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.is_online ? "default" : "secondary"} className="text-xs">
                          {user.is_online ? "Online" : "Offline"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.country || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{user.posts_count} post</span>
                          <span>{user.followers_count} follower</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(user.created_at), 'dd.MM.yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openUserDetails(user)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Batafsil
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleToggleVerification(user.id, user.is_verified || false)}
                            >
                              {user.is_verified ? (
                                <>
                                  <UserX className="h-4 w-4 mr-2" />
                                  Verifikatsiyani olib tashlash
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Tasdiqlash
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Post Preview Dialog */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Post</DialogTitle>
          </DialogHeader>
          {selectedPost && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={selectedPost.profile?.avatar_url || ''} />
                  <AvatarFallback>{selectedPost.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{selectedPost.profile?.display_name}</span>
                    {selectedPost.profile?.is_verified && <VerifiedBadge size="sm" />}
                  </div>
                  <span className="text-sm text-muted-foreground">@{selectedPost.profile?.username}</span>
                </div>
              </div>
              
              {selectedPost.content && (
                <p className="text-sm">{selectedPost.content}</p>
              )}
              
              {selectedPost.media_urls && selectedPost.media_urls.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {selectedPost.media_urls.map((url, idx) => (
                    selectedPost.media_type === 'video' ? (
                      <video key={idx} src={url} controls className="rounded-lg w-full" />
                    ) : (
                      <img key={idx} src={url} alt="" className="rounded-lg w-full object-cover aspect-square" />
                    )
                  ))}
                </div>
              )}
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Heart className="h-4 w-4" /> {selectedPost.likes_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" /> {selectedPost.comments_count}
                  </span>
                </div>
                <span>{format(new Date(selectedPost.created_at), 'dd.MM.yyyy HH:mm')}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedPost) {
                  setDeleteTarget({ type: 'post', id: selectedPost.id });
                  setDeleteDialogOpen(true);
                  setSelectedPost(null);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              O'chirish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Foydalanuvchi ma'lumotlari</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="flex-1 overflow-auto space-y-6">
              {/* User Header */}
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={selectedUser.avatar_url || ''} />
                    <AvatarFallback className="text-xl">{selectedUser.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {selectedUser.is_online && (
                    <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary border-2 border-background" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{selectedUser.display_name || selectedUser.username}</h3>
                    {selectedUser.is_verified && <VerifiedBadge />}
                  </div>
                  <p className="text-muted-foreground">@{selectedUser.username}</p>
                  {selectedUser.bio && <p className="text-sm mt-2">{selectedUser.bio}</p>}
                </div>
                <Button
                  variant={selectedUser.is_verified ? "outline" : "default"}
                  size="sm"
                  onClick={() => handleToggleVerification(selectedUser.id, selectedUser.is_verified || false)}
                  disabled={processing}
                >
                  {selectedUser.is_verified ? (
                    <>
                      <UserX className="h-4 w-4 mr-1" />
                      Olib tashlash
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4 mr-1" />
                      Tasdiqlash
                    </>
                  )}
                </Button>
              </div>

              {/* User Info Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Ro'yxatdan o'tgan: {format(new Date(selectedUser.created_at), 'dd.MM.yyyy')}</span>
                </div>
                {selectedUser.country && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="h-4 w-4" />
                    <span>{selectedUser.country}</span>
                  </div>
                )}
                {selectedUser.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{selectedUser.location}</span>
                  </div>
                )}
                {selectedUser.birth_date && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Tug'ilgan: {format(new Date(selectedUser.birth_date), 'dd.MM.yyyy')}</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 text-center">
                <div>
                  <p className="text-2xl font-bold">{selectedUser.posts_count}</p>
                  <p className="text-xs text-muted-foreground">Postlar</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{selectedUser.followers_count}</p>
                  <p className="text-xs text-muted-foreground">Followers</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{selectedUser.following_count}</p>
                  <p className="text-xs text-muted-foreground">Following</p>
                </div>
              </div>

              {/* User's Posts */}
              <div>
                <h4 className="font-medium mb-3">Foydalanuvchi postlari ({userPosts.length})</h4>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {loading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : userPosts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Postlar yo'q</p>
                    ) : (
                      userPosts.map((post) => (
                        <div key={post.id} className="flex items-center justify-between p-2 rounded-lg border">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {getMediaIcon(post.media_type)}
                            <p className="text-sm truncate">{post.content || 'Media post'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(post.created_at), 'dd.MM.yy')}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                setDeleteTarget({ type: 'post', id: post.id });
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* User's Comments */}
              <div>
                <h4 className="font-medium mb-3">Foydalanuvchi izohlari ({userComments.length})</h4>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {loading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : userComments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Izohlar yo'q</p>
                    ) : (
                      userComments.map((comment) => (
                        <div key={comment.id} className="flex items-center justify-between p-2 rounded-lg border">
                          <p className="text-sm truncate flex-1">{comment.content}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comment.created_at), 'dd.MM.yy')}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                setDeleteTarget({ type: 'comment', id: comment.id });
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              O'chirishni tasdiqlang
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bu amalni ortga qaytarib bo'lmaydi. {deleteTarget?.type === 'post' ? 'Post' : 'Izoh'} butunlay o'chiriladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              O'chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
