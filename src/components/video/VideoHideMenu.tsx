import { useState } from 'react';
import { EyeOff, MoreHorizontal } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { hideContentPost } from '@/lib/contentHides';
import db from '@/lib/supabaseAny';

/**
 * Videos/Reels surface keeps its player controls inside VideosPage, while the
 * canonical post id is mirrored into `?v=`. This route-aware menu gives reels
 * the same hide/not-interested capability as Home without coupling the player
 * implementation to recommendation persistence.
 */
export function VideoHideMenu() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [isHiding, setIsHiding] = useState(false);

  const postId =
    searchParams.get('v') ||
    searchParams.get('post') ||
    searchParams.get('id');

  if (location.pathname !== '/videos' || !postId || !user?.id) return null;

  const handleHide = async () => {
    if (isHiding) return;
    setIsHiding(true);

    try {
      // Owner posts should not silently disappear from the creator's own
      // surface. Archive is a different product action from recommendation hide.
      const { data: post, error: postError } = await db
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .maybeSingle();

      if (postError) throw postError;
      if (String((post as any)?.user_id ?? '') === user.id) {
        toast.info('Bu sizning postingiz', {
          description: 'O‘z postingiz uchun yashirish emas, arxivlash alohida amal bo‘ladi.',
        });
        return;
      }

      await hideContentPost(postId, user.id, 'not_interested');
      toast.success('Video yashirildi', {
        description: 'Bu video Home va Videos tavsiyalarida qayta ko‘rsatilmaydi.',
      });
    } catch (error) {
      console.error('Video hide failed:', error);
      toast.error('Videoni yashirib bo‘lmadi');
    } finally {
      setIsHiding(false);
    }
  };

  return (
    <div className="pointer-events-auto fixed right-3 top-[calc(env(safe-area-inset-top,0px)+64px)] z-[46] md:right-5 md:top-5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Video amallari"
            className="h-10 w-10 rounded-full bg-black/45 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-xl hover:bg-black/60 hover:text-white"
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() => void handleHide()}
            disabled={isHiding}
            className="cursor-pointer"
          >
            <EyeOff className="mr-2 h-4 w-4" />
            {isHiding ? 'Yashirilmoqda…' : 'Postni yashirish'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
