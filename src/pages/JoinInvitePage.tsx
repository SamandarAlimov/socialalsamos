import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Megaphone, Link2, ShieldAlert, Check } from 'lucide-react';

type JoinState = 'loading' | 'ready' | 'invalid' | 'joined' | 'requested';

interface InviteInfo {
  linkId: string;
  conversationId: string;
  requiresApproval: boolean;
  memberLimit: number | null;
  usedCount: number;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  type: 'group' | 'channel' | 'private';
  joinByRequest: boolean;
}

/**
 * Taklif havolasi orqali guruh yoki kanalga qo'shilish sahifasi.
 * Telegramdagi t.me/+hash havolalarining analogi: /join/<slug>
 */
export default function JoinInvitePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [state, setState] = useState<JoinState>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [reason, setReason] = useState<string>('');
  const [isJoining, setIsJoining] = useState(false);

  const load = useCallback(async () => {
    if (!slug) {
      setState('invalid');
      setReason("Havola noto'g'ri");
      return;
    }
    try {
      const { data: link } = await supabase
        .from('conversation_invite_links')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (!link) {
        setState('invalid');
        setReason('Bunday havola topilmadi');
        return;
      }

      const raw = link as Record<string, any>;

      if (raw.is_revoked) {
        setState('invalid');
        setReason('Havola bekor qilingan');
        return;
      }
      if (raw.expires_at && new Date(raw.expires_at).getTime() < Date.now()) {
        setState('invalid');
        setReason('Havolaning muddati tugagan');
        return;
      }
      if (raw.member_limit && raw.used_count >= raw.member_limit) {
        setState('invalid');
        setReason("Havola limiti tugagan");
        return;
      }

      const { data: conversation } = await supabase
        .from('conversations')
        .select('id, name, description, avatar_url, type, join_by_request')
        .eq('id', raw.conversation_id)
        .maybeSingle();

      if (!conversation) {
        setState('invalid');
        setReason("Chat topilmadi yoki o'chirilgan");
        return;
      }

      const conv = conversation as Record<string, any>;

      // Allaqachon a'zomizmi?
      if (user) {
        const { data: participant } = await supabase
          .from('conversation_participants')
          .select('id')
          .eq('conversation_id', conv.id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (participant) {
          navigate('/messages', { replace: true });
          return;
        }
      }

      setInvite({
        linkId: raw.id,
        conversationId: conv.id,
        requiresApproval: Boolean(raw.requires_approval),
        memberLimit: raw.member_limit ?? null,
        usedCount: raw.used_count ?? 0,
        name: conv.name || 'Nomsiz',
        description: conv.description ?? null,
        avatarUrl: conv.avatar_url ?? null,
        type: conv.type,
        joinByRequest: Boolean(conv.join_by_request),
      });
      setState('ready');
    } catch (error) {
      console.error('Havolani yuklashda xatolik:', error);
      setState('invalid');
      setReason('Havolani ochib bo\u2018lmadi');
    }
  }, [slug, user, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleJoin = async () => {
    if (!invite || !user) return;
    setIsJoining(true);
    try {
      const needsApproval = invite.requiresApproval || invite.joinByRequest;

      if (needsApproval) {
        const { error } = await supabase.from('conversation_join_requests').insert({
          conversation_id: invite.conversationId,
          user_id: user.id,
          invite_link_id: invite.linkId,
        });
        if (error && error.code !== '23505') throw error;
        setState('requested');
        toast({ title: "So'rov yuborildi", description: 'Admin tasdiqlashini kuting' });
        return;
      }

      const { error } = await supabase.from('conversation_participants').insert({
        conversation_id: invite.conversationId,
        user_id: user.id,
        role: 'member',
      });
      if (error) throw error;

      await supabase
        .from('conversation_invite_links')
        .update({ used_count: invite.usedCount + 1 })
        .eq('id', invite.linkId);

      setState('joined');
      toast({ title: "Qo'shildingiz" });
      setTimeout(() => navigate('/messages', { replace: true }), 600);
    } catch (error) {
      console.error("Qo'shilishda xatolik:", error);
      toast({ title: "Qo'shilib bo\u2018lmadi", variant: 'destructive' });
    } finally {
      setIsJoining(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h1 className="text-lg font-semibold">Havola ishlamaydi</h1>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <Button onClick={() => navigate('/messages')}>Xabarlarga qaytish</Button>
      </div>
    );
  }

  const isChannel = invite?.type === 'channel';

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Avatar className="h-20 w-20">
        <AvatarImage src={invite?.avatarUrl || undefined} />
        <AvatarFallback className={isChannel ? 'bg-violet-500' : 'bg-blue-500'}>
          {isChannel ? (
            <Megaphone className="h-8 w-8 text-white" />
          ) : (
            <Users className="h-8 w-8 text-white" />
          )}
        </AvatarFallback>
      </Avatar>

      <div>
        <h1 className="text-xl font-semibold">{invite?.name}</h1>
        <p className="text-sm text-muted-foreground">
          {isChannel ? 'Kanal' : 'Guruh'} taklifi
        </p>
      </div>

      {invite?.description && (
        <p className="text-sm text-muted-foreground">{invite.description}</p>
      )}

      {state === 'joined' ? (
        <div className="flex items-center gap-2 text-sm font-medium text-green-500">
          <Check className="h-4 w-4" />
          Qo'shildingiz
        </div>
      ) : state === 'requested' ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            So'rovingiz yuborildi. Admin tasdiqlagach chat ochiladi.
          </p>
          <Button variant="outline" onClick={() => navigate('/messages')}>
            Xabarlarga qaytish
          </Button>
        </div>
      ) : (
        <Button className="w-full" onClick={handleJoin} disabled={isJoining}>
          {isJoining ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="mr-2 h-4 w-4" />
          )}
          {invite?.requiresApproval || invite?.joinByRequest
            ? "Qo'shilish so'rovini yuborish"
            : isChannel
              ? 'Kanalga qo\u2018shilish'
              : 'Guruhga qo\u2018shilish'}
        </Button>
      )}
    </div>
  );
}
