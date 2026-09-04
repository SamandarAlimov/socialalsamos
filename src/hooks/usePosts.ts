import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createPollForPost, type PollInput } from '@/lib/polls';
import {
  savePostLocation,
  savePostMedia,
  savePostMusic,
  type PostLocationInput,
  type PostMediaInput,
  type PostMusicInput,
} from '@/lib/postMeta';
import { MAX_COLLABORATORS } from '@/lib/postComposer';
import type { AlsamosRichTextDocument } from '@/lib/richTextDocument';
import { appendLocationMarker } from '@/lib/postMarkers';
import {
  readStructuredPostSchemaCapability,
  writeStructuredPostSchemaCapability,
} from '@/lib/structuredPostSchema';
import {
  createProfileEmbedGuard,
  runWithProfileEmbedFallback,
  type EmbedQueryResult,
} from '@/lib/profileEmbed';
import db from '@/lib/supabaseAny';

export interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_urls: string[];
  media_type: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  bookmarks_count: number;
  reposts_count: number;
  views_count: number;
  is_pinned: boolean;
  visibility: string;
  formatted_content?: AlsamosRichTextDocument | null;
  created_at: string;
  updated_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
  is_liked?: boolean;
  is_bookmarked?: boolean;
  hashtags?: string[] | null;
  post_kind?: string | null;
}

export type PostVisibility = 'public' | 'friends' | 'private';

// `posts_user_id_fkey` nomli FK production bazada bo'lmasa PostgREST butun
// so'rovni PGRST200 bilan rad etadi va feed bo'sh qoladi. Shu sababli embedsiz
// variant ham saqlanadi: profillar keyin alohida so'rov bilan to'ldiriladi.
const POST_SELECT_WITH_PROFILE = `
  *,
  profile:profiles!posts_user_id_fkey (
    id,
    username,
    display_name,
    avatar_url,
    is_verified
  )
`;

const POST_SELECT_PLAIN = '*';

const postEmbedGuard = createProfileEmbedGuard();

type PostRow = Record<string, unknown>;

function errorText(error: unknown): string {
  const value = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;

  return [value?.code, value?.message, value?.details, value?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isMissingPublishPostDraftError(error: unknown): boolean {
  const value = error as { code?: string } | null;
  const text = errorText(error);

  return (
    value?.code === 'PGRST202' ||
    (text.includes('publish_post_draft') &&
      (text.includes('schema cache') || text.includes('could not find the function')))
  );
}

function isSchemaCompatibilityError(error: unknown): boolean {
  const value = error as { code?: string } | null;
  const text = errorText(error);

  return (
    value?.code === '42703' ||
    value?.code === '42P01' ||
    value?.code === 'PGRST204' ||
    value?.code === 'PGRST205' ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find the')
  );
}

const ATOMIC_PUBLISH_CAPABILITY_KEY = 'alsamos.create.atomic-publish-capability.v1';

type AtomicPublishCapability = 'available' | 'missing' | null;

function readAtomicPublishCapability(): AtomicPublishCapability {
  try {
    const value = sessionStorage.getItem(ATOMIC_PUBLISH_CAPABILITY_KEY);
    return value === 'available' || value === 'missing' ? value : null;
  } catch {
    return null;
  }
}

function writeAtomicPublishCapability(value: Exclude<AtomicPublishCapability, null>) {
  try {
    sessionStorage.setItem(ATOMIC_PUBLISH_CAPABILITY_KEY, value);
  } catch {
    // Capability cache is an optimization only.
  }
}

/** Post yaratishda qo'shimcha strukturali ma'lumotlar. */
export interface CreatePostOptions {
  /** MUHIM: ilgari bu qiymat saqlanmasdan tushib qolar edi (maxfiylik bug'i). */
  visibility?: PostVisibility;
  postKind?: 'post' | 'reel' | 'story' | 'location' | 'poll' | 'file';
  /** Rejalashtirilgan vaqt — berilsa post 'scheduled' holatda saqlanadi. */
  scheduledAt?: string | null;
  media?: PostMediaInput[];
  poll?: PollInput | null;
  location?: PostLocationInput | null;
  music?: PostMusicInput | null;
  formattedContent?: AlsamosRichTextDocument | null;
  /** Tahrir holati (filtr, aspect ratio, overlaylar) — reproduksiya uchun. */
  editState?: Record<string, unknown> | null;
}

export function usePosts(
  filter: 'global' | 'friends' | 'following' | 'recommended' = 'global',
) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const PAGE_SIZE = filter === 'recommended' ? 18 : 10;
  const QUALITY_POOL_SIZE = filter === 'recommended' ? 12 : 0;

  const fetchPosts = useCallback(async (pageNum: number, refresh = false) => {
    setIsLoading(true);

    try {
      let allowedUserIds: string[] | null = null;
      const visibility: 'public' | Array<'public' | 'friends'> =
        filter === 'friends' ? ['public', 'friends'] : 'public';

      if (filter === 'following') {
        if (!user) {
          if (refresh) setPosts([]);
          setHasMore(false);
          return;
        }

        const { data: following, error: followingError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        if (followingError) throw followingError;
        allowedUserIds = (following ?? []).map((row) => row.following_id);
      } else if (filter === 'friends') {
        if (!user) {
          if (refresh) setPosts([]);
          setHasMore(false);
          return;
        }

        const { data: outgoing, error: outgoingError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        if (outgoingError) throw outgoingError;

        const outgoingIds = (outgoing ?? []).map((row) => row.following_id);
        if (outgoingIds.length > 0) {
          const { data: reciprocal, error: reciprocalError } = await supabase
            .from('follows')
            .select('follower_id')
            .eq('following_id', user.id)
            .in('follower_id', outgoingIds);

          if (reciprocalError) throw reciprocalError;
          allowedUserIds = (reciprocal ?? []).map((row) => row.follower_id);
        } else {
          allowedUserIds = [];
        }
      }

      if (allowedUserIds && allowedUserIds.length === 0) {
        if (refresh) setPosts([]);
        setHasMore(false);
        return;
      }

      // Home recommendation uses retrieval + ranking. Retrieval intentionally
      // mixes a fresh pool with a quality pool; personalization happens in
      // useHomeRecommendations after candidates are hydrated.
      const fetchPool = (
        mode: 'fresh' | 'quality',
        start: number,
        end: number,
      ) =>
        runWithProfileEmbedFallback<PostRow>(
          postEmbedGuard,
          (select) => {
            let query = db.from('posts').select(select);

            if (mode === 'quality') {
              const cutoff = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
              ).toISOString();
              query = query
                .gte('created_at', cutoff)
                .order('likes_count', { ascending: false })
                .order('comments_count', { ascending: false })
                .order('created_at', { ascending: false });
            } else {
              query = query.order('created_at', { ascending: false });
            }

            query = query.range(start, end);

            // Legacy Alsamos rows could have visibility=NULL because the old
            // column was nullable and clients were allowed to omit it. NULL
            // historically meant the default public state. Keep those rows in
            // the retrieval candidate set; the database RLS remains the final
            // authority and still protects explicit friends/private posts.
            query = Array.isArray(visibility)
              ? query.or('visibility.eq.public,visibility.eq.friends,visibility.is.null')
              : query.or('visibility.eq.public,visibility.is.null');

            if (allowedUserIds) query = query.in('user_id', allowedUserIds);

            return query as unknown as PromiseLike<EmbedQueryResult<PostRow>>;
          },
          {
            embedSelect: POST_SELECT_WITH_PROFILE,
            plainSelect: POST_SELECT_PLAIN,
          },
        );

      const freshResult = await fetchPool(
        'fresh',
        pageNum * PAGE_SIZE,
        (pageNum + 1) * PAGE_SIZE - 1,
      );

      if (freshResult.error) throw freshResult.error;

      const freshRows = (freshResult.data ?? []) as PostRow[];
      let candidateRows = [...freshRows];

      if (filter === 'recommended' && QUALITY_POOL_SIZE > 0) {
        const qualityResult = await fetchPool(
          'quality',
          pageNum * QUALITY_POOL_SIZE,
          (pageNum + 1) * QUALITY_POOL_SIZE - 1,
        );

        if (qualityResult.error) {
          console.warn(
            'Recommendation quality pool unavailable; fresh pool ishlatiladi:',
            qualityResult.error,
          );
        } else {
          const merged = new Map<string, PostRow>();
          for (const row of [...freshRows, ...(qualityResult.data ?? [])]) {
            const id = String((row as Record<string, unknown>).id ?? '');
            if (id && !merged.has(id)) merged.set(id, row);
          }
          candidateRows = Array.from(merged.values());
        }
      }

      const rawPosts = candidateRows as unknown as Array<
        Post & { post_kind?: string | null }
      >;

      // select("*") da post_kind ustuni production schema'da mavjud bo'lsa
      // har bir row obyektida key sifatida keladi. U yo'q bo'lsa atomic publish
      // migratsiyasi ham hali deploy bo'lmagan bo'lishi ehtimoli yuqori.
      if (rawPosts.length > 0) {
        const hasPostKindColumn = Object.prototype.hasOwnProperty.call(rawPosts[0], 'post_kind');
        writeAtomicPublishCapability(hasPostKindColumn ? 'available' : 'missing');
        writeStructuredPostSchemaCapability(hasPostKindColumn ? 'available' : 'missing');
      }

      const visiblePosts = rawPosts.filter((post) => post.post_kind !== 'story');

      const mergePage = (previous: Post[], next: Post[]) => {
        if (refresh) return next;
        const existingIds = new Set(previous.map((post) => post.id));
        return [
          ...previous,
          ...next.filter((post) => !existingIds.has(post.id)),
        ];
      };

      if (user && visiblePosts.length > 0) {
        const postIds = visiblePosts.map((post) => post.id);
        const [likesResult, bookmarksResult] = await Promise.all([
          supabase
            .from('post_likes')
            .select('post_id')
            .eq('user_id', user.id)
            .in('post_id', postIds),
          db
            .from('bookmarks')
            .select('post_id')
            .eq('user_id', user.id)
            .in('post_id', postIds),
        ]);

        if (likesResult.error) {
          console.warn('Post like state hydrate failed:', likesResult.error);
        }
        if (bookmarksResult.error) {
          console.warn(
            'Post bookmark state hydrate failed:',
            bookmarksResult.error,
          );
        }

        const likedPostIds = new Set(
          (likesResult.data ?? []).map((row) => String(row.post_id)),
        );
        const bookmarkedPostIds = new Set(
          (bookmarksResult.data ?? []).map((row: any) => String(row.post_id)),
        );
        const postsWithStatus = visiblePosts.map((post) => ({
          ...post,
          is_liked: likedPostIds.has(post.id),
          is_bookmarked: bookmarkedPostIds.has(post.id),
        }));

        setPosts((previous) => mergePage(previous, postsWithStatus));
      } else {
        setPosts((previous) => mergePage(previous, visiblePosts));
      }

      // Pagination follows the fresh retrieval pool. The quality pool can
      // contain duplicates and must not incorrectly terminate scrolling.
      setHasMore(freshRows.length === PAGE_SIZE);
    } catch (error: any) {
      console.error('Error fetching posts:', error);
      setHasMore(false);

      if (refresh || pageNum === 0) {
        toast({
          title: 'Error',
          description: 'Failed to load posts',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [filter, user, toast]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchPosts(nextPage);
    }
  }, [isLoading, hasMore, page, fetchPosts]);

  const refresh = useCallback(() => {
    setPage(0);
    setHasMore(true);
    fetchPosts(0, true);
  }, [fetchPosts]);

  const createPost = useCallback(async (
    content: string,
    mediaUrls: string[] = [],
    mediaType = 'text',
    collaboratorIds: string[] = [],
    options: CreatePostOptions = {}
  ) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to post',
        variant: 'destructive',
      });
      return null;
    }

    const visibility = options.visibility ?? 'public';
    const isScheduled = Boolean(options.scheduledAt);
    const collaborators = Array.from(new Set(collaboratorIds))
      .filter((id) => id !== user.id)
      .slice(0, MAX_COLLABORATORS);

    try {
      const payload = {
        content,
        mediaUrls,
        mediaType,
        collaboratorIds: collaborators,
        visibility,
        postKind: options.postKind ?? 'post',
        scheduledAt: options.scheduledAt ?? null,
        media: options.media ?? [],
        poll: options.poll ?? null,
        location: options.location ?? null,
        music: options.music ?? null,
        formattedContent: options.formattedContent ?? null,
        editState: options.editState ?? null,
      };

      let postId: string | null = null;
      let directPost: Post | null = null;
      let usedMinimalSchema = false;
      const metaErrors: string[] = [];

      let rpcPostId: unknown = null;
      let publishError: unknown = null;
      const atomicCapability = readAtomicPublishCapability();
      const structuredCapability = readStructuredPostSchemaCapability();

      if (atomicCapability !== 'missing' && structuredCapability !== 'missing') {
        const rpcResult = await (supabase as any).rpc(
          'publish_post_draft',
          { p_payload: payload },
        );
        rpcPostId = rpcResult.data;
        publishError = rpcResult.error;

        if (!publishError && rpcPostId) {
          writeAtomicPublishCapability('available');
        } else if (publishError && isMissingPublishPostDraftError(publishError)) {
          writeAtomicPublishCapability('missing');
        }
      } else {
        publishError = {
          code: 'PGRST202',
          message: 'publish_post_draft capability is unavailable in this production schema',
        };
      }

      if (!publishError && rpcPostId) {
        postId = String(rpcPostId);
      } else if (publishError && isMissingPublishPostDraftError(publishError)) {
        if (atomicCapability !== 'missing' && structuredCapability !== 'missing') {
          console.warn(
            'publish_post_draft RPC production bazada topilmadi; compatibility publish ishlatiladi.',
            publishError,
          );
        }

        const publishedAt = isScheduled ? null : new Date().toISOString();
        const knownLegacySchema = readStructuredPostSchemaCapability() === 'missing';

        if (knownLegacySchema && isScheduled) {
          throw new Error(
            'Rejalashtirilgan post uchun production Supabase migratsiyalarini yangilash kerak.',
          );
        }
        const compatibilityContent =
          knownLegacySchema && options.location
            ? appendLocationMarker(content, options.location)
            : content;

        let insertResult = knownLegacySchema
          ? await db
              .from('posts')
              .insert({
                user_id: user.id,
                content: compatibilityContent,
                media_urls: mediaUrls,
                media_type: mediaType,
                visibility,
              })
              .select('*')
              .single()
          : await db
              .from('posts')
              .insert({
                user_id: user.id,
                content: compatibilityContent,
                media_urls: mediaUrls,
                media_type: mediaType,
                visibility,
                post_kind: options.postKind ?? 'post',
                status: isScheduled ? 'scheduled' : 'published',
                scheduled_at: options.scheduledAt ?? null,
                published_at: publishedAt,
                formatted_content: options.formattedContent ?? null,
                edit_state: options.editState ?? null,
              })
              .select('*')
              .single();

        if (knownLegacySchema) usedMinimalSchema = true;

        if (insertResult.error && isSchemaCompatibilityError(insertResult.error)) {
          writeStructuredPostSchemaCapability('missing');

          if (isScheduled) {
            throw new Error(
              'Rejalashtirilgan post uchun production Supabase migratsiyalarini yangilash kerak.',
            );
          }

          usedMinimalSchema = true;
          const minimalContent = options.location
            ? appendLocationMarker(content, options.location)
            : content;

          insertResult = await db
            .from('posts')
            .insert({
              user_id: user.id,
              content: minimalContent,
              media_urls: mediaUrls,
              media_type: mediaType,
              visibility,
            })
            .select('*')
            .single();
        }

        if (insertResult.error || !insertResult.data?.id) {
          throw insertResult.error ?? new Error('Post identifikatori qaytmadi');
        }

        postId = String(insertResult.data.id);
        directPost = insertResult.data as Post;
        if (usedMinimalSchema) writeStructuredPostSchemaCapability('missing');

        // Compatibility path keeps the post usable while the DB migration is
        // being deployed. Structured extras are best-effort and reported.
        if (options.media?.length && readStructuredPostSchemaCapability() !== 'missing') {
          try {
            await savePostMedia(postId, options.media);
          } catch (metaError) {
            console.warn('Compatibility publish: post_media saqlanmadi:', metaError);
            writeStructuredPostSchemaCapability('missing');
            // Public postda media_urls legacy fallback sifatida allaqachon saqlangan.
            if (visibility !== 'public') metaErrors.push('fayllar');
          }
        }

        if (options.poll) {
          if (readStructuredPostSchemaCapability() === 'missing') {
            metaErrors.push('so‘rovnoma');
          } else {
            try {
              await createPollForPost(postId, options.poll);
            } catch (metaError) {
              console.warn('Compatibility publish: so‘rovnoma saqlanmadi:', metaError);
              writeStructuredPostSchemaCapability('missing');
              metaErrors.push('so‘rovnoma');
            }
          }
        }

        if (options.location && readStructuredPostSchemaCapability() !== 'missing') {
          try {
            await savePostLocation(postId, options.location, user.id);
          } catch (metaError) {
            console.warn('Compatibility publish: joylashuv strukturali jadvalga saqlanmadi:', metaError);
            writeStructuredPostSchemaCapability('missing');

            const markerContent = appendLocationMarker(content, options.location);
            const { error: markerError } = await db
              .from('posts')
              .update({ content: markerContent })
              .eq('id', postId);

            if (markerError) {
              metaErrors.push('joylashuv');
            } else if (directPost) {
              directPost = { ...directPost, content: markerContent };
            }
          }
        }

        if (options.music) {
          if (readStructuredPostSchemaCapability() === 'missing') {
            metaErrors.push('musiqa');
          } else {
            try {
              await savePostMusic(postId, options.music);
            } catch (metaError) {
              console.warn('Compatibility publish: musiqa saqlanmadi:', metaError);
              writeStructuredPostSchemaCapability('missing');
              metaErrors.push('musiqa');
            }
          }
        }

        if (collaborators.length > 0) {
          if (readStructuredPostSchemaCapability() === 'missing') {
            metaErrors.push('hammualliflar');
          } else {
            const { error: collaboratorError } = await db
              .from('post_collaborators')
              .insert(
                collaborators.map((collaboratorId) => ({
                  post_id: postId,
                  user_id: collaboratorId,
                  invited_by: user.id,
                  status: 'pending',
                })),
              );

            if (collaboratorError) {
              console.warn(
                'Compatibility publish: hammuallif takliflari saqlanmadi:',
                collaboratorError,
              );
              metaErrors.push('hammualliflar');
            }
          }
        }

        if (usedMinimalSchema && options.formattedContent) {
          metaErrors.push('formatlangan matn');
        }
      } else {
        throw publishError ?? new Error('Post identifikatori qaytmadi');
      }

      if (!postId) throw new Error('Post identifikatori qaytmadi');

      // Yangi postni UI uchun qayta o'qish. Profil embed mavjud bo'lmasa ham
      // post ko'rinishi kerak, shuning uchun fallback ishlatiladi.
      const { data: refetched, error } = await runWithProfileEmbedFallback<PostRow>(
        postEmbedGuard,
        (select) =>
          supabase
            .from('posts')
            .select(select)
            .eq('id', postId as string)
            .limit(1) as unknown as PromiseLike<EmbedQueryResult<PostRow>>,
        {
          embedSelect: POST_SELECT_WITH_PROFILE,
          plainSelect: POST_SELECT_PLAIN,
        },
      );

      const data = (refetched ?? [])[0] as unknown as Post | undefined;

      const fallbackPost: Post = directPost ?? {
        id: postId,
        user_id: user.id,
        content,
        media_urls: mediaUrls,
        media_type: mediaType,
        likes_count: 0,
        comments_count: 0,
        shares_count: 0,
        bookmarks_count: 0,
        reposts_count: 0,
        views_count: 0,
        is_pinned: false,
        visibility,
        formatted_content: options.formattedContent ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createdPost = error || !data ? fallbackPost : data;

      if (error) {
        console.warn('Post yaratildi, lekin UI refetch bajarilmadi:', error);
      }

      if (
        !isScheduled &&
        visibility === 'public' &&
        (options.postKind ?? 'post') !== 'story'
      ) {
        setPosts((prev) => [createdPost, ...prev]);
      }

      if (metaErrors.length > 0) {
        toast({
          title: 'Post joylandi',
          description:
            `Production bazasi yangilanmagani uchun ${Array.from(new Set(metaErrors)).join(', ')} vaqtincha saqlanmadi.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: isScheduled ? 'Rejalashtirildi' : 'Posted!',
          description: isScheduled
            ? 'Post belgilangan vaqtda e‘lon qilinadi.'
            : collaborators.length > 0
              ? 'Post joylandi va hammualliflarga taklif yuborildi.'
              : 'Post muvaffaqiyatli joylandi.',
        });
      }

      return createdPost;
    } catch (error: any) {
      console.error('Error creating post:', error);
      toast({
        title: 'Post joylanmadi',
        description: error?.message ?? 'Postni yaratishda xatolik yuz berdi',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, toast]);

  const likePost = useCallback(async (postId: string) => {
    if (!user) return;

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    try {
      if (post.is_liked) {
        await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);

        setPosts(prev => prev.map(p =>
          p.id === postId
            ? { ...p, is_liked: false, likes_count: p.likes_count - 1 }
            : p
        ));
      } else {
        await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: user.id });

        setPosts(prev => prev.map(p =>
          p.id === postId
            ? { ...p, is_liked: true, likes_count: p.likes_count + 1 }
            : p
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  }, [user, posts]);

  const toggleBookmark = useCallback(async (postId: string) => {
    if (!user) return;

    const current = posts.find((post) => post.id === postId);
    if (!current) return;

    const wasBookmarked = Boolean(current.is_bookmarked);
    setPosts((previous) =>
      previous.map((post) =>
        post.id === postId
          ? { ...post, is_bookmarked: !wasBookmarked }
          : post,
      ),
    );

    try {
      const result = wasBookmarked
        ? await db
            .from('bookmarks')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', user.id)
        : await db
            .from('bookmarks')
            .insert({ post_id: postId, user_id: user.id });

      if (result.error) throw result.error;
    } catch (error) {
      console.error('Bookmark saqlanmadi:', error);
      setPosts((previous) =>
        previous.map((post) =>
          post.id === postId
            ? { ...post, is_bookmarked: wasBookmarked }
            : post,
        ),
      );
    }
  }, [posts, user]);

  const hidePost = useCallback(async (postId: string) => {
    setPosts((previous) => previous.filter((post) => post.id !== postId));
    if (!user) return;

    const { error } = await db.from('content_hides').insert({
      post_id: postId,
      user_id: user.id,
      reason: 'not_interested',
    });

    // Duplicate hide rows are harmless; any other failure is logged. The local
    // feed still respects the user's immediate action.
    if (error && String((error as any).code ?? '') !== '23505') {
      console.warn('Not interested signali saqlanmadi:', error);
    }
  }, [user]);

  const deletePost = useCallback(async (postId: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      setPosts(prev => prev.filter(p => p.id !== postId));
      toast({
        title: 'Deleted',
        description: 'Post has been deleted.',
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete post',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // fetchPosts identity filter va user ga bog'liq. Ilgari deps faqat [filter]
  // edi, shuning uchun login/logout dan keyin feed qayta yuklanmasdan eski
  // (yoki bo'sh) holatda qolib ketardi.
  useEffect(() => {
    setPage(0);
    setHasMore(true);
    fetchPosts(0, true);
  }, [fetchPosts]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('posts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
        },
        async (payload) => {
          if (payload.new.post_kind === 'story') return;

          const newId = (payload.new as { id?: string } | null)?.id;
          if (!newId) return;

          // Fetch the full post with profile (embed yo'q bo'lsa ham ishlaydi)
          const { data: rows, error } = await runWithProfileEmbedFallback<PostRow>(
            postEmbedGuard,
            (select) =>
              supabase
                .from('posts')
                .select(select)
                .eq('id', newId)
                .limit(1) as unknown as PromiseLike<EmbedQueryResult<PostRow>>,
            {
              embedSelect: POST_SELECT_WITH_PROFILE,
              plainSelect: POST_SELECT_PLAIN,
            },
          );

          if (error) {
            console.warn('Realtime post yuklanmadi:', error);
            return;
          }

          const data = (rows ?? [])[0] as unknown as Post | undefined;

          if (data && data.user_id !== user?.id) {
            setPosts(prev => (prev.some(p => p.id === data.id) ? prev : [data, ...prev]));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    posts,
    isLoading,
    hasMore,
    loadMore,
    refresh,
    createPost,
    likePost,
    toggleBookmark,
    hidePost,
    deletePost,
  };
}
