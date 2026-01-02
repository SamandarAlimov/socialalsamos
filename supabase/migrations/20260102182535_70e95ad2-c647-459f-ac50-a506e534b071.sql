-- Add notification preference columns to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS notify_likes boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_comments boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_follows boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_mentions boolean DEFAULT true;