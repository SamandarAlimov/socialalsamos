import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileLock2,
  Globe2,
  Hash,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Save,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  AUTO_DELETE_OPTIONS,
  ConversationPermissions,
  SLOW_MODE_OPTIONS,
  useConversationPremium,
} from '@/hooks/useConversationPremium';
import { uploadMedia } from '@/lib/mediaUpload';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export type SettingsTab =
  | 'profile'
  | 'access'
  | 'permissions'
  | 'content'
  | 'moderation'
  | 'links'
  | 'requests'
  | 'topics';

interface GroupChannelSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  conversationType: 'group' | 'channel';
  isAdmin: boolean;
  initialTab?: SettingsTab;
  onManageMembers?: () => void;
}

const REACTION_PRESETS = ['👍', '❤️', '🔥', '👏', '😂', '😮', '😢', '🎉'];

const PERMISSION_GROUPS: Array<{
  title: string;
  items: Array<{
    key: keyof ConversationPermissions;
    label: string;
    hint: string;
  }>;
}> = [
  {
    title: 'Xabarlar',
    items: [
      { key: 'send_messages', label: 'Matnli xabarlar', hint: 'Oddiy xabar yuborish' },
      { key: 'send_media', label: 'Media', hint: 'Rasm, video va fayllar' },
      { key: 'send_voice', label: 'Ovozli xabarlar', hint: 'Audio yozuvlar yuborish' },
      { key: 'send_video_messages', label: 'Video xabarlar', hint: 'Kamera orqali qisqa video' },
      { key: 'send_stickers', label: 'Stiker va GIF', hint: 'Stikerlar va animatsiyalar' },
    ],
  },
  {
    title: 'Interaktiv',
    items: [
      { key: 'send_polls', label: "So‘rovnomalar", hint: 'Poll yaratish' },
      { key: 'embed_links', label: 'Havola preview', hint: 'Sayt previewlarini ko‘rsatish' },
      { key: 'add_members', label: "A’zo taklif qilish", hint: 'Yangi foydalanuvchilarni qo‘shish' },
    ],
  },
  {
    title: 'Boshqaruv',
    items: [
      { key: 'pin_messages', label: 'Xabarlarni qadash', hint: 'Muhim xabarlarni mahkamlash' },
      { key: 'change_info', label: "Ma’lumotni o‘zgartirish", hint: 'Nomi, rasmi va tavsifini yangilash' },
      { key: 'manage_topics', label: 'Topiklarni boshqarish', hint: 'Forum bo‘limlarini yaratish' },
    ],
  },
];

const INVITE_EXPIRY = [
  { value: 0, label: 'Muddatsiz' },
  { value: 3600, label: '1 soat' },
  { value: 86400, label: '1 kun' },
  { value: 604800, label: '7 kun' },
  { value: 2592000, label: '30 kun' },
];

function formatDuration(seconds: number) {
  if (seconds === 0) return 'O‘chirilgan';
  if (seconds < 60) return `${seconds} soniya`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} daqiqa`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} soat`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)} kun`;
  return `${Math.round(seconds / 604800)} hafta`;
}

function Section({
  title,
  hint,
  children,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      {(title || hint) && (
        <div className="px-1">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </section>
  );
}

function SettingRow({
  icon: Icon,
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  trailing,
}: {
  icon?: typeof ShieldCheck;
  label: string;
  hint?: string;
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[64px] items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
      {Icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-4 w-4 text-foreground" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
      </div>
      {trailing ??
        (typeof checked === 'boolean' && onCheckedChange ? (
          <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
        ) : null)}
    </div>
  );
}

export function GroupChannelSettingsSheet({
  open,
  onOpenChange,
  conversationId,
  conversationType,
  isAdmin,
  initialTab = 'profile',
  onManageMembers,
}: GroupChannelSettingsSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isChannel = conversationType === 'channel';

  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [memberCount, setMemberCount] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [profileDraft, setProfileDraft] = useState({ name: '', description: '', username: '' });
  const [profileDirty, setProfileDirty] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [linkTitle, setLinkTitle] = useState('');
  const [linkLimit, setLinkLimit] = useState('');
  const [linkApproval, setLinkApproval] = useState(false);
  const [linkExpiry, setLinkExpiry] = useState(0);
  const [creatingLink, setCreatingLink] = useState(false);

  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [discussionCandidates, setDiscussionCandidates] = useState<Array<{ id: string; name: string | null }>>([]);

  const {
    settings,
    inviteLinks,
    joinRequests,
    topics,
    isLoading,
    isSaving,
    updateSettings,
    updatePermission,
    createInviteLink,
    revokeInviteLink,
    deleteInviteLink,
    approveJoinRequest,
    declineJoinRequest,
    createTopic,
    updateTopic,
    deleteTopic,
  } = useConversationPremium(open ? conversationId : null);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!settings) return;
    setProfileDraft({
      name: settings.name || '',
      description: settings.description || '',
      username: settings.username || '',
    });
    setProfileDirty(false);
  }, [settings?.id]);

  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;

    const loadStats = async () => {
      const { data } = await supabase
        .from('conversation_participants')
        .select('role')
        .eq('conversation_id', conversationId);
      if (cancelled) return;
      const rows = data || [];
      setMemberCount(rows.length);
      setAdminCount(rows.filter((row) => row.role === 'owner' || row.role === 'admin').length);
    };

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  useEffect(() => {
    if (!open || !isChannel || !user?.id) {
      setDiscussionCandidates([]);
      return;
    }

    let cancelled = false;
    const loadCandidates = async () => {
      const { data: memberships } = await supabase
        .from('conversation_participants')
        .select('conversation_id, role')
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin']);

      const ids = (memberships || []).map((row) => row.conversation_id);
      if (ids.length === 0) {
        if (!cancelled) setDiscussionCandidates([]);
        return;
      }

      const { data: groups } = await supabase
        .from('conversations')
        .select('id, name')
        .in('id', ids)
        .eq('type', 'group')
        .order('name');

      if (!cancelled) setDiscussionCandidates((groups || []) as Array<{ id: string; name: string | null }>);
    };

    void loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [open, isChannel, user?.id]);

  const tabs = useMemo(() => {
    const items: Array<{ id: SettingsTab; label: string; icon: typeof Sparkles; badge?: number }> = [
      { id: 'profile', label: 'Profil', icon: Sparkles },
      { id: 'access', label: 'Kirish', icon: Globe2 },
      { id: 'permissions', label: 'Ruxsatlar', icon: ShieldCheck },
      { id: 'content', label: 'Kontent', icon: MessagesSquare },
      { id: 'moderation', label: 'Moderatsiya', icon: FileLock2 },
      { id: 'links', label: 'Taklif havolalari', icon: Link2 },
      { id: 'requests', label: 'So‘rovlar', icon: UserCheck, badge: joinRequests.length },
    ];
    if (!isChannel) items.push({ id: 'topics', label: 'Topiklar', icon: Hash, badge: topics.length });
    return items;
  }, [isChannel, joinRequests.length, topics.length]);

  const publicUrl = settings?.username
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/${isChannel ? 'channel' : 'group'}/${settings.username}`
    : null;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Havola nusxalandi' });
    } catch {
      toast({ title: 'Nusxa olib bo‘lmadi', variant: 'destructive' });
    }
  };

  const saveProfile = async () => {
    const username = profileDraft.username
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '')
      .toLowerCase();

    if (settings?.is_public && username.length > 0 && username.length < 4) {
      toast({ title: 'Ommaviy manzil kamida 4 ta belgidan iborat bo‘lsin', variant: 'destructive' });
      return;
    }

    const ok = await updateSettings({
      name: profileDraft.name.trim() || null,
      description: profileDraft.description.trim() || null,
      username: username || null,
    });
    if (ok) {
      setProfileDirty(false);
      toast({ title: 'Ma’lumotlar saqlandi' });
    } else {
      toast({ title: 'Saqlab bo‘lmadi', variant: 'destructive' });
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !isAdmin) return;
    setAvatarUploading(true);
    try {
      const uploaded = await uploadMedia(file, { type: 'chat', visibility: 'public' });
      const ok = await updateSettings({ avatar_url: uploaded.url });
      if (!ok) throw new Error('save_failed');
      toast({ title: isChannel ? 'Kanal rasmi yangilandi' : 'Guruh rasmi yangilandi' });
    } catch {
      toast({ title: 'Rasmni yangilab bo‘lmadi', variant: 'destructive' });
    } finally {
      setAvatarUploading(false);
    }
  };

  const createLink = async () => {
    setCreatingLink(true);
    const link = await createInviteLink({
      title: linkTitle.trim() || undefined,
      memberLimit: linkLimit ? Math.max(1, Number(linkLimit)) : null,
      requiresApproval: linkApproval,
      expiresInSeconds: linkExpiry || null,
    });
    setCreatingLink(false);

    if (!link) {
      toast({ title: 'Taklif havolasi yaratilmadi', variant: 'destructive' });
      return;
    }

    setLinkTitle('');
    setLinkLimit('');
    setLinkApproval(false);
    setLinkExpiry(0);
    toast({ title: 'Yangi taklif havolasi yaratildi' });
  };

  const createNewTopic = async () => {
    const title = newTopicTitle.trim();
    if (!title) return;
    const result = await createTopic(title);
    if (result) {
      setNewTopicTitle('');
      toast({ title: 'Topik yaratildi' });
    }
  };

  const toggleReaction = async (emoji: string) => {
    if (!settings) return;
    const selected = settings.allowed_reactions || [];
    const next = selected.includes(emoji)
      ? selected.filter((item) => item !== emoji)
      : [...selected, emoji];
    await updateSettings({ allowed_reactions: next });
  };

  const nav = (
    <nav className="space-y-1">
      {tabs.map(({ id, label, icon: Icon, badge }) => (
        <button
          key={id}
          type="button"
          onClick={() => setTab(id)}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
            tab === id
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {badge ? (
            <span className={cn('rounded-full px-1.5 text-[11px]', tab === id ? 'bg-background/15' : 'bg-muted')}>
              {badge}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-3 text-base">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
              {isChannel ? <MessagesSquare className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {settings?.name || (isChannel ? 'Kanal sozlamalari' : 'Guruh sozlamalari')}
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                {isChannel ? 'Kanal boshqaruvi' : 'Guruh boshqaruvi'}
                {isSaving ? ' · saqlanmoqda…' : ''}
              </span>
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="border-b border-border p-2 sm:hidden">
          <div className="scrollbar-hide flex gap-1 overflow-x-auto">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium',
                  tab === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {badge ? <span className="opacity-70">{badge}</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 sm:grid-cols-[190px_minmax(0,1fr)]">
          <aside className="hidden border-r border-border p-3 sm:block">{nav}</aside>

          <ScrollArea className="min-h-0">
            <div className="mx-auto max-w-xl space-y-5 p-4 pb-10 sm:p-6">
              {isLoading && !settings ? (
                <div className="flex justify-center py-24">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : null}

              {settings && tab === 'profile' && (
                <>
                  <div className="flex flex-col items-center py-2 text-center">
                    <label className={cn('group relative', isAdmin ? 'cursor-pointer' : 'cursor-default')}>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={!isAdmin}
                        onChange={uploadAvatar}
                      />
                      <Avatar className="h-24 w-24 ring-1 ring-border">
                        <AvatarImage src={settings.avatar_url || ''} />
                        <AvatarFallback className="text-xl">
                          {(settings.name || (isChannel ? 'K' : 'G'))[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {isAdmin && (
                        <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-foreground text-background shadow-sm">
                          {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        </span>
                      )}
                    </label>
                    <h2 className="mt-3 text-lg font-semibold">{settings.name || (isChannel ? 'Kanal' : 'Guruh')}</h2>
                    <p className="text-sm text-muted-foreground">
                      {isChannel ? `${memberCount} obunachi` : `${memberCount} a’zo`} · {adminCount} admin
                    </p>
                  </div>

                  <Section title="Asosiy ma’lumotlar" hint="Nomi va tavsifi platformadagi profil, qidiruv va taklif sahifalarida ko‘rinadi.">
                    <div className="space-y-4 p-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="community-name">{isChannel ? 'Kanal nomi' : 'Guruh nomi'}</Label>
                        <Input
                          id="community-name"
                          value={profileDraft.name}
                          disabled={!isAdmin}
                          maxLength={120}
                          onChange={(event) => {
                            setProfileDraft((prev) => ({ ...prev, name: event.target.value }));
                            setProfileDirty(true);
                          }}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="community-description">Tavsif</Label>
                        <Textarea
                          id="community-description"
                          value={profileDraft.description}
                          disabled={!isAdmin}
                          maxLength={500}
                          rows={4}
                          onChange={(event) => {
                            setProfileDraft((prev) => ({ ...prev, description: event.target.value }));
                            setProfileDirty(true);
                          }}
                          placeholder={isChannel ? 'Kanal nima haqida?' : 'Guruh nima haqida?'}
                          className="resize-none rounded-xl"
                        />
                        <p className="text-right text-[11px] text-muted-foreground">{profileDraft.description.length}/500</p>
                      </div>
                      {isAdmin && (
                        <Button disabled={!profileDirty || isSaving} onClick={saveProfile} className="w-full rounded-xl">
                          <Save className="mr-2 h-4 w-4" />
                          O‘zgarishlarni saqlash
                        </Button>
                      )}
                    </div>
                  </Section>

                  <Section>
                    <button
                      type="button"
                      onClick={onManageMembers}
                      disabled={!onManageMembers}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/60 disabled:cursor-default"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <Users className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{isChannel ? 'Obunachilar va adminlar' : 'A’zolar va adminlar'}</span>
                        <span className="block text-xs text-muted-foreground">Rollar, admin huquqlari, remove va ban boshqaruvi</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </Section>
                </>
              )}

              {settings && tab === 'access' && (
                <>
                  <Section title="Ko‘rinish" hint="Ommaviy joylar qidiruvda topiladi. Yopiq joylarga faqat taklif orqali kiriladi.">
                    <SettingRow
                      icon={settings.is_public ? Globe2 : Lock}
                      label={settings.is_public ? 'Ommaviy' : 'Yopiq'}
                      hint={
                        settings.is_public
                          ? 'Har kim topishi va qo‘shilishi mumkin'
                          : 'Faqat taklif qilingan foydalanuvchilar kiradi'
                      }
                      checked={Boolean(settings.is_public)}
                      onCheckedChange={(value) => updateSettings({ is_public: value })}
                      disabled={!isAdmin}
                    />
                    <SettingRow
                      icon={UserCheck}
                      label="Qo‘shilishni tasdiqlash"
                      hint="Yangi foydalanuvchi admin tasdig‘idan keyin qo‘shiladi"
                      checked={settings.join_by_request}
                      onCheckedChange={(value) => updateSettings({ join_by_request: value })}
                      disabled={!isAdmin}
                    />
                  </Section>

                  {settings.is_public && (
                    <Section title="Ommaviy manzil" hint="Qisqa va esda qoladigan username tanlang.">
                      <div className="space-y-3 p-4">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                          <Input
                            value={profileDraft.username}
                            disabled={!isAdmin}
                            maxLength={32}
                            onChange={(event) => {
                              setProfileDraft((prev) => ({
                                ...prev,
                                username: event.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(),
                              }));
                              setProfileDirty(true);
                            }}
                            className="rounded-xl pl-7"
                            placeholder={isChannel ? 'kanal_nomi' : 'guruh_nomi'}
                          />
                        </div>
                        {publicUrl && (
                          <button
                            type="button"
                            onClick={() => copyText(publicUrl)}
                            className="flex w-full items-center justify-between rounded-xl bg-muted px-3 py-2.5 text-left text-xs text-muted-foreground hover:text-foreground"
                          >
                            <span className="truncate">{publicUrl}</span>
                            <Copy className="ml-3 h-3.5 w-3.5 shrink-0" />
                          </button>
                        )}
                        {isAdmin && profileDirty && (
                          <Button size="sm" className="w-full rounded-xl" onClick={saveProfile}>
                            Manzilni saqlash
                          </Button>
                        )}
                      </div>
                    </Section>
                  )}

                  <Section>
                    <button
                      type="button"
                      onClick={() => setTab('links')}
                      className="flex w-full items-center gap-3 border-b border-border/70 px-4 py-3.5 text-left hover:bg-muted/60"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted"><Link2 className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">Taklif havolalari</span>
                        <span className="block text-xs text-muted-foreground">{inviteLinks.length} ta havola</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('requests')}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/60"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted"><UserCheck className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">Qo‘shilish so‘rovlari</span>
                        <span className="block text-xs text-muted-foreground">{joinRequests.length} ta kutilayotgan so‘rov</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </Section>
                </>
              )}

              {settings && tab === 'permissions' && (
                <>
                  {isChannel ? (
                    <Section title="Kanal huquqlari" hint="Oddiy obunachilar kanalga post joylamaydi. Kontent admin huquqlari orqali boshqariladi.">
                      <SettingRow
                        icon={UserPlus}
                        label="Obunachi taklif qilish"
                        hint="A’zolar boshqa foydalanuvchilarni taklif qila oladi"
                        checked={settings.permissions.add_members}
                        onCheckedChange={(value) => updatePermission('add_members', value)}
                        disabled={!isAdmin}
                      />
                      <SettingRow
                        icon={MessageCircle}
                        label="Reaksiyalar"
                        hint="Postlarga reaksiya qoldirish imkoniyati Kontent bo‘limida boshqariladi"
                        trailing={<Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setTab('content')}>Sozlash</Button>}
                      />
                      <SettingRow
                        icon={ShieldCheck}
                        label="Admin huquqlari"
                        hint="Post joylash, tahrirlash, o‘chirish va boshqa huquqlar individual beriladi"
                        trailing={
                          <Button variant="outline" size="sm" className="rounded-lg" onClick={onManageMembers} disabled={!onManageMembers}>
                            Adminlar
                          </Button>
                        }
                      />
                    </Section>
                  ) : (
                    <div className="space-y-5">
                      {PERMISSION_GROUPS.map((group) => (
                        <Section key={group.title} title={group.title}>
                          {group.items.map((item) => (
                            <SettingRow
                              key={item.key}
                              label={item.label}
                              hint={item.hint}
                              checked={settings.permissions[item.key]}
                              onCheckedChange={(value) => updatePermission(item.key, value)}
                              disabled={!isAdmin}
                            />
                          ))}
                        </Section>
                      ))}
                    </div>
                  )}
                </>
              )}

              {settings && tab === 'content' && (
                <>
                  {!isChannel && (
                    <Section title="Sekin rejim" hint="Floodni kamaytirish uchun oddiy a’zolar xabarlar orasida kutadi. Adminlarga ta’sir qilmaydi.">
                      <div className="flex flex-wrap gap-2 p-4">
                        {SLOW_MODE_OPTIONS.map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => updateSettings({ slow_mode_seconds: value })}
                            className={cn(
                              'rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
                              settings.slow_mode_seconds === value
                                ? 'bg-foreground text-background'
                                : 'bg-muted text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {value === 0 ? 'O‘chiq' : formatDuration(value)}
                          </button>
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section title="Avtomatik o‘chirish" hint="Yangi xabarlar belgilangan muddatdan keyin avtomatik tozalanadi.">
                    <div className="flex flex-wrap gap-2 p-4">
                      {AUTO_DELETE_OPTIONS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => updateSettings({ auto_delete_seconds: value })}
                          className={cn(
                            'rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
                            settings.auto_delete_seconds === value
                              ? 'bg-foreground text-background'
                              : 'bg-muted text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {formatDuration(value)}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title="Reaksiyalar" hint="Barcha reaksiyalar, tanlangan emoji yoki butunlay o‘chirilgan holat.">
                    <div className="space-y-3 p-4">
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ['all', 'Hammasi'],
                          ['some', 'Tanlangan'],
                          ['none', 'O‘chiq'],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => updateSettings({ reactions_mode: value })}
                            className={cn(
                              'rounded-xl px-3 py-2 text-xs font-medium',
                              settings.reactions_mode === value
                                ? 'bg-foreground text-background'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {settings.reactions_mode === 'some' && (
                        <div className="flex flex-wrap gap-2">
                          {REACTION_PRESETS.map((emoji) => {
                            const active = (settings.allowed_reactions || []).includes(emoji);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                disabled={!isAdmin}
                                onClick={() => toggleReaction(emoji)}
                                className={cn(
                                  'flex h-10 w-10 items-center justify-center rounded-xl border text-lg',
                                  active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background',
                                )}
                              >
                                {emoji}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </Section>

                  {isChannel ? (
                    <>
                      <Section title="Kanal postlari">
                        <SettingRow
                          icon={UserCheck}
                          label="Muallif imzosi"
                          hint="Post ostida uni joylagan admin nomi ko‘rinadi"
                          checked={settings.sign_messages}
                          onCheckedChange={(value) => updateSettings({ sign_messages: value })}
                          disabled={!isAdmin}
                        />
                      </Section>

                      <Section title="Muhokama guruhi" hint="Kanal postlari uchun izoh va muhokamalarni alohida guruh bilan bog‘lash mumkin.">
                        <div className="p-4">
                          <select
                            value={settings.linked_chat_id || ''}
                            disabled={!isAdmin}
                            onChange={(event) => updateSettings({ linked_chat_id: event.target.value || null })}
                            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Bog‘lanmagan</option>
                            {discussionCandidates.map((group) => (
                              <option key={group.id} value={group.id}>{group.name || 'Nomsiz guruh'}</option>
                            ))}
                          </select>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Siz admin bo‘lgan guruhlar ko‘rsatiladi.
                          </p>
                        </div>
                      </Section>
                    </>
                  ) : (
                    <Section title="Forum rejimi">
                      <SettingRow
                        icon={Hash}
                        label="Topiklar"
                        hint="Katta guruhni mavzular bo‘yicha bo‘limlarga ajratadi"
                        checked={settings.is_forum}
                        onCheckedChange={(value) => updateSettings({ is_forum: value })}
                        disabled={!isAdmin}
                      />
                      {settings.is_forum && (
                        <button
                          type="button"
                          onClick={() => setTab('topics')}
                          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/60"
                        >
                          Topiklarni boshqarish
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                    </Section>
                  )}
                </>
              )}

              {settings && tab === 'moderation' && (
                <>
                  <Section title="Kontent himoyasi">
                    <SettingRow
                      icon={FileLock2}
                      label="Nusxa olishni cheklash"
                      hint="Forward, media saqlash va kontentni tashqariga chiqarishni cheklaydi"
                      checked={settings.restrict_saving_content}
                      onCheckedChange={(value) => updateSettings({ restrict_saving_content: value })}
                      disabled={!isAdmin}
                    />
                    {!isChannel && (
                      <SettingRow
                        icon={Users}
                        label="A’zolar ro‘yxatini yashirish"
                        hint="Oddiy a’zolar to‘liq a’zolar ro‘yxatini ko‘rmaydi"
                        checked={settings.hide_members}
                        onCheckedChange={(value) => updateSettings({ hide_members: value })}
                        disabled={!isAdmin}
                      />
                    )}
                  </Section>

                  <Section title="Anti-spam" hint="Shubhali kontent va ommaviy yuborishlarni avtomatik filtrlash.">
                    <SettingRow
                      icon={ShieldCheck}
                      label="Avtomatik anti-spam"
                      hint="Xavfli va takroriy xabarlarni filtrlash"
                      checked={settings.anti_spam}
                      onCheckedChange={(value) => updateSettings({ anti_spam: value })}
                      disabled={!isAdmin}
                    />
                    {settings.anti_spam && (
                      <SettingRow
                        icon={Ban}
                        label="Kuchaytirilgan filtr"
                        hint="Yuqori xavfli xabarlar uchun qat’iyroq moderatsiya"
                        checked={settings.aggressive_anti_spam}
                        onCheckedChange={(value) => updateSettings({ aggressive_anti_spam: value })}
                        disabled={!isAdmin}
                      />
                    )}
                  </Section>

                  <Section>
                    <button
                      type="button"
                      onClick={onManageMembers}
                      disabled={!onManageMembers}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/60"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted"><Ban className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">A’zolar, adminlar va bloklar</span>
                        <span className="block text-xs text-muted-foreground">Rollar, granular admin huquqlari va ban ro‘yxati</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </Section>
                </>
              )}

              {tab === 'links' && (
                <>
                  {isAdmin && (
                    <Section title="Yangi taklif havolasi" hint="Har bir manba uchun alohida link yaratib, limit va amal qilish muddatini boshqarishingiz mumkin.">
                      <div className="space-y-3 p-4">
                        <Input
                          value={linkTitle}
                          onChange={(event) => setLinkTitle(event.target.value)}
                          placeholder="Nomi, masalan: Instagram"
                          maxLength={64}
                          className="rounded-xl"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={linkLimit}
                            onChange={(event) => setLinkLimit(event.target.value.replace(/\D/g, ''))}
                            placeholder="A’zolar limiti"
                            inputMode="numeric"
                            className="rounded-xl"
                          />
                          <select
                            value={linkExpiry}
                            onChange={(event) => setLinkExpiry(Number(event.target.value))}
                            className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                          >
                            {INVITE_EXPIRY.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5">
                          <div>
                            <p className="text-sm font-medium">Admin tasdig‘i</p>
                            <p className="text-xs text-muted-foreground">Havola orqali kelganlar so‘rov yuboradi</p>
                          </div>
                          <Switch checked={linkApproval} onCheckedChange={setLinkApproval} />
                        </div>
                        <Button className="w-full rounded-xl" disabled={creatingLink} onClick={createLink}>
                          {creatingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                          Havola yaratish
                        </Button>
                      </div>
                    </Section>
                  )}

                  <Section title="Faol havolalar">
                    {inviteLinks.length === 0 ? (
                      <div className="px-5 py-10 text-center text-sm text-muted-foreground">Taklif havolasi yo‘q</div>
                    ) : (
                      inviteLinks.map((link) => {
                        const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${link.slug}`;
                        return (
                          <div key={link.id} className={cn('flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0', link.is_revoked && 'opacity-50')}>
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted"><Link2 className="h-4 w-4" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{link.title || 'Taklif havolasi'}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {link.used_count} marta ishlatilgan
                                {link.member_limit ? ` · limit ${link.member_limit}` : ''}
                                {link.requires_approval ? ' · tasdiq bilan' : ''}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                                <DropdownMenuItem onClick={() => copyText(url)}>
                                  <Copy className="mr-2 h-4 w-4" /> Nusxa olish
                                </DropdownMenuItem>
                                {isAdmin && !link.is_revoked && (
                                  <DropdownMenuItem onClick={() => revokeInviteLink(link.id)}>
                                    <Ban className="mr-2 h-4 w-4" /> Bekor qilish
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => deleteInviteLink(link.id)}>
                                      <Trash2 className="mr-2 h-4 w-4" /> O‘chirish
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })
                    )}
                  </Section>
                </>
              )}

              {tab === 'requests' && (
                <Section title="Qo‘shilish so‘rovlari" hint="Tasdiqlangan foydalanuvchi avtomatik a’zo/obunachi bo‘ladi.">
                  {joinRequests.length === 0 ? (
                    <div className="px-5 py-14 text-center">
                      <UserCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm font-medium">Kutilayotgan so‘rov yo‘q</p>
                    </div>
                  ) : (
                    joinRequests.map((request) => (
                      <div key={request.id} className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={request.profile?.avatar_url || ''} />
                          <AvatarFallback>{(request.profile?.display_name || request.profile?.username || 'U')[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{request.profile?.display_name || request.profile?.username || 'Foydalanuvchi'}</p>
                          <p className="truncate text-xs text-muted-foreground">{request.profile?.username ? `@${request.profile.username}` : request.bio || 'Qo‘shilish so‘rovi'}</p>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => declineJoinRequest(request)}>
                              <Ban className="h-4 w-4" />
                            </Button>
                            <Button size="icon" className="h-9 w-9 rounded-full" onClick={() => approveJoinRequest(request)}>
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </Section>
              )}

              {!isChannel && tab === 'topics' && (
                <>
                  <Section title="Forum topiklari" hint="Mavzularni alohida oqimlarga ajrating. Pinned topiklar yuqorida turadi.">
                    {isAdmin && (
                      <div className="flex gap-2 border-b border-border/70 p-4">
                        <Input
                          value={newTopicTitle}
                          onChange={(event) => setNewTopicTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void createNewTopic();
                          }}
                          placeholder="Yangi topik nomi"
                          maxLength={80}
                          className="rounded-xl"
                        />
                        <Button onClick={createNewTopic} disabled={!newTopicTitle.trim()} className="rounded-xl">
                          Yaratish
                        </Button>
                      </div>
                    )}
                    {topics.length === 0 ? (
                      <div className="px-5 py-12 text-center text-sm text-muted-foreground">Topik hali yaratilmagan</div>
                    ) : (
                      topics.map((topic) => (
                        <div key={topic.id} className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-base">{topic.icon_emoji || '#'}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{topic.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {topic.is_general ? 'Asosiy topik' : topic.is_closed ? 'Yopilgan' : 'Faol'}
                              {topic.is_pinned ? ' · qadlangan' : ''}
                            </p>
                          </div>
                          {isAdmin && !topic.is_general && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                                <DropdownMenuItem onClick={() => updateTopic(topic.id, { is_pinned: !topic.is_pinned })}>
                                  {topic.is_pinned ? 'Qadashni olish' : 'Qadash'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateTopic(topic.id, { is_closed: !topic.is_closed })}>
                                  {topic.is_closed ? 'Qayta ochish' : 'Yopish'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => deleteTopic(topic.id)}>
                                  <Trash2 className="mr-2 h-4 w-4" /> O‘chirish
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      ))
                    )}
                  </Section>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default GroupChannelSettingsSheet;
