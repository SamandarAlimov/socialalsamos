 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { toast } from 'sonner';
 
 export interface Repost {
   id: string;
   user_id: string;
   post_id: string;
   quote: string | null;
   created_at: string;
   post?: {
     id: string;
     content: string | null;
     media_urls: string[] | null;
     media_type: string | null;
     likes_count: number;
     comments_count: number;
     reposts_count: number;
     created_at: string;
     user_id: string;
     profile?: {
       id: string;
       username: string | null;
       display_name: string | null;
       avatar_url: string | null;
       is_verified: boolean;
     };
   };
 }
 
 export function useReposts(postId?: string) {
   const { user } = useAuth();
   const [isReposted, setIsReposted] = useState(false);
   const [repostCount, setRepostCount] = useState(0);
   const [isLoading, setIsLoading] = useState(false);
 
   // Check if current user has reposted this post
   useEffect(() => {
     if (!postId || !user) return;
 
     const checkRepostStatus = async () => {
       const { data } = await supabase
         .from('reposts')
         .select('id')
         .eq('post_id', postId)
         .eq('user_id', user.id)
         .maybeSingle();
 
       setIsReposted(!!data);
     };
 
     checkRepostStatus();
   }, [postId, user]);
 
   const toggleRepost = useCallback(async (targetPostId: string, quote?: string) => {
     if (!user) {
       toast.error('Please login to repost');
       return false;
     }
 
     setIsLoading(true);
 
     try {
       if (isReposted) {
         // Remove repost
         const { error } = await supabase
           .from('reposts')
           .delete()
           .eq('post_id', targetPostId)
           .eq('user_id', user.id);
 
         if (error) throw error;
 
         setIsReposted(false);
         setRepostCount(prev => Math.max(0, prev - 1));
         toast.success('Repost removed');
       } else {
         // Add repost
         const { error } = await supabase
           .from('reposts')
           .insert({
             post_id: targetPostId,
             user_id: user.id,
             quote: quote || null,
           });
 
         if (error) throw error;
 
         setIsReposted(true);
         setRepostCount(prev => prev + 1);
         toast.success('Reposted successfully');
       }
       return true;
     } catch (error: any) {
       console.error('Repost error:', error);
       toast.error('Failed to repost');
       return false;
     } finally {
       setIsLoading(false);
     }
   }, [user, isReposted]);
 
   return {
     isReposted,
     repostCount,
     isLoading,
     toggleRepost,
     setRepostCount,
     setIsReposted,
   };
 }
 
 // Hook to fetch user's reposts for profile
 export function useUserReposts(userId: string | undefined) {
   const [reposts, setReposts] = useState<Repost[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const { user } = useAuth();
 
   const fetchReposts = useCallback(async () => {
     if (!userId) return;
 
     setIsLoading(true);
 
     try {
       const { data, error } = await supabase
         .from('reposts')
         .select(`
           *,
           post:posts (
             id,
             content,
             media_urls,
             media_type,
             likes_count,
             comments_count,
             reposts_count,
             created_at,
             user_id,
             profile:profiles!posts_user_id_fkey (
               id,
               username,
               display_name,
               avatar_url,
               is_verified
             )
           )
         `)
         .eq('user_id', userId)
         .order('created_at', { ascending: false });
 
       if (error) throw error;
 
       setReposts((data || []) as Repost[]);
     } catch (error) {
       console.error('Error fetching reposts:', error);
     } finally {
       setIsLoading(false);
     }
   }, [userId]);
 
   useEffect(() => {
     fetchReposts();
   }, [fetchReposts]);
 
   // Realtime subscription
   useEffect(() => {
     if (!userId) return;
 
     const channel = supabase
       .channel(`user-reposts-${userId}`)
       .on(
         'postgres_changes',
         {
           event: '*',
           schema: 'public',
           table: 'reposts',
           filter: `user_id=eq.${userId}`,
         },
         () => {
           fetchReposts();
         }
       )
       .subscribe();
 
     return () => {
       supabase.removeChannel(channel);
     };
   }, [userId, fetchReposts]);
 
   return {
     reposts,
     isLoading,
     refresh: fetchReposts,
   };
 }