-- Add autoplay settings columns to user_settings table
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS autoplay_voice_messages boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS autoplay_video_messages boolean DEFAULT true;