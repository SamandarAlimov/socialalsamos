import { useState, useEffect } from 'react';
 import { Repeat2 } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from '@/components/ui/dropdown-menu';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogFooter,
 } from '@/components/ui/dialog';
 import { Textarea } from '@/components/ui/textarea';
 import { useReposts } from '@/hooks/useReposts';
 import { useAuth } from '@/contexts/AuthContext';
 import { cn } from '@/lib/utils';
 
 interface RepostButtonProps {
   postId: string;
   postUserId: string;
   initialCount?: number;
   initialIsReposted?: boolean;
   size?: 'sm' | 'md';
 }
 
 export function RepostButton({
   postId,
   postUserId,
   initialCount = 0,
   initialIsReposted = false,
   size = 'md',
 }: RepostButtonProps) {
   const { user } = useAuth();
   const { isReposted, isLoading, toggleRepost, repostCount, setRepostCount, setIsReposted } = useReposts(postId);
   const [showQuoteDialog, setShowQuoteDialog] = useState(false);
   const [quote, setQuote] = useState('');
 
   // Initialize from props
  useEffect(() => {
     setRepostCount(initialCount);
     setIsReposted(initialIsReposted);
  }, [initialCount, initialIsReposted, setRepostCount, setIsReposted]);
 
   const handleRepost = async () => {
     await toggleRepost(postId);
   };
 
   const handleQuoteRepost = async () => {
     const success = await toggleRepost(postId, quote);
     if (success) {
       setShowQuoteDialog(false);
       setQuote('');
     }
   };
 
   const isOwnPost = user?.id === postUserId;
   const displayCount = repostCount || initialCount;
 
   return (
     <>
       <DropdownMenu>
         <DropdownMenuTrigger asChild>
           <Button
             variant="ghost"
             size="sm"
             disabled={isLoading}
             className={cn(
              'gap-1.5 hover:text-emerald-500 transition-colors',
              isReposted && 'text-emerald-500',
               size === 'sm' && 'h-8 px-2'
             )}
           >
             <Repeat2 className={cn(
               size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
               isReposted && 'fill-current'
             )} />
             {displayCount > 0 && (
               <span className="text-xs">{displayCount}</span>
             )}
           </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-48">
           {isReposted ? (
             <DropdownMenuItem onClick={handleRepost}>
               <Repeat2 className="h-4 w-4 mr-2" />
               Undo Repost
             </DropdownMenuItem>
           ) : (
             <>
               <DropdownMenuItem onClick={handleRepost}>
                 <Repeat2 className="h-4 w-4 mr-2" />
                 Repost
               </DropdownMenuItem>
               <DropdownMenuItem onClick={() => setShowQuoteDialog(true)}>
                 <Repeat2 className="h-4 w-4 mr-2" />
                 Quote Repost
               </DropdownMenuItem>
             </>
           )}
         </DropdownMenuContent>
       </DropdownMenu>
 
       <Dialog open={showQuoteDialog} onOpenChange={setShowQuoteDialog}>
         <DialogContent className="sm:max-w-md">
           <DialogHeader>
             <DialogTitle>Quote Repost</DialogTitle>
           </DialogHeader>
           <Textarea
             placeholder="Add a comment..."
             value={quote}
             onChange={(e) => setQuote(e.target.value)}
             className="min-h-[100px]"
           />
           <DialogFooter>
             <Button variant="outline" onClick={() => setShowQuoteDialog(false)}>
               Cancel
             </Button>
             <Button onClick={handleQuoteRepost} disabled={isLoading}>
               Repost
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </>
   );
 }