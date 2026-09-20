import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Eye,
  FileText,
  Heart,
  ImageIcon,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { VerifiedBadge } from '@/components/VerifiedBadge';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { PROFILE_PUBLIC_COLUMNS } from '@/lib/profileFields';

type ContentTab = 'posts' | 'comments' | 'users';

interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number | null;
  comments_count: number | null;
  visibility: string | null;
  status?: string | null;
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
  likes_count: number | null;
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
  followers_count: number;
  following_count: number;
  posts_count: number;
  created_at: string;
}

const PAGE_SIZE = 40;

function initials(profile?: {
  username?: string | null;
  display_name?: string | null;
}) {
  return (profile?.display_name || profile?.username || '?').slice(0, 1).toUpperCase();
}

function dateTime(value: string) {
  try {
    return format(new Date(value), 'dd.MM.yyyy HH:mm');
  } catch {
    return '—';
  }
}

function mediaIcon(type: string | null) {
  if (type === 'video') return <Play className="h-4 w-4" />;
  if (type === 'image') return <ImageIcon className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border bg-muted/40">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function AdminContentManagement() {
  const [activeTab, setActiveTab] = useState<ContentTab>('posts');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [page, setPage] = useState(0);

  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [total, setTotal] = useState(0);

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'post' | 'comment';
    id: string;
  } | null>(null);

  const loadTab = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      if (activeTab === 'posts') {
        const { data, error, count } = await supabase
          .from('posts')
          .select(
            `
              id, user_id, content, media_urls, media_type, likes_count, comments_count,
              visibility, status, created_at,
              profile:profiles!posts_user_id_fkey(
                username, display_name, avatar_url, is_verified
              )
            `,
            { count: 'exact' },
          )
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;
        setPosts((data || []) as unknown as Post[]);
        setTotal(count || 0);
      } else if (activeTab === 'comments') {
        const { data, error, count } = await supabase
          .from('comments')
          .select(
            `
              id, post_id, user_id, content, likes_count, created_at,
              profile:profiles!comments_user_id_fkey(
                username, display_name, avatar_url, is_verified
              )
            `,
            { count: 'exact' },
          )
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;
        setComments((data || []) as unknown as Comment[]);
        setTotal(count || 0);
      } else {
        const { data, error, count } = await supabase
          .from('profiles')
          .select(PROFILE_PUBLIC_COLUMNS, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;
        setUsers((data || []) as unknown as UserProfile[]);
        setTotal(count || 0);
      }
    } catch (error: any) {
      console.error('Admin content load failed:', error);
      toast.error(error?.message || 'Kontent ma’lumotlarini yuklab bo‘lmadi');
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  useEffect(() => {
    setPage(0);
    setSearchQuery('');
  }, [activeTab]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredPosts = useMemo(
    () =>
      posts.filter(
        (post) =>
          !normalizedQuery ||
          post.content?.toLowerCase().includes(normalizedQuery) ||
          post.profile?.username?.toLowerCase().includes(normalizedQuery) ||
          post.profile?.display_name?.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, posts],
  );

  const filteredComments = useMemo(
    () =>
      comments.filter(
        (comment) =>
          !normalizedQuery ||
          comment.content.toLowerCase().includes(normalizedQuery) ||
          comment.profile?.username?.toLowerCase().includes(normalizedQuery) ||
          comment.profile?.display_name?.toLowerCase().includes(normalizedQuery),
      ),
    [comments, normalizedQuery],
  );

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          !normalizedQuery ||
          user.username?.toLowerCase().includes(normalizedQuery) ||
          user.display_name?.toLowerCase().includes(normalizedQuery) ||
          user.country?.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, users],
  );

  const loadedCount =
    activeTab === 'posts' ? posts.length : activeTab === 'comments' ? comments.length : users.length;

  const engagementCount = useMemo(
    () =>
      posts.reduce(
        (sum, post) => sum + (post.likes_count || 0) + (post.comments_count || 0),
        0,
      ),
    [posts],
  );

  const verifiedLoaded = useMemo(
    () => users.filter((user) => user.is_verified).length,
    [users],
  );

  const deleteContent = async () => {
    if (!deleteTarget) return;
    setProcessing(true);

    try {
      if (deleteTarget.type === 'post') {
        const { error } = await supabase.from('posts').delete().eq('id', deleteTarget.id);
        if (error) throw error;
        toast.success('Post moderatsiya navbatidan o‘chirildi');
      } else {
        const { error } = await supabase.from('comments').delete().eq('id', deleteTarget.id);
        if (error) throw error;
        toast.success('Izoh o‘chirildi');
      }

      setDeleteTarget(null);
      await loadTab();
    } catch (error: any) {
      console.error('Admin content delete failed:', error);
      toast.error(error?.message || 'Kontentni o‘chirib bo‘lmadi');
    } finally {
      setProcessing(false);
    }
  };

  const toggleVerification = async (target: UserProfile) => {
    setProcessing(true);
    const nextValue = !Boolean(target.is_verified);

    try {
      const { error } = await (supabase as any).rpc('admin_set_user_verification_v1', {
        p_user_id: target.id,
        p_verified: nextValue,
        p_reason: nextValue
          ? 'Admin content management: verification granted'
          : 'Admin content management: verification removed',
      });

      if (error) throw error;

      setUsers((current) =>
        current.map((user) =>
          user.id === target.id ? { ...user, is_verified: nextValue } : user,
        ),
      );
      setSelectedUser((current) =>
        current?.id === target.id ? { ...current, is_verified: nextValue } : current,
      );
      toast.success(
        nextValue ? 'Foydalanuvchi verifikatsiya qilindi' : 'Verifikatsiya olib tashlandi',
      );
    } catch (error: any) {
      console.error('Admin verification toggle failed:', error);
      toast.error(error?.message || 'Verifikatsiya holatini o‘zgartirib bo‘lmadi');
    } finally {
      setProcessing(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5 pb-10">
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Jami
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{total.toLocaleString()}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-muted/40">
                <FileText className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Sahifada
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{loadedCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-muted/40">
                <Users className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {activeTab === 'posts'
                    ? 'Engagement'
                    : activeTab === 'users'
                      ? 'Verified'
                      : 'Moderatsiya'}
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {activeTab === 'posts'
                    ? engagementCount.toLocaleString()
                    : activeTab === 'users'
                      ? verifiedLoaded
                      : filteredComments.length}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-muted/40">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/10 p-4 md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="text-base">Kontent boshqaruvi</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Postlar, izohlar va foydalanuvchilar — bitta moderatsiya ish maydonida.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadTab()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Yangilash
            </Button>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ContentTab)}
            className="mt-4"
          >
            <TabsList className="grid h-11 w-full grid-cols-3 rounded-xl bg-muted/60 p-1">
              <TabsTrigger value="posts" className="rounded-lg">
                <FileText className="mr-2 h-4 w-4" />
                Postlar
              </TabsTrigger>
              <TabsTrigger value="comments" className="rounded-lg">
                <MessageSquare className="mr-2 h-4 w-4" />
                Izohlar
              </TabsTrigger>
              <TabsTrigger value="users" className="rounded-lg">
                <UserCheck className="mr-2 h-4 w-4" />
                Foydalanuvchilar
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={
                activeTab === 'users'
                  ? 'Username, ism yoki davlat bo‘yicha qidiring'
                  : 'Kontent yoki username bo‘yicha qidiring'
              }
              className="h-11 rounded-xl bg-background pl-10"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-72 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Tabs value={activeTab} onValueChange={() => undefined}>
                <TabsContent value="posts" className="m-0">
                  {filteredPosts.length === 0 ? (
                    <EmptyState
                      title="Post topilmadi"
                      description="Qidiruvni o‘zgartiring yoki keyingi sahifani tekshiring."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="min-w-56">Foydalanuvchi</TableHead>
                            <TableHead className="min-w-72">Kontent</TableHead>
                            <TableHead>Turi</TableHead>
                            <TableHead>Holat</TableHead>
                            <TableHead>Statistika</TableHead>
                            <TableHead className="min-w-36">Sana</TableHead>
                            <TableHead className="w-16 text-right">Amallar</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredPosts.map((post) => (
                            <TableRow key={post.id} className="group">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-9 w-9 ring-1 ring-border">
                                    <AvatarImage src={post.profile?.avatar_url || ''} />
                                    <AvatarFallback>{initials(post.profile)}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="max-w-44 truncate text-sm font-semibold">
                                        {post.profile?.display_name ||
                                          post.profile?.username ||
                                          'Nomsiz profil'}
                                      </span>
                                      {post.profile?.is_verified && <VerifiedBadge size="sm" />}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                      @{post.profile?.username || '—'}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="line-clamp-2 max-w-xl text-sm leading-5">
                                  {post.content || 'Media post'}
                                </p>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 text-sm">
                                  {mediaIcon(post.media_type)}
                                  <span className="capitalize">{post.media_type || 'text'}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="rounded-full font-normal">
                                  {post.status || post.visibility || 'published'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Heart className="h-3.5 w-3.5" />
                                    {post.likes_count || 0}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    {post.comments_count || 0}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {dateTime(post.created_at)}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-9 w-9">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuItem onClick={() => setSelectedPost(post)}>
                                      <Eye className="mr-2 h-4 w-4" />
                                      Ko‘rish
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() =>
                                        setDeleteTarget({ type: 'post', id: post.id })
                                      }
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      O‘chirish
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="comments" className="m-0">
                  {filteredComments.length === 0 ? (
                    <EmptyState
                      title="Izoh topilmadi"
                      description="Qidiruvni o‘zgartiring yoki keyingi sahifani tekshiring."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="min-w-56">Foydalanuvchi</TableHead>
                            <TableHead className="min-w-96">Izoh</TableHead>
                            <TableHead>Likes</TableHead>
                            <TableHead className="min-w-36">Sana</TableHead>
                            <TableHead className="w-16 text-right">Amallar</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredComments.map((comment) => (
                            <TableRow key={comment.id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-9 w-9 ring-1 ring-border">
                                    <AvatarImage src={comment.profile?.avatar_url || ''} />
                                    <AvatarFallback>{initials(comment.profile)}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="max-w-44 truncate text-sm font-semibold">
                                        {comment.profile?.display_name ||
                                          comment.profile?.username ||
                                          'Nomsiz profil'}
                                      </span>
                                      {comment.profile?.is_verified && <VerifiedBadge size="sm" />}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                      @{comment.profile?.username || '—'}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="line-clamp-2 max-w-2xl text-sm leading-5">
                                  {comment.content}
                                </p>
                              </TableCell>
                              <TableCell>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Heart className="h-3.5 w-3.5" />
                                  {comment.likes_count || 0}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {dateTime(comment.created_at)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-destructive hover:text-destructive"
                                  onClick={() =>
                                    setDeleteTarget({ type: 'comment', id: comment.id })
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="users" className="m-0">
                  {filteredUsers.length === 0 ? (
                    <EmptyState
                      title="Foydalanuvchi topilmadi"
                      description="Qidiruvni o‘zgartiring yoki keyingi sahifani tekshiring."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="min-w-64">Foydalanuvchi</TableHead>
                            <TableHead>Davlat</TableHead>
                            <TableHead>Postlar</TableHead>
                            <TableHead>Auditoriya</TableHead>
                            <TableHead>Holat</TableHead>
                            <TableHead className="min-w-36">Ro‘yxatdan o‘tgan</TableHead>
                            <TableHead className="w-16 text-right">Amallar</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredUsers.map((user) => (
                            <TableRow key={user.id}>
                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() => setSelectedUser(user)}
                                  className="flex items-center gap-3 text-left"
                                >
                                  <Avatar className="h-10 w-10 ring-1 ring-border">
                                    <AvatarImage src={user.avatar_url || ''} />
                                    <AvatarFallback>{initials(user)}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="max-w-48 truncate text-sm font-semibold">
                                        {user.display_name || user.username || 'Nomsiz profil'}
                                      </span>
                                      {user.is_verified && <VerifiedBadge size="sm" />}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                      @{user.username || '—'}
                                    </p>
                                  </div>
                                </button>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {user.country || '—'}
                              </TableCell>
                              <TableCell className="text-sm tabular-nums">
                                {user.posts_count || 0}
                              </TableCell>
                              <TableCell className="text-sm tabular-nums">
                                {(user.followers_count || 0).toLocaleString()} /{' '}
                                {(user.following_count || 0).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {user.is_online && (
                                    <Badge
                                      variant="outline"
                                      className="rounded-full border-emerald-500/30 text-emerald-600"
                                    >
                                      online
                                    </Badge>
                                  )}
                                  <Badge
                                    variant={user.is_verified ? 'default' : 'secondary'}
                                    className="rounded-full"
                                  >
                                    {user.is_verified ? 'Verified' : 'Oddiy'}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {dateTime(user.created_at)}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-9 w-9">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                                      <Eye className="mr-2 h-4 w-4" />
                                      Profilni ko‘rish
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={processing}
                                      onClick={() => void toggleVerification(user)}
                                    >
                                      <ShieldCheck className="mr-2 h-4 w-4" />
                                      {user.is_verified
                                        ? 'Verifikatsiyani olib tashlash'
                                        : 'Verifikatsiya berish'}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {total
                    ? `${page * PAGE_SIZE + 1}–${Math.min(
                        (page + 1) * PAGE_SIZE,
                        total,
                      )} / ${total.toLocaleString()}`
                    : '0 ta natija'}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                  >
                    Oldingi
                  </Button>
                  <span className="min-w-20 text-center text-xs font-medium">
                    {page + 1} / {pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= pages || loading}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Keyingi
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedPost)} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post tafsilotlari</DialogTitle>
            <DialogDescription>
              Moderatsiya qaroridan oldin kontent, muallif va engagementni tekshiring.
            </DialogDescription>
          </DialogHeader>
          {selectedPost && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border p-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={selectedPost.profile?.avatar_url || ''} />
                  <AvatarFallback>{initials(selectedPost.profile)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {selectedPost.profile?.display_name ||
                      selectedPost.profile?.username ||
                      'Nomsiz profil'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{selectedPost.profile?.username || '—'} · {dateTime(selectedPost.created_at)}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/10 p-4">
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {selectedPost.content || 'Media post'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  <Heart className="mr-1 h-3.5 w-3.5" />
                  {selectedPost.likes_count || 0}
                </Badge>
                <Badge variant="outline">
                  <MessageSquare className="mr-1 h-3.5 w-3.5" />
                  {selectedPost.comments_count || 0}
                </Badge>
                <Badge variant="outline">{selectedPost.visibility || 'public'}</Badge>
                {selectedPost.media_urls?.length ? (
                  <Badge variant="outline">{selectedPost.media_urls.length} media</Badge>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Foydalanuvchi</DialogTitle>
            <DialogDescription>
              Profil holati va verifikatsiyani tez boshqarish.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border p-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={selectedUser.avatar_url || ''} />
                  <AvatarFallback>{initials(selectedUser)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">
                      {selectedUser.display_name || selectedUser.username || 'Nomsiz profil'}
                    </p>
                    {selectedUser.is_verified && <VerifiedBadge size="sm" />}
                  </div>
                  <p className="text-sm text-muted-foreground">@{selectedUser.username || '—'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedUser.country || 'Hudud ko‘rsatilmagan'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border p-3">
                  <p className="text-xs text-muted-foreground">Postlar</p>
                  <p className="mt-1 text-lg font-semibold">{selectedUser.posts_count || 0}</p>
                </div>
                <div className="rounded-2xl border p-3">
                  <p className="text-xs text-muted-foreground">Followers</p>
                  <p className="mt-1 text-lg font-semibold">
                    {(selectedUser.followers_count || 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-2xl border p-3">
                  <p className="text-xs text-muted-foreground">Following</p>
                  <p className="mt-1 text-lg font-semibold">
                    {(selectedUser.following_count || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <Button
                className="w-full"
                variant={selectedUser.is_verified ? 'outline' : 'default'}
                disabled={processing}
                onClick={() => void toggleVerification(selectedUser)}
              >
                {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <ShieldCheck className="mr-2 h-4 w-4" />
                {selectedUser.is_verified
                  ? 'Verifikatsiyani olib tashlash'
                  : 'Verifikatsiya berish'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kontentni o‘chirishni tasdiqlang</AlertDialogTitle>
            <AlertDialogDescription>
              Bu amal kontentni platformadan o‘chiradi. Moderatsiya qarorini tekshirib, keyin
              davom eting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={processing}
              onClick={(event) => {
                event.preventDefault();
                void deleteContent();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              O‘chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
