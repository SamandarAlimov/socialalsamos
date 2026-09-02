import type { Notification } from '@/hooks/useNotifications';

export type NotificationMentionContext = 'post' | 'comment' | 'reply' | 'unknown';

function dataString(notification: Notification, key: string): string | null {
  const value = notification.data?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function notificationCommentId(notification: Notification): string | null {
  return dataString(notification, 'comment_id') ?? notification.comment?.id ?? null;
}

export function notificationPostId(notification: Notification): string | null {
  return dataString(notification, 'post_id') ?? notification.post?.id ?? null;
}

export function notificationMentionContext(
  notification: Notification,
): NotificationMentionContext {
  const explicit = dataString(notification, 'mention_context');
  if (explicit === 'post' || explicit === 'comment' || explicit === 'reply') return explicit;

  if (notification.type === 'reply') return 'reply';
  if (notification.type !== 'mention' && notification.type !== 'comment_mention') return 'unknown';

  if (notification.comment?.parent_id || dataString(notification, 'parent_comment_id')) {
    return 'reply';
  }
  if (notificationCommentId(notification)) return 'comment';
  if (notificationPostId(notification)) return 'post';
  return 'unknown';
}

export function notificationContextLabel(notification: Notification): string | null {
  if (notification.type === 'mention' || notification.type === 'comment_mention') {
    const context = notificationMentionContext(notification);
    if (context === 'reply') return 'Javobda';
    if (context === 'comment') return 'Izohda';
    if (context === 'post') return 'Postda';
  }

  if (notification.type === 'reply') return 'Javob';
  if (notification.type === 'comment_like') return 'Izoh';
  if (notification.type === 'collaboration_invite') return 'Taklif';
  if (notification.type === 'collaboration_accepted') return 'Qabul qilindi';
  if (notification.type === 'collaboration_declined') return 'Rad etildi';
  if (notification.type === 'collaboration_revoked') return 'Bekor qilindi';
  if (notification.type === 'collaboration_removed') return 'Tugatildi';
  if (notification.type === 'collaboration_left') return 'Chiqdi';

  return null;
}

export function notificationActionText(notification: Notification): string {
  switch (notification.type) {
    case 'like':
      return 'postingizni yoqtirdi';
    case 'comment':
      return notification.comment?.parent_id
        ? 'postingizdagi suhbatga javob yozdi'
        : 'postingizga izoh qoldirdi';
    case 'reply':
      return 'izohingizga javob berdi';
    case 'comment_like':
      return 'izohingizni yoqtirdi';
    case 'follow':
      return 'sizga obuna bo‘ldi';
    case 'mention':
    case 'comment_mention': {
      const context = notificationMentionContext(notification);
      if (context === 'reply') return 'javobda sizni belgiladi';
      if (context === 'comment') return 'izohda sizni belgiladi';
      if (context === 'post') return 'postda sizni belgiladi';
      return 'sizni belgiladi';
    }
    case 'message':
      return 'sizga xabar yubordi';
    case 'collaboration_invite':
      return 'sizni postga hammuallif bo‘lishga taklif qildi';
    case 'collaboration_accepted':
      return 'hammualliflik taklifingizni qabul qildi';
    case 'collaboration_declined':
      return 'hammualliflik taklifingizni rad etdi';
    case 'collaboration_revoked':
      return 'hammualliflik taklifini bekor qildi';
    case 'collaboration_removed':
      return 'sizni hammualliflikdan olib tashladi';
    case 'collaboration_left':
      return 'post hammuallifligidan chiqdi';
    default:
      return notification.body || 'yangi faollik';
  }
}

export function notificationPreviewText(notification: Notification): string | null {
  const direct =
    dataString(notification, 'content_preview') ??
    dataString(notification, 'comment_preview') ??
    dataString(notification, 'message_preview');

  const value = direct ?? notification.comment?.content ?? null;
  if (!value) return null;

  const cleaned = value
    .replace(/\[media:[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned ? cleaned.slice(0, 180) : null;
}

/**
 * E'tibor talab qiladigan eventlar foydalanuvchi ochmaguncha unread qoladi.
 * Passiv signal eventlari esa notification center'da yetarli vaqt ko'rilganda
 * avtomatik read bo'lishi mumkin.
 */
export function notificationNeedsExplicitRead(notification: Notification): boolean {
  return (
    notification.type === 'comment' ||
    notification.type === 'reply' ||
    notification.type === 'mention' ||
    notification.type === 'comment_mention' ||
    notification.type === 'collaboration_invite' ||
    notification.type === 'message'
  );
}

export function notificationTarget(
  notification: Notification,
  returnTo?: string | null,
): string | null {
  const postId = notificationPostId(notification);
  const commentId = notificationCommentId(notification);

  if (notification.type === 'follow' && notification.actor) {
    return '/user/' + (notification.actor.username || notification.actor.id);
  }

  if (notification.type === 'message') {
    const conversationId =
      dataString(notification, 'conversation_id') ?? dataString(notification, 'chat_id');
    return conversationId ? '/messages?conversation=' + encodeURIComponent(conversationId) : '/messages';
  }

  if (postId) {
    const params = new URLSearchParams({ post: postId });
    if (commentId) params.set('comment', commentId);
    if (returnTo && returnTo.startsWith('/')) params.set('returnTo', returnTo);
    return '/home?' + params.toString();
  }

  if (notification.actor) {
    return '/user/' + (notification.actor.username || notification.actor.id);
  }

  return null;
}
