-- Stage 1 ecosystem consolidation into the canonical social Supabase project.
-- Adds only non-colliding accounts/mail tables and safe compatibility columns.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Collision tables: reuse social tables, only add missing compatibility columns.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{"theme":"dark","compactMode":false,"aiEnabled":true}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Mail-only tables.
CREATE TABLE IF NOT EXISTS public.emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid,
  from_name text NOT NULL,
  from_email text NOT NULL,
  from_avatar text,
  to_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_recipients jsonb DEFAULT '[]'::jsonb,
  subject text NOT NULL,
  snippet text,
  body text NOT NULL,
  is_read boolean DEFAULT false,
  is_starred boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'medium', 'high')),
  folder text DEFAULT 'inbox',
  labels text[] DEFAULT '{}',
  attachments jsonb DEFAULT '[]'::jsonb,
  ai_summary text,
  ai_actions jsonb DEFAULT '[]'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own emails" ON public.emails;
CREATE POLICY "Users can view their own emails" ON public.emails FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own emails" ON public.emails;
CREATE POLICY "Users can insert their own emails" ON public.emails FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own emails" ON public.emails;
CREATE POLICY "Users can update their own emails" ON public.emails FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own emails" ON public.emails;
CREATE POLICY "Users can delete their own emails" ON public.emails FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON public.emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_folder ON public.emails(folder);
CREATE INDEX IF NOT EXISTS idx_emails_timestamp ON public.emails(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON public.emails(thread_id);
DROP TRIGGER IF EXISTS update_emails_updated_at ON public.emails;
CREATE TRIGGER update_emails_updated_at BEFORE UPDATE ON public.emails FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_recipients text DEFAULT '',
  cc_recipients text DEFAULT '',
  subject text DEFAULT '',
  body text DEFAULT '',
  attachments jsonb DEFAULT '[]'::jsonb,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own drafts" ON public.drafts;
CREATE POLICY "Users can view their own drafts" ON public.drafts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own drafts" ON public.drafts;
CREATE POLICY "Users can create their own drafts" ON public.drafts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own drafts" ON public.drafts;
CREATE POLICY "Users can update their own drafts" ON public.drafts FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own drafts" ON public.drafts;
CREATE POLICY "Users can delete their own drafts" ON public.drafts FOR DELETE USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_drafts_updated_at ON public.drafts;
CREATE TRIGGER update_drafts_updated_at BEFORE UPDATE ON public.drafts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.labels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own labels" ON public.labels;
CREATE POLICY "Users can view their own labels" ON public.labels FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own labels" ON public.labels;
CREATE POLICY "Users can create their own labels" ON public.labels FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own labels" ON public.labels;
CREATE POLICY "Users can update their own labels" ON public.labels FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own labels" ON public.labels;
CREATE POLICY "Users can delete their own labels" ON public.labels FOR DELETE USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_labels_updated_at ON public.labels;
CREATE TRIGGER update_labels_updated_at BEFORE UPDATE ON public.labels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.scheduled_emails (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_recipients jsonb DEFAULT '[]'::jsonb,
  subject text NOT NULL,
  body text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own scheduled emails" ON public.scheduled_emails;
CREATE POLICY "Users can view their own scheduled emails" ON public.scheduled_emails FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own scheduled emails" ON public.scheduled_emails;
CREATE POLICY "Users can create their own scheduled emails" ON public.scheduled_emails FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own scheduled emails" ON public.scheduled_emails;
CREATE POLICY "Users can update their own scheduled emails" ON public.scheduled_emails FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own scheduled emails" ON public.scheduled_emails;
CREATE POLICY "Users can delete their own scheduled emails" ON public.scheduled_emails FOR DELETE USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_scheduled_emails_updated_at ON public.scheduled_emails;
CREATE TRIGGER update_scheduled_emails_updated_at BEFORE UPDATE ON public.scheduled_emails FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Accounts / identity / OIDC tables.
CREATE TABLE IF NOT EXISTS public.oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text UNIQUE NOT NULL DEFAULT ('client_' || gen_random_uuid()::text),
  client_secret text NOT NULL DEFAULT ('secret_' || encode(gen_random_bytes(32), 'hex')),
  name text NOT NULL,
  description text,
  logo_url text,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  allowed_scopes text[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
  is_verified boolean DEFAULT false,
  is_active boolean DEFAULT true,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own OAuth clients" ON public.oauth_clients;
CREATE POLICY "Users can view their own OAuth clients" ON public.oauth_clients FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can create OAuth clients" ON public.oauth_clients;
CREATE POLICY "Users can create OAuth clients" ON public.oauth_clients FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can update their own OAuth clients" ON public.oauth_clients;
CREATE POLICY "Users can update their own OAuth clients" ON public.oauth_clients FOR UPDATE USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can delete their own OAuth clients" ON public.oauth_clients;
CREATE POLICY "Users can delete their own OAuth clients" ON public.oauth_clients FOR DELETE USING (auth.uid() = owner_id);
DROP TRIGGER IF EXISTS update_oauth_clients_updated_at ON public.oauth_clients;
CREATE TRIGGER update_oauth_clients_updated_at BEFORE UPDATE ON public.oauth_clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  scope text NOT NULL,
  state text,
  code_challenge text,
  code_challenge_method text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own auth codes" ON public.oauth_authorization_codes;
CREATE POLICY "Users can view their own auth codes" ON public.oauth_authorization_codes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create auth codes" ON public.oauth_authorization_codes;
CREATE POLICY "Users can create auth codes" ON public.oauth_authorization_codes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.oauth_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(64), 'hex'),
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  revoked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own access tokens" ON public.oauth_access_tokens;
CREATE POLICY "Users can view their own access tokens" ON public.oauth_access_tokens FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can revoke their own access tokens" ON public.oauth_access_tokens;
CREATE POLICY "Users can revoke their own access tokens" ON public.oauth_access_tokens FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.oauth_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(64), 'hex'),
  access_token_id uuid REFERENCES public.oauth_access_tokens(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own refresh tokens" ON public.oauth_refresh_tokens;
CREATE POLICY "Users can view their own refresh tokens" ON public.oauth_refresh_tokens FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can revoke their own refresh tokens" ON public.oauth_refresh_tokens;
CREATE POLICY "Users can revoke their own refresh tokens" ON public.oauth_refresh_tokens FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  api_key text NOT NULL UNIQUE DEFAULT 'ak_' || encode(gen_random_bytes(20), 'hex'),
  secret_key text DEFAULT 'sk_' || encode(gen_random_bytes(20), 'hex'),
  key_type text NOT NULL DEFAULT 'public' CHECK (key_type IN ('public', 'secret')),
  domains text[] DEFAULT ARRAY[]::text[],
  is_active boolean DEFAULT true,
  requests_today integer DEFAULT 0,
  requests_limit integer DEFAULT 10000,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;
CREATE POLICY "Users can view their own API keys" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own API keys" ON public.api_keys;
CREATE POLICY "Users can create their own API keys" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own API keys" ON public.api_keys;
CREATE POLICY "Users can update their own API keys" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own API keys" ON public.api_keys;
CREATE POLICY "Users can delete their own API keys" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_api_keys_updated_at ON public.api_keys;
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  status_code integer NOT NULL,
  response_time_ms integer,
  ip_address text,
  user_agent text,
  request_body jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_key_id ON public.api_usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON public.api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_id ON public.api_usage_logs(user_id);
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own API usage logs" ON public.api_usage_logs;
CREATE POLICY "Users can view their own API usage logs" ON public.api_usage_logs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role can insert logs" ON public.api_usage_logs;
CREATE POLICY "Service role can insert logs" ON public.api_usage_logs FOR INSERT WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.rate_limit_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  threshold_percent integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_notifications_key_date ON public.rate_limit_notifications (api_key_id, sent_at);
ALTER TABLE public.rate_limit_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own rate limit notifications" ON public.rate_limit_notifications;
CREATE POLICY "Users can view their own rate limit notifications" ON public.rate_limit_notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role can insert rate limit notifications" ON public.rate_limit_notifications;
CREATE POLICY "Service role can insert rate limit notifications" ON public.rate_limit_notifications FOR INSERT WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.user_security (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  two_fa_enabled boolean DEFAULT false,
  two_fa_method text,
  passkey_enabled boolean DEFAULT false,
  recovery_codes text[],
  security_score integer DEFAULT 50,
  last_password_change timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.user_security ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own security settings" ON public.user_security;
CREATE POLICY "Users can view their own security settings" ON public.user_security FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own security settings" ON public.user_security;
CREATE POLICY "Users can update their own security settings" ON public.user_security FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own security settings" ON public.user_security;
CREATE POLICY "Users can insert their own security settings" ON public.user_security FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_user_security_updated_at ON public.user_security;
CREATE TRIGGER update_user_security_updated_at BEFORE UPDATE ON public.user_security FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.kids_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_first_name text NOT NULL,
  child_last_name text NOT NULL,
  child_username text NOT NULL UNIQUE,
  child_age integer NOT NULL,
  screen_time_limit integer NOT NULL DEFAULT 120,
  content_filter_level text NOT NULL DEFAULT 'moderate',
  app_restrictions boolean NOT NULL DEFAULT true,
  sleep_mode_enabled boolean NOT NULL DEFAULT true,
  sleep_mode_start text DEFAULT '21:00',
  sleep_mode_end text DEFAULT '07:00',
  parent_approval_required boolean NOT NULL DEFAULT true,
  location_sharing boolean NOT NULL DEFAULT true,
  device_name text,
  device_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kids_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Parents can view their kids accounts" ON public.kids_accounts;
CREATE POLICY "Parents can view their kids accounts" ON public.kids_accounts FOR SELECT USING (auth.uid() = parent_id);
DROP POLICY IF EXISTS "Parents can create kids accounts" ON public.kids_accounts;
CREATE POLICY "Parents can create kids accounts" ON public.kids_accounts FOR INSERT WITH CHECK (auth.uid() = parent_id);
DROP POLICY IF EXISTS "Parents can update their kids accounts" ON public.kids_accounts;
CREATE POLICY "Parents can update their kids accounts" ON public.kids_accounts FOR UPDATE USING (auth.uid() = parent_id);
DROP POLICY IF EXISTS "Parents can delete their kids accounts" ON public.kids_accounts;
CREATE POLICY "Parents can delete their kids accounts" ON public.kids_accounts FOR DELETE USING (auth.uid() = parent_id);
DROP TRIGGER IF EXISTS update_kids_accounts_updated_at ON public.kids_accounts;
CREATE TRIGGER update_kids_accounts_updated_at BEFORE UPDATE ON public.kids_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.business_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  industry text,
  company_size text,
  company_domain text,
  company_address text,
  tax_id text,
  admin_first_name text,
  admin_last_name text,
  admin_email text,
  admin_phone text,
  domain_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners can view their business accounts" ON public.business_accounts;
CREATE POLICY "Owners can view their business accounts" ON public.business_accounts FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners can create business accounts" ON public.business_accounts;
CREATE POLICY "Owners can create business accounts" ON public.business_accounts FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners can update their business accounts" ON public.business_accounts;
CREATE POLICY "Owners can update their business accounts" ON public.business_accounts FOR UPDATE USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners can delete their business accounts" ON public.business_accounts;
CREATE POLICY "Owners can delete their business accounts" ON public.business_accounts FOR DELETE USING (auth.uid() = owner_id);
DROP TRIGGER IF EXISTS update_business_accounts_updated_at ON public.business_accounts;
CREATE TRIGGER update_business_accounts_updated_at BEFORE UPDATE ON public.business_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.saved_passwords (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  website text NOT NULL,
  website_url text,
  username text NOT NULL,
  encrypted_password text NOT NULL,
  notes text,
  category text DEFAULT 'general',
  favicon_url text,
  strength text DEFAULT 'medium' CHECK (strength IN ('weak', 'medium', 'strong')),
  is_breached boolean DEFAULT false,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saved_passwords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own passwords" ON public.saved_passwords;
CREATE POLICY "Users can view their own passwords" ON public.saved_passwords FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own passwords" ON public.saved_passwords;
CREATE POLICY "Users can insert their own passwords" ON public.saved_passwords FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own passwords" ON public.saved_passwords;
CREATE POLICY "Users can update their own passwords" ON public.saved_passwords FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own passwords" ON public.saved_passwords;
CREATE POLICY "Users can delete their own passwords" ON public.saved_passwords FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_saved_passwords_updated_at ON public.saved_passwords;
CREATE TRIGGER update_saved_passwords_updated_at BEFORE UPDATE ON public.saved_passwords FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
