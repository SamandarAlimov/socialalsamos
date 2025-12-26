-- Create verification_requests table for Instagram-like verification system
CREATE TABLE public.verification_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  known_as TEXT,
  category TEXT NOT NULL, -- 'creator', 'business', 'news', 'government', 'other'
  bio_link TEXT,
  id_document_url TEXT,
  additional_info TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view their own verification requests"
ON public.verification_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "Users can create their own verification requests"
ON public.verification_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their pending requests
CREATE POLICY "Users can update their pending verification requests"
ON public.verification_requests
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

-- Create index for faster lookups
CREATE INDEX idx_verification_requests_user_id ON public.verification_requests(user_id);
CREATE INDEX idx_verification_requests_status ON public.verification_requests(status);

-- Update profiles table for the @alsamos account verification
UPDATE public.profiles 
SET is_verified = true 
WHERE username = 'alsamos';