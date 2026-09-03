import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  ChevronLeft,
  Crown,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface Member {
  id: string;
  user_id: string;
  role: string | null;
  joined_at: string | null;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  } | null;
}

interface AdminRights {
  id?: string;
  user_id: string;
  custom_title: string | null;
  can_change_info: boolean;
  can_post_messages: boolean;
  can_edit_messages: boolean;
  can_delete_messages: boolean;
  can_restrict_members: boolean;
  can_invite_users: boolean;
  can_pin_messages: boolean;
  can_manage_video_chats: boolean;
  can_manage_topics: boolean;
  can_promote_members: boolean;
  is_anonymous: boolean;
}

interface RestrictedMember {
  id: string;
  user_id: string;
  reason: string | null;
  is_banned: boolean;
  until_date: string | null;
  restrictions: Record<string, boolean> | null;
  profile?: Member['profile'];
}

interface GroupMemberManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationName?: string;
  conversationType?: 'group' | 'channel';
  isAdmin: boolean;
}

type Tab = 'members' | 'admins' | 'restricted';

const DEFAULT_ADMIN_RIGHTS: Omit<AdminRights, 'user_id'> = {
  custom_title: null,
  can_change_info: true,
  can_post_messages: true,
  can_edit_messages: true,
  can_delete_messages: true,
  can_restrict_members: true,
  can_invite_users: true,
  can_pin_messages: true,
  can_manage_video_chats: true,
  can_manage_topics: true,
  can_promote_members: false,
  is_anonymous: false,
};

const ADMIN_RIGHT_LABELS: Array<{ key: keyof AdminRights; label: string; hint: string; channelOnly?: boolean }> = [
  { key: 'can_change_info', label: "Ma'lumotni boshqarish", hint: 'Nomi, rasmi, tavsifi va ommaviy manzil' },
  { key: 'can_post_messages', label: 'Xabar joylash', hint: 'Kanal postlari yoki admin xabarlari', channelOnly: true },
  { key: 'can_edit_messages', label: 'Xabarlarni tahrirlash', hint: 'Admin yuborgan kontentni tahrirlash' },
  { key: 'can_delete_messages', label: "Xabarlarni o'chirish", hint: 'Boshqa xabarlarni ham moderatsiya qilish' },
  { key: 'can_restrict_members', label: "A'zolarni cheklash", hint: 'Remove, restrict va ban amallari' },
  { key: 'can_invite_users', label: "A'zo taklif qilish", hint: 'Taklif havolalari va bevosita qo‘shish' },
  { key: 'can_pin_messages', label: 'Xabarlarni qadash', hint: 'Muhim xabarlarni yuqoriga mahkamlash' },
  { key: 'can_manage_video_chats', label: 'Jonli suhbatlarni boshqarish', hint: 'Audio/video sessiyalarini boshqarish' },
  { key: 'can_manage_topics', label: 'Topiklarni boshqarish', hint: 'Forum bo‘limlarini yaratish va tahrirlash' },
  { key: 'can_promote_members', label: 'Admin tayinlash', hint: 'Boshqa adminlarni tayinlash yoki huquqini o‘zgartirish' },
  { key: 'is_anonymous', label: 'Anonim admin', hint: 'Admin nomi o‘rniga guruh/kanal nomidan harakat qiladi' },
];

function memberName(member?: Member | null) {
  return member?.profile?.display_name || member?.profile?.username || "A'zo";
}

export function GroupMemberManagement({
  open,
  onOpenChange,
  conversationId,
  conversationName,
  conversationType = 'group',
  isAdmin,
}: GroupMemberManagementProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isChannel = conversationType === 'channel';

  const [tab, setTab] = useState<Tab>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [adminRights, setAdminRights] = useState<Map<string, AdminRights>>(new Map());
  const [restricted, setRestricted] = useState<RestrictedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const [rightsMember, setRightsMember] = useState<Member | null>(null);
  const [rightsDraft, setRightsDraft] = useState<AdminRights | null>(null);
  const [rightsSaving, setRightsSaving] = useState(false);

  const [pendingRemove, setPendingRemove] = useState<Member | null>(null);
  const [pendingBan, setPendingBan] = useState<Member | null>(null);

  const refresh = async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const [{ data: participantRows, error: participantError }, { data: rightsRows }, { data: banRows }] =
        await Promise.all([
          supabase
            .from('conversation_participants')
            .select(`
              id,
              user_id,
              role,
              joined_at,
              profile:profiles!user_id (
                id,
                username,
                display_name,
                avatar_url,
                is_verified
              )
            `)
            .eq('conversation_id', conversationId),
          db.from('conversation_admin_rights').select('*').eq('conversation_id', conversationId),
          db.from('conversation_bans').select('*').eq('conversation_id', conversationId),
        ]);

      if (participantError) throw participantError;

      const sorted = ((participantRows || []) as Member[]).sort((a, b) => {
        const rank = (role: string | null) => (role === 'owner' ? 0 : role === 'admin' ? 1 : 2);
        const diff = rank(a.role) - rank(b.role);
        if (diff !== 0) return diff;
        return memberName(a).localeCompare(memberName(b));
      });
      setMembers(sorted);

      const rightsMap = new Map<string, AdminRights>();
      for (const row of rightsRows || []) rightsMap.set(row.user_id, row as AdminRights);
      setAdminRights(rightsMap);

      const bans = (banRows || []) as RestrictedMember[];
      if (bans.length > 0) {
        const ids = bans.map((row) => row.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, is_verified')
          .in('id', ids);
        const byId = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
        setRestricted(bans.map((row) => ({ ...row, profile: byId.get(row.user_id) || null })));
      } else {
        setRestricted([]);
      }
    } catch (error) {
      console.error('Conversation members load failed:', error);
      toast({ title: "A'zolarni yuklab bo'lmadi", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setTab('members');
    setSearchQuery('');
    void refresh();
  }, [open, conversationId]);

  const searchUsers = async (query: string) => {
    const value = query.trim();
    setUserQuery(query);
    if (value.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const safe = value.replace(/[,%()]/g, '');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
        .limit(30);
      if (error) throw error;

      const existing = new Set(members.map((member) => member.user_id));
      setSearchResults((data || []).filter((profile) => !existing.has(profile.id)));
    } catch (error) {
      console.error('User search failed:', error);
      setSearchResults([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  const addMembers = async () => {
    if (selectedUsers.length === 0) return;
    try {
      const { error } = await supabase.from('conversation_participants').insert(
        selectedUsers.map((userId) => ({
          conversation_id: conversationId,
          user_id: userId,
          role: 'member',
        })),
      );
      if (error) throw error;
      toast({
        title: isChannel ? 'Obunachilar qo‘shildi' : "A'zolar qo‘shildi",
        description: `${selectedUsers.length} ta foydalanuvchi qo‘shildi`,
      });
      setAddOpen(false);
      setSelectedUsers([]);
      setUserQuery('');
      setSearchResults([]);
      await refresh();
    } catch (error: any) {
      toast({ title: "Qo‘shib bo‘lmadi", description: error?.message, variant: 'destructive' });
    }
  };

  const openRights = (member: Member) => {
    if (member.role === 'owner') return;
    const existing = adminRights.get(member.user_id);
    setRightsMember(member);
    setRightsDraft({
      user_id: member.user_id,
      ...DEFAULT_ADMIN_RIGHTS,
      ...(existing || {}),
    });
  };

  const saveRights = async () => {
    if (!rightsMember || !rightsDraft) return;
    setRightsSaving(true);
    try {
      const payload = {
        conversation_id: conversationId,
        user_id: rightsMember.user_id,
        custom_title: rightsDraft.custom_title || null,
        can_change_info: rightsDraft.can_change_info,
        can_post_messages: rightsDraft.can_post_messages,
        can_edit_messages: rightsDraft.can_edit_messages,
        can_delete_messages: rightsDraft.can_delete_messages,
        can_restrict_members: rightsDraft.can_restrict_members,
        can_invite_users: rightsDraft.can_invite_users,
        can_pin_messages: rightsDraft.can_pin_messages,
        can_manage_video_chats: rightsDraft.can_manage_video_chats,
        can_manage_topics: rightsDraft.can_manage_topics,
        can_promote_members: rightsDraft.can_promote_members,
        is_anonymous: rightsDraft.is_anonymous,
      };

      const { error: rightsError } = await db
        .from('conversation_admin_rights')
        .upsert(payload, { onConflict: 'conversation_id,user_id' });
      if (rightsError) throw rightsError;

      const { error: roleError } = await supabase
        .from('conversation_participants')
        .update({ role: 'admin' })
        .eq('conversation_id', conversationId)
        .eq('user_id', rightsMember.user_id);
      if (roleError) throw roleError;

      toast({ title: 'Admin huquqlari saqlandi' });
      setRightsMember(null);
      setRightsDraft(null);
      await refresh();
    } catch (error: any) {
      toast({ title: 'Admin huquqlari saqlanmadi', description: error?.message, variant: 'destructive' });
    } finally {
      setRightsSaving(false);
    }
  };

  const removeAdmin = async (member: Member) => {
    try {
      await db
        .from('conversation_admin_rights')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', member.user_id);
      const { error } = await supabase
        .from('conversation_participants')
        .update({ role: 'member' })
        .eq('conversation_id', conversationId)
        .eq('user_id', member.user_id);
      if (error) throw error;
      toast({ title: 'Admin huquqi olib tashlandi' });
      await refresh();
    } catch {
      toast({ title: 'Amal bajarilmadi', variant: 'destructive' });
    }
  };

  const removeMember = async (member: Member) => {
    try {
      const { error } = await supabase
        .from('conversation_participants')
        .delete()
        .eq('id', member.id);
      if (error) throw error;
      await db
        .from('conversation_admin_rights')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', member.user_id);
      toast({ title: isChannel ? 'Obunachi olib tashlandi' : "A'zo olib tashlandi" });
      setPendingRemove(null);
      await refresh();
    } catch {
      toast({ title: 'Amal bajarilmadi', variant: 'destructive' });
    }
  };

  const banMember = async (member: Member) => {
    try {
      const { error } = await db.from('conversation_bans').upsert(
        {
          conversation_id: conversationId,
          user_id: member.user_id,
          banned_by: user?.id || null,
          reason: null,
          is_banned: true,
          restrictions: {},
          until_date: null,
        },
        { onConflict: 'conversation_id,user_id' },
      );
      if (error) throw error;
      await supabase
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', member.user_id);
      await db
        .from('conversation_admin_rights')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', member.user_id);
      toast({ title: isChannel ? 'Foydalanuvchi kanaldan bloklandi' : 'Foydalanuvchi guruhdan bloklandi' });
      setPendingBan(null);
      await refresh();
    } catch {
      toast({ title: 'Bloklab bo‘lmadi', variant: 'destructive' });
    }
  };

  const unban = async (row: RestrictedMember) => {
    try {
      await db
        .from('conversation_bans')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', row.user_id);
      toast({ title: 'Cheklov olib tashlandi' });
      await refresh();
    } catch {
      toast({ title: 'Cheklovni olib tashlab bo‘lmadi', variant: 'destructive' });
    }
  };

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let source = members;
    if (tab === 'admins') source = members.filter((member) => member.role === 'owner' || member.role === 'admin');
    if (!q) return source;
    return source.filter((member) => {
      const name = member.profile?.display_name || '';
      const username = member.profile?.username || '';
      return name.toLowerCase().includes(q) || username.toLowerCase().includes(q);
    });
  }, [members, searchQuery, tab]);

  const adminCount = members.filter((member) => member.role === 'owner' || member.role === 'admin').length;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-3 text-base">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                <Users className="h-4 w-4 text-foreground" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {conversationName || (isChannel ? 'Kanal' : 'Guruh')}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {isChannel ? `${members.length} obunachi` : `${members.length} a'zo`} · {adminCount} admin
                </span>
              </span>
            </SheetTitle>
          </SheetHeader>

          <div className="grid grid-cols-3 border-b border-border px-3 py-2">
            {([
              ['members', isChannel ? 'Obunachilar' : "A'zolar", members.length],
              ['admins', 'Adminlar', adminCount],
              ['restricted', 'Cheklangan', restricted.length],
            ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  tab === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {label}
                {count > 0 && <span className="ml-1.5 text-xs opacity-70">{count}</span>}
              </button>
            ))}
          </div>

          {tab !== 'restricted' && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={tab === 'admins' ? 'Adminlarni qidirish' : isChannel ? 'Obunachilarni qidirish' : "A'zolarni qidirish"}
                  className="h-10 rounded-xl border-0 bg-muted/60 pl-9 shadow-none"
                />
              </div>
              {isAdmin && tab === 'members' && (
                <Button className="h-10 rounded-xl px-3" onClick={() => setAddOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Qo‘shish</span>
                </Button>
              )}
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-3">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tab === 'restricted' ? (
                restricted.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Cheklangan foydalanuvchi yo‘q</p>
                    <p className="mt-1 text-xs text-muted-foreground">Ban va cheklovlar shu yerda boshqariladi.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {restricted.map((row) => (
                      <div key={row.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={row.profile?.avatar_url || ''} />
                          <AvatarFallback>{(row.profile?.display_name || row.profile?.username || 'U')[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{row.profile?.display_name || row.profile?.username || 'Foydalanuvchi'}</p>
                          <p className="truncate text-xs text-muted-foreground">{row.is_banned ? 'Bloklangan' : 'Cheklangan'}{row.reason ? ` · ${row.reason}` : ''}</p>
                        </div>
                        {isAdmin && (
                          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => unban(row)}>
                            Tiklash
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : filteredMembers.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-muted-foreground">Natija topilmadi</div>
              ) : (
                <div className="space-y-1">
                  {filteredMembers.map((member) => {
                    const owner = member.role === 'owner';
                    const admin = member.role === 'admin';
                    const me = member.user_id === user?.id;
                    const rights = adminRights.get(member.user_id);
                    return (
                      <div key={member.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60">
                        <Avatar className="h-11 w-11">
                          <AvatarImage src={member.profile?.avatar_url || ''} />
                          <AvatarFallback>{memberName(member)[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{memberName(member)}</span>
                            {member.profile?.is_verified && <VerifiedBadge size="xs" />}
                            {me && <span className="text-[11px] text-muted-foreground">siz</span>}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {member.profile?.username && <span className="truncate">@{member.profile.username}</span>}
                            {rights?.custom_title && <span className="truncate">· {rights.custom_title}</span>}
                          </div>
                        </div>

                        {owner ? (
                          <Badge variant="secondary" className="rounded-lg font-medium">
                            <Crown className="mr-1 h-3 w-3" />
                            Egasi
                          </Badge>
                        ) : admin ? (
                          <Badge variant="outline" className="rounded-lg font-medium">Admin</Badge>
                        ) : null}

                        {isAdmin && !owner && !me && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl">
                              <DropdownMenuItem onClick={() => openRights(member)}>
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {admin ? 'Admin huquqlari' : 'Admin qilish'}
                              </DropdownMenuItem>
                              {admin && (
                                <DropdownMenuItem onClick={() => removeAdmin(member)}>
                                  <UserMinus className="mr-2 h-4 w-4" />
                                  Adminlikdan olish
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setPendingRemove(member)}>
                                <UserMinus className="mr-2 h-4 w-4" />
                                {isChannel ? 'Kanaldan olib tashlash' : 'Guruhdan olib tashlash'}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setPendingBan(member)}>
                                <Ban className="mr-2 h-4 w-4" />
                                Bloklash
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="flex max-h-[82dvh] max-w-md flex-col overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="text-base">{isChannel ? 'Obunachi qo‘shish' : "A'zo qo‘shish"}</DialogTitle>
            <DialogDescription>Username yoki ism orqali qidiring va bir nechta foydalanuvchini tanlang.</DialogDescription>
          </DialogHeader>
          <div className="px-4 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={userQuery}
                onChange={(event) => void searchUsers(event.target.value)}
                placeholder="Foydalanuvchini qidirish..."
                className="rounded-xl pl-9"
              />
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-4 py-3">
            {searchingUsers ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : searchResults.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {userQuery.trim().length < 2 ? 'Qidirish uchun kamida 2 ta belgi kiriting' : 'Foydalanuvchi topilmadi'}
              </div>
            ) : (
              <div className="space-y-1">
                {searchResults.map((profile) => {
                  const selected = selectedUsers.includes(profile.id);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setSelectedUsers((prev) => selected ? prev.filter((id) => id !== profile.id) : [...prev, profile.id])}
                      className={cn('flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-muted', selected && 'bg-muted')}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile.avatar_url || ''} />
                        <AvatarFallback>{(profile.display_name || profile.username || 'U')[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-medium">{profile.display_name || profile.username}</span>
                          {profile.is_verified && <VerifiedBadge size="xs" />}
                        </div>
                        {profile.username && <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>}
                      </div>
                      <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', selected && 'border-foreground bg-foreground text-background')}>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <div className="flex items-center justify-between border-t border-border p-4">
            <span className="text-xs text-muted-foreground">{selectedUsers.length} ta tanlandi</span>
            <Button disabled={selectedUsers.length === 0} onClick={addMembers} className="rounded-xl">Qo‘shish</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rightsMember)} onOpenChange={(next) => !next && setRightsMember(null)}>
        <DialogContent className="flex max-h-[88dvh] max-w-lg flex-col overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8 rounded-full" onClick={() => setRightsMember(null)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base">Admin huquqlari</DialogTitle>
                <DialogDescription className="truncate">{rightsMember ? memberName(rightsMember) : ''}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {rightsDraft && (
            <>
              <div className="border-b border-border px-5 py-4">
                <Input
                  value={rightsDraft.custom_title || ''}
                  onChange={(event) => setRightsDraft({ ...rightsDraft, custom_title: event.target.value.slice(0, 32) })}
                  placeholder="Admin lavozimi (masalan: Moderator)"
                  className="rounded-xl"
                />
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1 p-3">
                  {ADMIN_RIGHT_LABELS.filter((item) => !item.channelOnly || isChannel).map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 hover:bg-muted/60">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.hint}</p>
                      </div>
                      <Switch
                        checked={Boolean(rightsDraft[item.key])}
                        onCheckedChange={(checked) => setRightsDraft({ ...rightsDraft, [item.key]: checked })}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="border-t border-border p-4">
                <Button className="w-full rounded-xl" disabled={rightsSaving} onClick={saveRights}>
                  {rightsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Admin huquqlarini saqlash
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingRemove)} onOpenChange={(next) => !next && setPendingRemove(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{isChannel ? 'Obunachini olib tashlash' : "A'zoni olib tashlash"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove ? memberName(pendingRemove) : ''} qayta taklif orqali qo‘shilishi mumkin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingRemove && void removeMember(pendingRemove)}>Olib tashlash</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingBan)} onOpenChange={(next) => !next && setPendingBan(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Foydalanuvchini bloklash</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBan ? memberName(pendingBan) : ''} chiqariladi va qayta qo‘shila olmaydi. Keyin “Cheklangan” bo‘limidan tiklash mumkin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => pendingBan && void banMember(pendingBan)}>
              Bloklash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
