import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Search,
  Users,
  Megaphone,
  Lock,
  ArrowRight,
  ArrowLeft,
  Camera,
  X,
  Globe,
  Shield,
  Crown,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadMedia } from '@/lib/mediaUpload';

type ChatType = 'group' | 'channel';
type Step = 'select-type' | 'select-users' | 'details' | 'admin-settings';

const MAX_NAME = 128;
const MAX_DESCRIPTION = 255;

interface User {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
}

interface CreateGroupChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (conversationId: string) => void;
  defaultType?: ChatType;
}

export function CreateGroupChannelDialog({
  open,
  onOpenChange,
  onCreated,
  defaultType,
}: CreateGroupChannelDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [chatType, setChatType] = useState<ChatType>(defaultType || 'group');
  const [step, setStep] = useState<Step>(defaultType ? 'select-users' : 'select-type');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [adminUsers, setAdminUsers] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const typeLabel = chatType === 'group' ? 'Guruh' : 'Kanal';

  useEffect(() => {
    if (open) {
      setStep(defaultType ? 'select-users' : 'select-type');
      setChatType(defaultType || 'group');
      setSelectedUsers([]);
      setAdminUsers([]);
      setName('');
      setDescription('');
      setIsPublic(false);
      setSearchQuery('');
      setAvatarUrl(null);
      setAvatarUploading(false);
    }
  }, [open, defaultType]);

  useEffect(() => {
    if (!user || step !== 'select-users') return;
    let cancelled = false;

    const fetchUsers = async () => {
      setLoading(true);

      let query = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online')
        .neq('id', user.id)
        .limit(50);

      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (!error && data) setUsers(data);
      setLoading(false);
    };

    // Telegramdek: yozayotganda har bir harfda so'rov ketmasin
    const timer = setTimeout(fetchUsers, searchQuery ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, step, searchQuery]);

  const handleTypeSelect = (type: ChatType) => {
    setChatType(type);
    setStep('select-users');
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
    setAdminUsers((prev) => prev.filter((id) => id !== userId || selectedUsers.includes(userId)));
  };

  const handleAdminToggle = (userId: string) => {
    setAdminUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleNext = () => {
    if (step === 'select-users') setStep('details');
    else if (step === 'details') setStep('admin-settings');
  };

  const handleBack = () => {
    if (step === 'admin-settings') setStep('details');
    else if (step === 'details') setStep('select-users');
    else if (step === 'select-users') setStep(defaultType ? 'select-users' : 'select-type');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;

    setAvatarUploading(true);
    try {
      const uploaded = await uploadMedia(file, { type: 'chat', visibility: 'public' });
      setAvatarUrl(uploaded.url);
    } catch (error: any) {
      toast({
        title: 'Xatolik',
        description: error?.message || "Rasmni yuklab bo'lmadi",
        variant: 'destructive',
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !user) return;

    setCreating(true);
    try {
      const basePayload: Record<string, unknown> = {
        type: chatType,
        name: name.trim(),
        description: description.trim() || null,
        avatar_url: avatarUrl,
        owner_id: user.id,
        last_message_at: new Date().toISOString(),
      };

      // Ba'zi bazalarda is_public / subscribers_count ustunlari bo'lmasligi mumkin -
      // shu holatda ularsiz qayta urinamiz, yaratish bekor bo'lib qolmasin.
      let newConv: { id: string } | null = null;
      const firstAttempt = await supabase
        .from('conversations')
        .insert({
          ...basePayload,
          is_public: isPublic,
          subscribers_count: selectedUsers.length + 1,
        } as any)
        .select()
        .single();

      if (firstAttempt.error) {
        const retry = await supabase
          .from('conversations')
          .insert(basePayload as any)
          .select()
          .single();
        if (retry.error) throw retry.error;
        newConv = retry.data as { id: string };
      } else {
        newConv = firstAttempt.data as { id: string };
      }

      const uniqueMembers = Array.from(new Set(selectedUsers.filter((id) => id && id !== user.id)));

      const participants = [
        { conversation_id: newConv.id, user_id: user.id, role: 'owner' },
        ...uniqueMembers.map((id) => ({
          conversation_id: newConv!.id,
          user_id: id,
          role: adminUsers.includes(id) ? 'admin' : 'member',
        })),
      ];

      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert(participants);

      if (partError) {
        // Yarim yaratilgan suhbat qolmasligi uchun tozalaymiz
        await supabase.from('conversations').delete().eq('id', newConv.id);
        throw partError;
      }

      toast({
        title: `${typeLabel} yaratildi`,
        description:
          uniqueMembers.length > 0
            ? `${uniqueMembers.length} a'zo qo'shildi`
            : chatType === 'channel'
              ? "Endi obunachilarni taklif qilishingiz mumkin"
              : "Endi a'zolarni taklif qilishingiz mumkin",
      });

      onCreated?.(newConv.id);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      toast({
        title: 'Xatolik',
        description: error?.message || `${typeLabel} yaratib bo'lmadi`,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const chatTypes = [
    {
      id: 'group' as ChatType,
      icon: Users,
      label: 'Yangi guruh',
      description: "A'zolar bilan birga yozishish, adminlar va rollar",
      color: 'bg-blue-500',
    },
    {
      id: 'channel' as ChatType,
      icon: Megaphone,
      label: 'Yangi kanal',
      description: "Cheksiz obunachilarga e'lon tarqatish",
      color: 'bg-violet-500',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1 text-base sm:text-lg">
            {step !== 'select-type' && (
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 h-8 w-8 shrink-0 rounded-full"
                onClick={handleBack}
                aria-label="Orqaga"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <span className="truncate">
              {step === 'select-type' && 'Nima yaratamiz?'}
              {step === 'select-users' &&
                (chatType === 'channel' ? "Obunachilar qo'shish" : "A'zolar qo'shish")}
              {step === 'details' && `${typeLabel} ma'lumotlari`}
              {step === 'admin-settings' && 'Adminlar'}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === 'select-type' && "Guruh yoki kanal tanlang"}
            {step === 'select-users' &&
              (chatType === 'channel'
                ? "Bu qadamni o'tkazib yuborsangiz ham bo'ladi"
                : "Kimlarni qo'shmoqchisiz?")}
            {step === 'details' && `${typeLabel} nomi, rasmi va tavsifi`}
            {step === 'admin-settings' && "Kimga admin huquqi berilsin?"}
          </DialogDescription>
        </DialogHeader>

        {step === 'select-type' && (
          <div className="space-y-2">
            {chatTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => handleTypeSelect(type.id)}
                className="tg-transition flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-accent active:scale-[0.99] sm:gap-4 sm:p-4"
              >
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12',
                    type.color
                  )}
                >
                  <type.icon className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground sm:text-sm">{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 'select-users' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Foydalanuvchilarni qidirish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl pl-10"
              />
            </div>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((userId) => {
                  const selectedUser = users.find((u) => u.id === userId);
                  return (
                    <div
                      key={userId}
                      className="flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-1 text-sm"
                    >
                      <span className="truncate">
                        {selectedUser?.display_name || selectedUser?.username || 'Foydalanuvchi'}
                      </span>
                      <button
                        onClick={() => handleUserSelect(userId)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
                        aria-label="Olib tashlash"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <ScrollArea className="h-[45vh] max-h-[300px]">
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Foydalanuvchi topilmadi
                </div>
              ) : (
                <div className="space-y-1 pr-2">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleUserSelect(u.id)}
                      className="tg-transition flex w-full items-center gap-3 rounded-xl p-2.5 hover:bg-accent sm:p-3"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.avatar_url || ''} />
                          <AvatarFallback>
                            {(u.display_name || u.username || 'U')[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {u.is_online && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium">
                          {u.display_name || u.username || 'Foydalanuvchi'}
                        </p>
                        {u.username && u.display_name && (
                          <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                        )}
                      </div>
                      <Checkbox checked={selectedUsers.includes(u.id)} />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            <Button onClick={handleNext} className="w-full rounded-xl">
              {selectedUsers.length > 0
                ? `Davom etish (${selectedUsers.length} tanlandi)`
                : chatType === 'channel'
                  ? "A'zosiz davom etish"
                  : 'Davom etish'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-5">
            <div className="flex justify-center">
              <label className="group relative cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-muted sm:h-24 sm:w-24">
                  {avatarUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : avatarUrl ? (
                    <img src={avatarUrl} alt={typeLabel} className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="tg-transition h-7 w-7 text-muted-foreground group-hover:text-foreground" />
                  )}
                </div>
                <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
                  <Camera className="h-4 w-4" />
                </span>
              </label>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="conv-name">{typeLabel} nomi</Label>
                <Input
                  id="conv-name"
                  placeholder={chatType === 'group' ? 'Masalan: Do\u2018stlar' : 'Masalan: Yangiliklar'}
                  value={name}
                  maxLength={MAX_NAME}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 rounded-xl"
                />
              </div>

              <div>
                <Label htmlFor="conv-description">Tavsif (majburiy emas)</Label>
                <Textarea
                  id="conv-description"
                  placeholder="Bu yerda nima haqida gaplashiladi?"
                  value={description}
                  maxLength={MAX_DESCRIPTION}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1.5 resize-none rounded-xl"
                  rows={3}
                />
                <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">
                  {description.length}/{MAX_DESCRIPTION}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/50 p-3 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  {isPublic ? (
                    <Globe className="h-5 w-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {isPublic ? 'Ochiq' : 'Yopiq'} {typeLabel.toLowerCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isPublic
                        ? "Har kim topib qo'shilishi mumkin"
                        : "Faqat taklif qilinganlar qo'shiladi"}
                    </p>
                  </div>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>

              <p className="text-sm text-muted-foreground">
                {selectedUsers.length} ta a'zo qo'shiladi
              </p>
            </div>

            {selectedUsers.length > 0 ? (
              <Button onClick={handleNext} disabled={!name.trim()} className="w-full rounded-xl">
                Admin huquqlarini belgilash
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || creating}
                className="w-full rounded-xl"
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Yaratilmoqda...
                  </>
                ) : (
                  `${typeLabel} yaratish`
                )}
              </Button>
            )}
          </div>
        )}

        {step === 'admin-settings' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-muted/50 p-3 sm:p-4">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Admin huquqlari</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Adminlar a'zo qo'shishi/chiqarishi, xabar qadashi va sozlamalarni boshqarishi
                mumkin.
              </p>
            </div>

            <ScrollArea className="h-[40vh] max-h-[250px]">
              <div className="space-y-2 pr-2">
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>Siz</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">Siz</p>
                      <p className="text-xs text-muted-foreground">Egasi</p>
                    </div>
                  </div>
                  <Crown className="h-5 w-5 shrink-0 text-muted-foreground" />
                </div>

                {selectedUsers.map((userId) => {
                  const selectedUser = users.find((u) => u.id === userId);
                  const isAdmin = adminUsers.includes(userId);
                  return (
                    <div
                      key={userId}
                      className={cn(
                        'tg-transition flex items-center justify-between gap-2 rounded-xl p-3',
                        isAdmin ? 'border border-blue-500/20 bg-blue-500/10' : 'bg-muted/50'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={selectedUser?.avatar_url || ''} />
                          <AvatarFallback>
                            {(selectedUser?.display_name ||
                              selectedUser?.username ||
                              'U')[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {selectedUser?.display_name ||
                              selectedUser?.username ||
                              'Foydalanuvchi'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isAdmin ? 'Admin' : "A'zo"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant={isAdmin ? 'secondary' : 'outline'}
                        size="sm"
                        className="shrink-0 rounded-xl"
                        onClick={() => handleAdminToggle(userId)}
                      >
                        {isAdmin ? (
                          <>
                            <Shield className="mr-1 h-4 w-4" />
                            Admin
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-1 h-4 w-4" />
                            Admin qilish
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <Button onClick={handleCreate} disabled={creating} className="w-full rounded-xl">
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Yaratilmoqda...
                </>
              ) : (
                `${typeLabel} yaratish`
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
