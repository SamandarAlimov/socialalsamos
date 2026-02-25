
-- Create mini_apps table for user-created mini applications
CREATE TABLE public.mini_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  icon_url TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  is_approved BOOLEAN NOT NULL DEFAULT true,
  users_count INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mini_apps ENABLE ROW LEVEL SECURITY;

-- Everyone can view approved mini apps
CREATE POLICY "Anyone can view approved mini apps"
ON public.mini_apps FOR SELECT
USING (is_approved = true OR user_id = auth.uid());

-- Users can create their own mini apps
CREATE POLICY "Users can create mini apps"
ON public.mini_apps FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own mini apps
CREATE POLICY "Users can update own mini apps"
ON public.mini_apps FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own mini apps
CREATE POLICY "Users can delete own mini apps"
ON public.mini_apps FOR DELETE
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_mini_apps_updated_at
BEFORE UPDATE ON public.mini_apps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert islom.uz as the first real mini app (for user islomuz)
-- We'll do this after finding the user
