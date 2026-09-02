import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useConversationPremium,
  ConversationPermissions,
  SLOW_MODE_OPTIONS,
  AUTO_DELETE_OPTIONS,
} from '@/hooks/useConversationPremium';
import {
  Settings2,
  ShieldCheck,
  Link2,
  UserPlus,
  Hash,
  Rocket,
  Copy,
  Trash2,
  Ban,
  Check,
  X,
  Timer,
  Clock,
  Loader2,
  Sparkles,
} from 'lucide-react';

export type SettingsTab =
  | 'general'
  | 'permissions'
  | 'links'
  | 'requests'
  | 'topics'
  | 'boost';

interface GroupChannelSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  conversationType: 'group' | 'channel';
  isAdmin: boolean;
  /** Oyna ochilganda qaysi bo'lim faol bo'lsin */
  initialTab?: SettingsTab;
}

const MIDDLE_DOT = '\u00b7';

const PERMISSION_LABELS: Array<{
  key: keyof ConversationPermissions;
  label: string;
  hint?: string;
}> = [
  { key: 'send_messages', label: 'Xabar yuborish' },
  { key: 'send_media', label: 'Rasm va video' },
  { key: 'send_stickers', label: 'Stiker va GIF' },
  { key: 'send_polls', label: "So'rovnoma (poll)" },
  { key: 'send_voice', label: 'Ovozli xabar' },
  { key: 'send_video_messages', label: 'Video xabar' },
  { key: 'embed_links', label: 'Havola oldi ko\u2018rinishi' },
  { key: 'add_members', label: "A'zo qo'shish" },
  { key: 'pin_messages', label: 'Xabar qadash' },
  { key: 'change_info', label: "Ma'lumotni o'zgartirish" },
  { key: 'manage_topics', label: 'Topiklarni boshqarish' },
];

const BOOST_PERKS = [
  '1-daraja: maxsus reaksiyalar va chat foni',
  '2-daraja: emoji status va kengaytirilgan statistika',
  "3-daraja: maxsus emoji to'plami",
  '4-daraja: profil rangi va gradient',
  "5-daraja: reklamasiz ko'rinish va maxsus nishon",
];

function formatSlowMode(seconds: number): string {
  if (seconds === 0) return "O'chirilgan";
  if (seconds < 60) return `${seconds} soniya`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} daqiqa`;
  return `${Math.round(seconds / 3600)} soat`;
}

function formatAutoDelete(seconds: number): string {
  if (seconds === 0) return "O'chirilgan";
  if (seconds === 86400) return '1 kun';
  if (seconds === 604800) return '7 kun';
  return '1 oy';
}

/**
 * Guruh va kanallar uchun Telegram (Premium) darajasidagi sozlamalar oynasi.
 */
export function GroupChannelSettingsSheet({
  open,
  onOpenChange,
  conversationId,
  conversationType,
  isAdmin,
  initialTab = 'general',
}: GroupChannelSettingsSheetProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkLimit, setLinkLimit] = useState('');
  const [linkApproval, setLinkApproval] = useState(false);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const {
    settings,
    inviteLinks,
    joinRequests,
    topics,
    isLoading,
    isSaving,
    nextBoostGoal,
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
    boostConversation,
    removeBoost,
  } = useConversationPremium(open ? conversationId : null);

  const isChannel = conversationType === 'channel';

  const tabs = useMemo(() => {
    const list: Array<{ id: SettingsTab; label: string; icon: typeof Settings2 }> = [
      { id: 'general', label: 'Umumiy', icon: Settings2 },
      { id: 'permissions', label: 'Ruxsatlar', icon: ShieldCheck },
      { id: 'links', label: 'Havolalar', icon: Link2 },
      { id: 'requests', label: "So'rovlar", icon: UserPlus },
    ];
    if (!isChannel) list.push({ id: 'topics', label: 'Topiklar', icon: Hash });
    list.push({ id: 'boost', label: 'Boost', icon: Rocket });
    return list;
  }, [isChannel]);

  const publicUrl = (slug: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${slug}`;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Nusxa olindi' });
    } catch {
      toast({ title: 'Nusxa olib bo\u2018lmadi', variant: 'destructive' });
    }
  };

  const handleCreateLink = async () => {
    const link = await createInviteLink({
      title: linkTitle || undefined,
      memberLimit: linkLimit ? Number(linkLimit) : null,
      requiresApproval: linkApproval,
    });
    if (link) {
      setLinkTitle('');
      setLinkLimit('');
      setLinkApproval(false);
      toast({ title: 'Havola yaratildi' });
    } else {
      toast({ title: 'Havola yaratilmadi', variant: 'destructive' });
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopicTitle.trim()) return;
    const topic = await createTopic(newTopicTitle.trim());
    if (topic) {
      setNewTopicTitle('');
      toast({ title: 'Topik yaratildi' });
    }
  };

  const Row = ({
    label,
    hint,
    checked,
    onChange,
    disabled,
  }: {
    label: string;
    hint?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
  }) => (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-accent/40">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled || !isAdmin} />
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            {isChannel ? 'Kanal sozlamalari' : 'Guruh sozlamalari'}
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </SheetTitle>
        </SheetHeader>

        {/* Bo'limlar */}
        <div className="scrollbar-hide flex flex-shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'tg-transition flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
                tab === id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {id === 'requests' && joinRequests.length > 0 && (
                <span className="ml-0.5 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">
                  {joinRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            {isLoading && !settings && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {settings && tab === 'general' && (
              <>
                <div className="space-y-2">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Asosiy
                  </p>
                  <Input
                    value={settings.name || ''}
                    disabled={!isAdmin}
                    onChange={(e) => updateSettings({ name: e.target.value })}
                    placeholder={isChannel ? 'Kanal nomi' : 'Guruh nomi'}
                  />
                  <Input
                    value={settings.description || ''}
                    disabled={!isAdmin}
                    onChange={(e) => updateSettings({ description: e.target.value })}
                    placeholder="Tavsif"
                  />
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      @
                    </span>
                    <Input
                      className="pl-7"
                      value={settings.username || ''}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        updateSettings({
                          username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(),
                        })
                      }
                      placeholder="ommaviy_manzil"
                    />
                  </div>
                  <p className="px-1 text-xs text-muted-foreground">
                    Ommaviy manzil orqali {isChannel ? 'kanalni' : 'guruhni'} qidiruvda topish
                    mumkin bo'ladi.
                  </p>
                </div>

                <div className="space-y-1 rounded-2xl border border-border p-1">
                  <Row
                    label="Ommaviy"
                    hint="Hamma topishi va qo'shilishi mumkin"
                    checked={Boolean(settings.is_public)}
                    onChange={(v) => updateSettings({ is_public: v })}
                  />
                  <Row
                    label="So'rov bilan qo'shilish"
                    hint="Yangi a'zolarni admin tasdiqlaydi"
                    checked={settings.join_by_request}
                    onChange={(v) => updateSettings({ join_by_request: v })}
                  />
                  <Row
                    label="Nusxa olishni cheklash"
                    hint="Forward va saqlash o'chiriladi"
                    checked={settings.restrict_saving_content}
                    onChange={(v) => updateSettings({ restrict_saving_content: v })}
                  />
                  {isChannel ? (
                    <Row
                      label="Xabarlarni imzolash"
                      hint="Post ostida muallif ismi ko'rinadi"
                      checked={settings.sign_messages}
                      onChange={(v) => updateSettings({ sign_messages: v })}
                    />
                  ) : (
                    <>
                      <Row
                        label="A'zolarni yashirish"
                        hint="A'zolar ro'yxati faqat adminlarga"
                        checked={settings.hide_members}
                        onChange={(v) => updateSettings({ hide_members: v })}
                      />
                      <Row
                        label="Topiklar (forum)"
                        hint="Guruhni bo'limlarga ajratish"
                        checked={settings.is_forum}
                        onChange={(v) => updateSettings({ is_forum: v })}
                      />
                    </>
                  )}
                  <Row
                    label="Anti-spam"
                    hint="Shubhali xabarlarni avtomatik filtrlash"
                    checked={settings.anti_spam}
                    onChange={(v) => updateSettings({ anti_spam: v })}
                  />
                  {settings.anti_spam && (
                    <Row
                      label="Kuchli anti-spam"
                      hint="Agressiv filtrlash (xatolar bo'lishi mumkin)"
                      checked={settings.aggressive_anti_spam}
                      onChange={(v) => updateSettings({ aggressive_anti_spam: v })}
                    />
                  )}
                </div>

                {/* Slow mode */}
                <div className="space-y-2 rounded-2xl border border-border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Timer className="h-4 w-4 text-muted-foreground" />
                    Sekin rejim: {formatSlowMode(settings.slow_mode_seconds)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SLOW_MODE_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => updateSettings({ slow_mode_seconds: value })}
                        className={cn(
                          'tg-transition rounded-full px-3 py-1 text-xs',
                          settings.slow_mode_seconds === value
                            ? 'bg-foreground text-background'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {value === 0 ? "Yo'q" : formatSlowMode(value)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A'zolar belgilangan vaqtda faqat bitta xabar yuborishi mumkin.
                  </p>
                </div>

                {/* Avtomatik o'chirish */}
                <div className="space-y-2 rounded-2xl border border-border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Avtomatik o'chirish: {formatAutoDelete(settings.auto_delete_seconds)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {AUTO_DELETE_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => updateSettings({ auto_delete_seconds: value })}
                        className={cn(
                          'tg-transition rounded-full px-3 py-1 text-xs',
                          settings.auto_delete_seconds === value
                            ? 'bg-foreground text-background'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {formatAutoDelete(value)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reaksiyalar */}
                <div className="space-y-2 rounded-2xl border border-border p-3">
                  <p className="text-sm font-medium">Reaksiyalar</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'Hammasi' },
                        { id: 'some', label: 'Tanlangan' },
                        { id: 'none', label: "O'chirilgan" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => updateSettings({ reactions_mode: option.id })}
                        className={cn(
                          'tg-transition rounded-full px-3 py-1 text-xs',
                          settings.reactions_mode === option.id
                            ? 'bg-foreground text-background'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {settings && tab === 'permissions' && (
              <div className="space-y-1 rounded-2xl border border-border p-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  A'zolar nima qila oladi
                </p>
                {PERMISSION_LABELS.map(({ key, label, hint }) => (
                  <Row
                    key={key}
                    label={label}
                    hint={hint}
                    checked={settings.permissions[key]}
                    onChange={(v) => updatePermission(key, v)}
                  />
                ))}
              </div>
            )}

            {tab === 'links' && (
              <div className="space-y-3">
                {isAdmin && (
                  <div className="space-y-2 rounded-2xl border border-border p-3">
                    <p className="text-sm font-medium">Yangi taklif havolasi</p>
                    <Input
                      value={linkTitle}
                      onChange={(e) => setLinkTitle(e.target.value)}
                      placeholder="Nomi (masalan: Instagram uchun)"
                    />
                    <Input
                      value={linkLimit}
                      onChange={(e) => setLinkLimit(e.target.value.replace(/\D/g, ''))}
                      placeholder="A'zolar limiti (ixtiyoriy)"
                      inputMode="numeric"
                    />
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm">Admin tasdiqlashi shart</span>
                      <Switch checked={linkApproval} onCheckedChange={setLinkApproval} />
                    </div>
                    <Button className="w-full" onClick={handleCreateLink}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Havola yaratish
                    </Button>
                  </div>
                )}

                {inviteLinks.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Hozircha havolalar yo'q
                  </p>
                ) : (
                  inviteLinks.map((link) => (
                    <div
                      key={link.id}
                      className={cn(
                        'rounded-2xl border border-border p-3',
                        link.is_revoked && 'opacity-60'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {link.title || 'Taklif havolasi'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {publicUrl(link.slug)}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {link.used_count} marta ishlatilgan
                            {link.member_limit ? ` / ${link.member_limit}` : ''}
                            {link.requires_approval ? ` ${MIDDLE_DOT} tasdiq bilan` : ''}
                            {link.is_revoked ? ` ${MIDDLE_DOT} bekor qilingan` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => copyText(publicUrl(link.slug))}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {isAdmin && !link.is_revoked && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => revokeInviteLink(link.id)}
                              title="Bekor qilish"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => deleteInviteLink(link.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'requests' && (
              <div className="space-y-2">
                {joinRequests.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Kutilayotgan so'rovlar yo'q
                  </p>
                ) : (
                  joinRequests.map((request) => {
                    const name =
                      request.profile?.display_name ||
                      request.profile?.username ||
                      'Foydalanuvchi';
                    return (
                      <div
                        key={request.id}
                        className="flex items-center gap-3 rounded-2xl border border-border p-3"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={request.profile?.avatar_url || undefined} />
                          <AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{name}</p>
                          {request.profile?.username && (
                            <p className="truncate text-xs text-muted-foreground">
                              @{request.profile.username}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => approveJoinRequest(request)}
                            disabled={!isAdmin}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => declineJoinRequest(request)}
                            disabled={!isAdmin}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {tab === 'topics' && (
              <div className="space-y-3">
                {isAdmin && (
                  <div className="flex gap-2">
                    <Input
                      value={newTopicTitle}
                      onChange={(e) => setNewTopicTitle(e.target.value)}
                      placeholder="Yangi topik nomi"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleCreateTopic();
                      }}
                    />
                    <Button onClick={handleCreateTopic}>Qo'shish</Button>
                  </div>
                )}
                {topics.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Topiklar yo'q</p>
                ) : (
                  topics.map((topic) => (
                    <div
                      key={topic.id}
                      className="flex items-center gap-2 rounded-2xl border border-border p-3"
                    >
                      <span className="text-lg">{topic.icon_emoji || '#'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{topic.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {topic.is_closed ? 'Yopilgan' : 'Ochiq'}
                          {topic.is_pinned ? ` ${MIDDLE_DOT} qadalgan` : ''}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs"
                            onClick={() => updateTopic(topic.id, { is_pinned: !topic.is_pinned })}
                          >
                            {topic.is_pinned ? 'Yechish' : 'Qadash'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs"
                            onClick={() => updateTopic(topic.id, { is_closed: !topic.is_closed })}
                          >
                            {topic.is_closed ? 'Ochish' : 'Yopish'}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => deleteTopic(topic.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {settings && tab === 'boost' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-muted/30 p-4 text-center">
                  <Rocket className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-lg font-semibold">{settings.boost_level}-daraja</p>
                  <p className="text-sm text-muted-foreground">
                    {settings.boosts_count} boost
                    {nextBoostGoal
                      ? ` ${MIDDLE_DOT} keyingi daraja uchun ${
                          nextBoostGoal - settings.boosts_count
                        } ta kerak`
                      : ` ${MIDDLE_DOT} maksimal daraja`}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-all"
                      style={{
                        width: `${
                          nextBoostGoal
                            ? Math.min(100, (settings.boosts_count / nextBoostGoal) * 100)
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1" onClick={() => boostConversation(1)}>
                      Boost berish
                    </Button>
                    <Button variant="outline" onClick={() => removeBoost()}>
                      Bekor qilish
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-border p-3">
                  <p className="text-sm font-medium">Daraja imkoniyatlari</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {BOOST_PERKS.map((perk) => (
                      <li key={perk}>{perk}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default GroupChannelSettingsSheet;
