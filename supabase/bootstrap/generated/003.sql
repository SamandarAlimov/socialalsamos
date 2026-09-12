-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260708090000_ecosystem_consolidation_stage1.sql
-- SHA256 7e795dde489904d821363fd02e9c72138da2a23a70c269058f68a0c399fccb5c
-- ============================================================================
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


-- ============================================================================
-- SOURCE A-superapp: 20260711_global_search.sql
-- SHA256 b074dea41fa38ae118c288540101eafd6930a45da9a6395ed1b7a5500482d567
-- ============================================================================
-- Migration: Global Web Search (FIXED)
-- Add search preferences to user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS search_safe_mode TEXT DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS search_region   TEXT DEFAULT 'uz',
  ADD COLUMN IF NOT EXISTS search_language TEXT DEFAULT 'uz';

-- search_history table
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- search_cache table
CREATE TABLE IF NOT EXISTS search_cache (
  cache_key TEXT PRIMARY KEY,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_created   ON search_cache(created_at);

-- RLS on search_history
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- FIX: DROP + CREATE (CREATE POLICY IF NOT EXISTS o'rniga)
DROP POLICY IF EXISTS search_history_user_policy ON search_history;
CREATE POLICY search_history_user_policy ON search_history
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Cleanup functions
CREATE OR REPLACE FUNCTION cleanup_old_search_history()
RETURNS void AS $$
BEGIN
  DELETE FROM search_history WHERE created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_search_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM search_cache WHERE created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Grants
GRANT SELECT, INSERT, DELETE ON search_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON search_cache TO service_role;

-- Comments
COMMENT ON TABLE  search_history IS 'User web search query history';
COMMENT ON TABLE  search_cache   IS 'Cached search results (shared, TTL 1 hour)';
COMMENT ON COLUMN user_settings.search_safe_mode IS 'Safe search level: off, moderate, strict';
COMMENT ON COLUMN user_settings.search_region    IS 'Search region code (uz, us, ru, etc)';
COMMENT ON COLUMN user_settings.search_language  IS 'Search language code (uz, en, ru)';

-- Reload API cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SOURCE A-superapp: 20260711_marketplace_tables.sql
-- SHA256 eca0e0dbbc31022403a5a7c213c6d6562b3737af6669acbea1b0890b6d99930b
-- ============================================================================
-- Migration: Marketplace — user addresses & store profiles (FIXED)

-- user_addresses
CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  address_line TEXT NOT NULL,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- user_stores
CREATE TABLE IF NOT EXISTS user_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(user_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_user_stores_user_id    ON user_stores(user_id);

-- RLS
ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stores    ENABLE ROW LEVEL SECURITY;

-- FIX 1: policies via DROP + CREATE (CREATE POLICY IF NOT EXISTS o'rniga)
DROP POLICY IF EXISTS user_addresses_policy ON user_addresses;
CREATE POLICY user_addresses_policy ON user_addresses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_stores_policy ON user_stores;
CREATE POLICY user_stores_policy ON user_stores
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- FIX 2: triggers idempotent (DROP + CREATE)
DROP TRIGGER IF EXISTS update_user_addresses_updated_at ON user_addresses;
CREATE TRIGGER update_user_addresses_updated_at
  BEFORE UPDATE ON user_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_stores_updated_at ON user_stores;
CREATE TRIGGER update_user_stores_updated_at
  BEFORE UPDATE ON user_stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON user_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_stores    TO authenticated;

-- Comments
COMMENT ON TABLE  user_addresses IS 'Shipping addresses for marketplace orders';
COMMENT ON TABLE  user_stores    IS 'Seller store profiles for marketplace';
COMMENT ON COLUMN user_addresses.is_default IS 'Only one address per user can be default';
COMMENT ON COLUMN user_stores.logo_url IS 'Uploaded to Supabase Storage public bucket';

-- Reload API cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SOURCE A-superapp: 20260711_settings_backend_columns.sql
-- SHA256 de6853f7e486df8ff8d947fa058428b158380a38bd066959b1bbb9e8c11a868b
-- ============================================================================
-- Migration: Backend persistence columns for Map, AI, Marketplace settings (FIXED)

-- Map settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS map_share_location BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS map_style TEXT DEFAULT 'standard';

-- AI settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'gpt-4',
  ADD COLUMN IF NOT EXISTS ai_personalization BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_data_sharing BOOLEAN DEFAULT false;

-- Marketplace settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS marketplace_order_notifications BOOLEAN DEFAULT true;

-- Messages settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS msg_enter_to_send BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_auto_download_images BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_auto_download_videos BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS msg_text_size DOUBLE PRECISION DEFAULT 16.0;

-- Index
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Comments
COMMENT ON COLUMN user_settings.map_share_location IS 'Allow sharing user location on map';
COMMENT ON COLUMN user_settings.map_style IS 'Map display style: standard, satellite, or terrain';
COMMENT ON COLUMN user_settings.ai_model IS 'Selected AI model: gpt-4 or gpt-3.5';
COMMENT ON COLUMN user_settings.ai_personalization IS 'Enable AI personalized responses';
COMMENT ON COLUMN user_settings.ai_data_sharing IS 'Consent to use data for AI improvement';
COMMENT ON COLUMN user_settings.marketplace_order_notifications IS 'Enable order status notifications';
COMMENT ON COLUMN user_settings.msg_enter_to_send IS 'Use Enter key to send messages';
COMMENT ON COLUMN user_settings.msg_auto_download_images IS 'Auto-download images on WiFi and mobile';
COMMENT ON COLUMN user_settings.msg_auto_download_videos IS 'Auto-download videos on WiFi only';
COMMENT ON COLUMN user_settings.msg_text_size IS 'Message text size in pixels';

-- ai_chat_messages table
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user_id ON ai_chat_messages(user_id, created_at DESC);

-- RLS
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- FIX: DROP + CREATE (CREATE POLICY IF NOT EXISTS o'rniga)
DROP POLICY IF EXISTS ai_chat_messages_user_policy ON ai_chat_messages;
CREATE POLICY ai_chat_messages_user_policy ON ai_chat_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Grant
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_chat_messages TO authenticated;

-- Reload API cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SOURCE A-superapp: 20260711013000_fix_message_reads_upsert_policy.sql
-- SHA256 759519b9a8958857ef24699b06f36ec2a55ab55a014ce0c774fb5aac6909f714
-- ============================================================================
-- Allow authenticated conversation participants to insert/update their own
-- read receipts. Supabase upsert needs UPDATE permission when the unique
-- (message_id, user_id) row already exists.

DROP POLICY IF EXISTS "Users can mark as read" ON public.message_reads;
DROP POLICY IF EXISTS "Users can update own read receipts" ON public.message_reads;

CREATE POLICY "Users can mark as read" ON public.message_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own read receipts" ON public.message_reads
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND cp.user_id = auth.uid()
    )
  );


-- ============================================================================
-- SOURCE A-superapp: 20260711023000_add_client_message_id.sql
-- SHA256 8ff8ca499e396953cf8ded5815dbdfec903c3ca25add9997a8576a7c269db2fa
-- ============================================================================
alter table public.messages
  add column if not exists client_message_id text;

create unique index if not exists messages_sender_client_message_id_idx
  on public.messages(sender_id, client_message_id)
  where client_message_id is not null;


-- ============================================================================
-- SOURCE A-superapp: 20260711024500_fix_call_participants_rls.sql
-- SHA256 6f3d53aedcb67acb2f5e1206577f3ca1b8265c76fe6033cb7e7c19ec4d753848
-- ============================================================================
drop policy if exists "Users can join calls" on public.call_participants;

create policy "Users can join calls"
on public.call_participants
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.video_calls vc
    join public.conversation_participants cp
      on cp.conversation_id = vc.conversation_id
    where vc.id = call_participants.call_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own participation" on public.call_participants;

create policy "Users can update own participation"
on public.call_participants
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

drop policy if exists "Call host can invite conversation participants" on public.call_participants;

create policy "Call host can invite conversation participants"
on public.call_participants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.video_calls vc
    join public.conversation_participants cp
      on cp.conversation_id = vc.conversation_id
     and cp.user_id = call_participants.user_id
    where vc.id = call_participants.call_id
      and vc.host_id = auth.uid()
  )
);


-- ============================================================================
-- SOURCE A-superapp: 20260711030000_phase2_message_interactions.sql
-- SHA256 74876cc5b3d57726e0a4a0c07c02e66b45e030d1856c997e3f9003b009d9e957
-- ============================================================================
-- Phase 2 message interactions: reactions, forwards, edit history, drafts, tombstones, link previews.

alter table public.messages
  add column if not exists forwarded_from_message_id uuid references public.messages(id) on delete set null,
  add column if not exists forwarded_from_name text,
  add column if not exists is_silent boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_messages_forwarded_from_message_id
  on public.messages(forwarded_from_message_id);
create index if not exists idx_messages_deleted_at
  on public.messages(conversation_id, deleted_at);
create index if not exists idx_messages_updated_at
  on public.messages(conversation_id, updated_at desc);

alter table public.message_reactions
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_message_reactions_message_id
  on public.message_reactions(message_id);
create index if not exists idx_message_reactions_user_id
  on public.message_reactions(user_id);
create index if not exists idx_message_reactions_updated_at
  on public.message_reactions(updated_at desc);

create table if not exists public.message_edit_history (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade,
  previous_content text,
  new_content text,
  edited_at timestamptz not null default now()
);

create index if not exists idx_message_edit_history_message_id
  on public.message_edit_history(message_id, edited_at desc);
create index if not exists idx_message_edit_history_conversation_id
  on public.message_edit_history(conversation_id, edited_at desc);

alter table public.message_edit_history enable row level security;

drop policy if exists "Participants can view edit history" on public.message_edit_history;
create policy "Participants can view edit history"
  on public.message_edit_history for select
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = message_edit_history.conversation_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "Message sender can write edit history" on public.message_edit_history;
create policy "Message sender can write edit history"
  on public.message_edit_history for insert
  with check (
    editor_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_edit_history.message_id
        and m.sender_id = auth.uid()
        and m.conversation_id = message_edit_history.conversation_id
    )
  );

create table if not exists public.message_drafts (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_message_drafts_user_updated
  on public.message_drafts(user_id, updated_at desc);

alter table public.message_drafts enable row level security;

drop policy if exists "Users can read own drafts" on public.message_drafts;
create policy "Users can read own drafts"
  on public.message_drafts for select
  using (user_id = auth.uid());

drop policy if exists "Users can upsert own drafts in joined conversations" on public.message_drafts;
create policy "Users can upsert own drafts in joined conversations"
  on public.message_drafts for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = message_drafts.conversation_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own drafts" on public.message_drafts;
create policy "Users can update own drafts"
  on public.message_drafts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.link_previews (
  url text primary key,
  title text,
  description text,
  image_url text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_link_previews_updated_at
  on public.link_previews(updated_at desc);

alter table public.link_previews enable row level security;

drop policy if exists "Authenticated users can read link previews" on public.link_previews;
create policy "Authenticated users can read link previews"
  on public.link_previews for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can cache link previews" on public.link_previews;
create policy "Authenticated users can cache link previews"
  on public.link_previews for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can refresh link previews" on public.link_previews;
create policy "Authenticated users can refresh link previews"
  on public.link_previews for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table public.scheduled_messages
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists is_silent boolean not null default false,
  add column if not exists status text not null default 'scheduled',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_scheduled_messages_status_time
  on public.scheduled_messages(status, scheduled_for);
create index if not exists idx_scheduled_messages_sender_time
  on public.scheduled_messages(sender_id, scheduled_for);

drop policy if exists "Participants can update message tombstones" on public.messages;
create policy "Participants can update message tombstones"
  on public.messages for update
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id = auth.uid()
    )
  )
  with check (
    sender_id = auth.uid()
    or exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id = auth.uid()
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.message_edit_history;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.message_drafts;
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- SOURCE A-superapp: 20260711033000_phase3_realtime_presence.sql
-- SHA256 c65fef34d77abb33b0528c554fcd8a9447790b7f9f79fe23282f6d20b609157a
-- ============================================================================
-- Phase 3 realtime/presence: privacy-filtered presence and read-state indexes.

create table if not exists public.user_privacy_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  rule text not null check (rule in ('allow', 'deny')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_user_id)
);

create index if not exists idx_user_privacy_exceptions_user_target
  on public.user_privacy_exceptions(user_id, target_user_id);
create index if not exists idx_user_privacy_exceptions_target
  on public.user_privacy_exceptions(target_user_id);

alter table public.user_privacy_exceptions enable row level security;

drop policy if exists "Users manage own privacy exceptions" on public.user_privacy_exceptions;
create policy "Users manage own privacy exceptions"
  on public.user_privacy_exceptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_message_reads_message_read_at
  on public.message_reads(message_id, read_at desc);
create index if not exists idx_message_reads_user_read_at
  on public.message_reads(user_id, read_at desc);

drop policy if exists "Users can mark as read" on public.message_reads;
create policy "Users can mark as read"
  on public.message_reads for insert
  with check (
    user_id = auth.uid()
    and coalesce((
      select us.read_receipts_enabled
      from public.user_settings us
      where us.user_id = auth.uid()
    ), true)
    and exists (
      select 1
      from public.messages m
      join public.conversation_participants cp
        on cp.conversation_id = m.conversation_id
      where m.id = message_reads.message_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own read receipts" on public.message_reads;
create policy "Users can update own read receipts"
  on public.message_reads for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and coalesce((
      select us.read_receipts_enabled
      from public.user_settings us
      where us.user_id = auth.uid()
    ), true)
    and exists (
      select 1
      from public.messages m
      join public.conversation_participants cp
        on cp.conversation_id = m.conversation_id
      where m.id = message_reads.message_id
        and cp.user_id = auth.uid()
    )
  );

create or replace function public.are_contacts(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.follows f1
    join public.follows f2
      on f2.follower_id = b and f2.following_id = a
    where f1.follower_id = a and f1.following_id = b
  );
$$;

create or replace function public.can_view_presence(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  visibility text;
  exception_rule text;
begin
  if viewer is null then
    return false;
  end if;
  if viewer = target_user_id then
    return true;
  end if;

  select rule into exception_rule
  from public.user_privacy_exceptions
  where user_id = target_user_id and target_user_id = viewer
  limit 1;

  if exception_rule = 'allow' then
    return true;
  elsif exception_rule = 'deny' then
    return false;
  end if;

  select coalesce(last_seen_visibility, 'everyone') into visibility
  from public.user_settings
  where user_id = target_user_id;

  visibility := coalesce(visibility, 'everyone');

  if visibility = 'everyone' then
    return true;
  elsif visibility = 'contacts' then
    return public.are_contacts(target_user_id, viewer);
  end if;

  return false;
end;
$$;

create or replace function public.get_visible_presence(target_user_id uuid)
returns table(user_id uuid, is_online boolean, last_seen timestamptz)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    case when public.can_view_presence(target_user_id) then coalesce(p.is_online, false) else false end as is_online,
    case when public.can_view_presence(target_user_id) then p.last_seen else null end as last_seen
  from public.profiles p
  where p.id = target_user_id
  limit 1;
$$;

grant execute on function public.are_contacts(uuid, uuid) to authenticated;
grant execute on function public.can_view_presence(uuid) to authenticated;
grant execute on function public.get_visible_presence(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.message_reads;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.typing_indicators;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- SOURCE A-superapp: 20260711040000_phase4_chat_list.sql
-- SHA256 98df38d1606a8c5bd55b10f00ffca7a931d7febd6836e14f366a539786fe6b69
-- ============================================================================
-- Phase 4 chat list: per-user folders, mute durations, pin ordering, archive metadata, manual unread.

BEGIN;

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS mute_until timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_order integer,
  ADD COLUMN IF NOT EXISTS manually_unread boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_on_new_message boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS folder_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_archived_pinned
  ON public.conversation_participants(user_id, is_archived, is_pinned, pinned_order);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_mute_until
  ON public.conversation_participants(user_id, mute_until);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_updated
  ON public.conversation_participants(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_folder_ids
  ON public.conversation_participants USING gin(folder_ids);

CREATE TABLE IF NOT EXISTS public.chat_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  include_types text[] NOT NULL DEFAULT '{}',
  include_conversation_ids uuid[] NOT NULL DEFAULT '{}',
  exclude_conversation_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_folders_user_position
  ON public.chat_folders(user_id, position);
CREATE INDEX IF NOT EXISTS idx_chat_folders_user_updated
  ON public.chat_folders(user_id, updated_at DESC);

ALTER TABLE public.chat_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own chat folders" ON public.chat_folders;
CREATE POLICY "Users manage own chat folders"
  ON public.chat_folders
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_conversation_participants_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_participants_updated_at ON public.conversation_participants;
CREATE TRIGGER trg_conversation_participants_updated_at
  BEFORE UPDATE ON public.conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_conversation_participants_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'chat_folders'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_folders;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- RLS audit: chat_folders rows are visible/mutable only to owner via auth.uid(); participant metadata remains protected by existing conversation_participants owner policies.


-- ============================================================================
-- SOURCE A-superapp: 20260711043000_group_a_chat_list_discovery.sql
-- SHA256 f0530d595e9996e73f6c5e18f43920fc61ba476434dc73c5f0cee72d6a0d73cc
-- ============================================================================
BEGIN;

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS mute_until timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_order integer,
  ADD COLUMN IF NOT EXISTS manually_unread boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_on_new_message boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS folder_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_archived
  ON public.conversation_participants(user_id, is_archived, archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_pinned
  ON public.conversation_participants(user_id, is_pinned, pinned_order);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_muted
  ON public.conversation_participants(user_id, is_muted, mute_until);

CREATE TABLE IF NOT EXISTS public.chat_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  include_types text[] NOT NULL DEFAULT '{}',
  include_conversation_ids uuid[] NOT NULL DEFAULT '{}',
  exclude_conversation_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_folders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_chat_folders_user_position
  ON public.chat_folders(user_id, position, updated_at DESC);

DROP POLICY IF EXISTS "Users manage own chat folders" ON public.chat_folders;
CREATE POLICY "Users manage own chat folders"
  ON public.chat_folders
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS source_avatar_url text,
  ADD COLUMN IF NOT EXISTS source_message_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_source_message_id
  ON public.posts(source_message_id)
  WHERE source_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_public_source
  ON public.posts(visibility, source_type, created_at DESC)
  WHERE visibility = 'public';

CREATE TABLE IF NOT EXISTS public.discovery_hidden_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('post', 'profile', 'channel', 'group')),
  item_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_type, item_id)
);

ALTER TABLE public.discovery_hidden_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_discovery_hidden_items_user
  ON public.discovery_hidden_items(user_id, item_type, created_at DESC);

DROP POLICY IF EXISTS "Users manage own hidden discovery items" ON public.discovery_hidden_items;
CREATE POLICY "Users manage own hidden discovery items"
  ON public.discovery_hidden_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_participants_updated_at ON public.conversation_participants;
CREATE TRIGGER trg_conversation_participants_updated_at
  BEFORE UPDATE ON public.conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_chat_folders_updated_at ON public.chat_folders;
CREATE TRIGGER trg_chat_folders_updated_at
  BEFORE UPDATE ON public.chat_folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_folders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_folders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'discovery_hidden_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.discovery_hidden_items;
  END IF;
END $$;

COMMENT ON TABLE public.chat_folders IS
  'RLS audit: users can only read and mutate their own chat folder definitions.';
COMMENT ON TABLE public.discovery_hidden_items IS
  'RLS audit: users can only hide/unhide discovery items for themselves.';

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260711050000_group_b_groups_channels.sql
-- SHA256 f7846e81a69a4b7e99de5847356323d931aa7a6069176deadaf8a9f44082d705
-- ============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  ADD COLUMN IF NOT EXISTS linked_group_id uuid REFERENCES public.conversations(id),
  ADD COLUMN IF NOT EXISTS admin_permissions jsonb NOT NULL DEFAULT
    '{"post":true,"edit_info":true,"invite":true,"pin":true,"manage_members":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  ADD COLUMN IF NOT EXISTS admin_permissions jsonb NOT NULL DEFAULT
    '{"post":true,"edit_info":true,"invite":true,"pin":true,"manage_members":true}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_channels_invite_code ON public.channels(invite_code);
CREATE INDEX IF NOT EXISTS idx_channels_permissions ON public.channels USING gin(admin_permissions);
CREATE INDEX IF NOT EXISTS idx_conversations_username ON public.conversations(username);
CREATE INDEX IF NOT EXISTS idx_conversations_invite_code ON public.conversations(invite_code);

CREATE TABLE IF NOT EXISTS public.channel_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_invite_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_channel_invite_links_channel_active
  ON public.channel_invite_links(channel_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_invite_links_code
  ON public.channel_invite_links(code);

CREATE OR REPLACE FUNCTION public.is_channel_admin(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channel_members
    WHERE channel_id = _channel_id
      AND user_id = _user_id
      AND role IN ('owner', 'admin', 'moderator')
  )
$$;

CREATE OR REPLACE FUNCTION public.join_channel_by_invite(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link_row public.channel_invite_links%ROWTYPE;
BEGIN
  SELECT * INTO link_row
  FROM public.channel_invite_links
  WHERE code = _code
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses_count < max_uses)
  LIMIT 1;

  IF link_row.id IS NULL THEN
    RAISE EXCEPTION 'Invite link is invalid or expired';
  END IF;

  INSERT INTO public.channel_members(channel_id, user_id, role)
  VALUES (link_row.channel_id, auth.uid(), 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  UPDATE public.channel_invite_links
  SET uses_count = uses_count + 1
  WHERE id = link_row.id;

  RETURN link_row.channel_id;
END;
$$;

DROP POLICY IF EXISTS "Invite links viewable by admins" ON public.channel_invite_links;
CREATE POLICY "Invite links viewable by admins"
  ON public.channel_invite_links
  FOR SELECT
  USING (public.is_channel_admin(channel_id, auth.uid()));

DROP POLICY IF EXISTS "Admins can create invite links" ON public.channel_invite_links;
CREATE POLICY "Admins can create invite links"
  ON public.channel_invite_links
  FOR INSERT
  WITH CHECK (auth.uid() = created_by AND public.is_channel_admin(channel_id, auth.uid()));

DROP POLICY IF EXISTS "Admins can update invite links" ON public.channel_invite_links;
CREATE POLICY "Admins can update invite links"
  ON public.channel_invite_links
  FOR UPDATE
  USING (public.is_channel_admin(channel_id, auth.uid()))
  WITH CHECK (public.is_channel_admin(channel_id, auth.uid()));

DROP POLICY IF EXISTS "Admins can delete invite links" ON public.channel_invite_links;
CREATE POLICY "Admins can delete invite links"
  ON public.channel_invite_links
  FOR DELETE
  USING (public.is_channel_admin(channel_id, auth.uid()));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'channels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'channel_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'channel_invite_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_invite_links;
  END IF;
END $$;

COMMENT ON TABLE public.channel_invite_links IS
  'RLS audit: invite links are visible and mutable only by channel admins; public joining uses join_channel_by_invite RPC.';

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260711053000_group_c_media_location.sql
-- SHA256 1d05b8698f2d0b33ed4a14f48fb3aeed007628ffce9963ef7a503d4951e6ce90
-- ============================================================================
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'chat-media',
    'chat-media',
    true,
    52428800,
    ARRAY[
      'image/jpeg','image/png','image/gif','image/webp',
      'video/mp4','video/quicktime',
      'audio/mp4','audio/mpeg','audio/wav',
      'application/pdf','text/plain','application/octet-stream'
    ]
  ),
  (
    'message-attachments',
    'message-attachments',
    true,
    52428800,
    ARRAY[
      'image/jpeg','image/png','image/gif','image/webp',
      'video/mp4','video/quicktime',
      'audio/mp4','audio/mpeg','audio/wav',
      'application/pdf','text/plain','application/octet-stream'
    ]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can read chat media" ON storage.objects;
CREATE POLICY "Public can read chat media"
  ON storage.objects
  FOR SELECT
  USING (bucket_id IN ('chat-media', 'message-attachments'));

DROP POLICY IF EXISTS "Users upload own chat media" ON storage.objects;
CREATE POLICY "Users upload own chat media"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id IN ('chat-media', 'message-attachments')
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own chat media" ON storage.objects;
CREATE POLICY "Users update own chat media"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id IN ('chat-media', 'message-attachments')
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('chat-media', 'message-attachments')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own chat media" ON storage.objects;
CREATE POLICY "Users delete own chat media"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id IN ('chat-media', 'message-attachments')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_file_name text,
  ADD COLUMN IF NOT EXISTS media_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS location_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_media_type
  ON public.messages(conversation_id, media_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_location_payload
  ON public.messages USING gin(location_payload)
  WHERE location_payload IS NOT NULL;

COMMENT ON COLUMN public.messages.location_payload IS
  'RLS audit: location_payload is protected by existing messages participant RLS; storage objects are write-scoped to auth.uid folder.';

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260711060000_group_e_calls_live.sql
-- SHA256 2a5ff5fee313fd4621818c182b48e6513062c4c3ddbdab559cb74407d50993c1
-- ============================================================================
BEGIN;

CREATE INDEX IF NOT EXISTS idx_video_calls_conversation_status
  ON public.video_calls(conversation_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_participants_call_user
  ON public.call_participants(call_id, user_id);

DROP POLICY IF EXISTS "Users can join calls" ON public.call_participants;
CREATE POLICY "Users can join calls"
  ON public.call_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.video_calls vc
      JOIN public.conversation_participants cp
        ON cp.conversation_id = vc.conversation_id
      WHERE vc.id = call_participants.call_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own participation" ON public.call_participants;
CREATE POLICY "Users can update own participation"
  ON public.call_participants
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Call host can invite conversation participants" ON public.call_participants;
CREATE POLICY "Call host can invite conversation participants"
  ON public.call_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.video_calls vc
      JOIN public.conversation_participants cp
        ON cp.conversation_id = vc.conversation_id
       AND cp.user_id = call_participants.user_id
      WHERE vc.id = call_participants.call_id
        AND vc.host_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.create_video_call(
  p_conversation_id uuid,
  p_call_type text DEFAULT 'video',
  p_is_video_on boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_call_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_call_type NOT IN ('audio', 'video', 'screen') THEN
    RAISE EXCEPTION 'invalid_call_type';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'not_conversation_participant';
  END IF;

  INSERT INTO public.video_calls (
    conversation_id,
    host_id,
    call_type,
    status,
    started_at
  )
  VALUES (
    p_conversation_id,
    v_user_id,
    p_call_type,
    'active',
    now()
  )
  RETURNING id INTO v_call_id;

  INSERT INTO public.call_participants (
    call_id,
    user_id,
    joined_at,
    left_at,
    is_muted,
    is_video_on,
    is_screen_sharing,
    is_hand_raised
  )
  VALUES (
    v_call_id,
    v_user_id,
    now(),
    NULL,
    false,
    p_is_video_on,
    false,
    false
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    joined_at = excluded.joined_at,
    left_at = NULL,
    is_video_on = excluded.is_video_on;

  RETURN v_call_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_video_call(uuid, text, boolean)
  TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'video_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_calls;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
  END IF;
END $$;

-- RLS audit: create_video_call validates auth.uid() membership before privileged inserts; participant rows remain readable/updatable only by call/conversation participants.
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- SOURCE A-superapp: 20260711063000_group_f_profile_settings.sql
-- SHA256 baf05e34350615fb18df6a9e4131aa3a6a7de55e97007b234bf70150880f6b11
-- ============================================================================
BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS app_theme_mode text NOT NULL DEFAULT 'system';

CREATE INDEX IF NOT EXISTS idx_user_settings_theme_mode
  ON public.user_settings(user_id, app_theme_mode);

-- RLS audit: app_theme_mode is stored on user_settings and remains protected by existing per-user user_settings RLS policies.
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- SOURCE A-superapp: 20260711070000_group_g_reliability.sql
-- SHA256 95705aa9ba7ce20c6d0e99d698ae14fcf4a0e2582836d90b7f05bea03d8ae99e
-- ============================================================================
BEGIN;

-- Group G reliability adds client-side runtime config validation only.
-- No database schema changes are required.
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- SOURCE A-superapp: 20260711073000_group_h_store_release.sql
-- SHA256 7796d5255efa496981887bf682d01d068271ebd448a84471b934505a46a74434
-- ============================================================================
BEGIN;

-- Group H store release changes are client/build metadata only.
-- No database schema changes are required.
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- SOURCE A-superapp: 20260711120000_discovery_modernization.sql
-- SHA256 149c5377e4f1fac06f722fab4ddfc2933ac8ea8c9bd563948b99b676490cfe37
-- ============================================================================
-- Migration: Discovery Modernization (SCHEMA-ALIGNED to live DB)
BEGIN;

-- 1) posts: add columns needed by discovery + feed function (no-op if already present)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS poll_data JSONB,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS mentioned_users UUID[],
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS maturity_rating TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS media_urls TEXT[],
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS source_title TEXT,
  ADD COLUMN IF NOT EXISTS source_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS source_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_moderation_status ON posts(moderation_status) WHERE moderation_status != 'rejected';
CREATE INDEX IF NOT EXISTS idx_posts_visibility_created ON posts(visibility, created_at DESC) WHERE visibility = 'public' AND moderation_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING GIN(tags) WHERE tags IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_likes_count_desc ON posts(likes_count DESC) WHERE visibility = 'public' AND moderation_status = 'approved';

-- 2) stories: table EXISTS — add missing columns (this fixes the 42703 error)
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS text_overlay TEXT,
  ADD COLUMN IF NOT EXISTS background_color TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_stories_user_active ON stories(user_id, is_active, created_at DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_stories_active_created ON stories(created_at DESC) WHERE is_active = TRUE;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stories_select_public ON stories;
CREATE POLICY stories_select_public ON stories FOR SELECT USING (is_active = TRUE AND expires_at > now());
DROP POLICY IF EXISTS stories_insert_own ON stories;
CREATE POLICY stories_insert_own ON stories FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS stories_update_own ON stories;
CREATE POLICY stories_update_own ON stories FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS stories_delete_own ON stories;
CREATE POLICY stories_delete_own ON stories FOR DELETE USING (auth.uid() = user_id);

-- 3) story_views: EXISTS — just ensure RLS/policies
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS story_views_select_own_or_story_owner ON story_views;
CREATE POLICY story_views_select_own_or_story_owner ON story_views FOR SELECT USING (
  auth.uid() = viewer_id OR auth.uid() IN (SELECT user_id FROM stories WHERE stories.id = story_views.story_id)
);
DROP POLICY IF EXISTS story_views_insert_own ON story_views;
CREATE POLICY story_views_insert_own ON story_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);

-- 4) blocked_users: EXISTS — ensure RLS/policies
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS blocked_users_select ON blocked_users;
CREATE POLICY blocked_users_select ON blocked_users FOR SELECT USING (auth.uid() = blocker_id);
DROP POLICY IF EXISTS blocked_users_insert ON blocked_users;
CREATE POLICY blocked_users_insert ON blocked_users FOR INSERT WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS blocked_users_delete ON blocked_users;
CREATE POLICY blocked_users_delete ON blocked_users FOR DELETE USING (auth.uid() = blocker_id);

-- 5) muted_users: NEW
CREATE TABLE IF NOT EXISTS muted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  muter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  muted_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(muter_id, muted_id)
);
CREATE INDEX IF NOT EXISTS idx_muted_users_muter ON muted_users(muter_id);
CREATE INDEX IF NOT EXISTS idx_muted_users_muted ON muted_users(muted_id);
ALTER TABLE muted_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS muted_users_select ON muted_users;
CREATE POLICY muted_users_select ON muted_users FOR SELECT USING (auth.uid() = muter_id);
DROP POLICY IF EXISTS muted_users_insert ON muted_users;
CREATE POLICY muted_users_insert ON muted_users FOR INSERT WITH CHECK (auth.uid() = muter_id);
DROP POLICY IF EXISTS muted_users_delete ON muted_users;
CREATE POLICY muted_users_delete ON muted_users FOR DELETE USING (auth.uid() = muter_id);

-- 6) hidden_posts: NEW
CREATE TABLE IF NOT EXISTS hidden_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_hidden_posts_user ON hidden_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_posts_post ON hidden_posts(post_id);
ALTER TABLE hidden_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hidden_posts_select ON hidden_posts;
CREATE POLICY hidden_posts_select ON hidden_posts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS hidden_posts_insert ON hidden_posts;
CREATE POLICY hidden_posts_insert ON hidden_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS hidden_posts_delete ON hidden_posts;
CREATE POLICY hidden_posts_delete ON hidden_posts FOR DELETE USING (auth.uid() = user_id);

-- 7) categories: NEW
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  name_uz TEXT, name_en TEXT, name_ru TEXT,
  icon TEXT, color TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_categories_active_order ON categories(is_active, display_order) WHERE is_active = TRUE;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_select_active ON categories;
CREATE POLICY categories_select_active ON categories FOR SELECT USING (is_active = TRUE);
INSERT INTO categories (name, name_uz, name_en, name_ru, icon, color, display_order) VALUES
  ('all','Hammasi','All','Все','grid','#6366f1',0),
  ('sport','Sport','Sport','Спорт','trophy','#ef4444',1),
  ('music','Musiqa','Music','Музыка','music','#f59e0b',2),
  ('tech','Texnologiya','Technology','Технология','cpu','#3b82f6',3),
  ('fashion','Moda','Fashion','Мода','shirt','#ec4899',4),
  ('food','Ovqat','Food','Еда','utensils','#10b981',5),
  ('travel','Sayohat','Travel','Путешествия','plane','#8b5cf6',6),
  ('gaming','O''yinlar','Gaming','Игры','gamepad2','#6366f1',7),
  ('art','San''at','Art','Искусство','palette','#f97316',8),
  ('education','Ta''lim','Education','Образование','graduationCap','#14b8a6',9),
  ('business','Biznes','Business','Бизнес','briefcase','#64748b',10),
  ('health','Salomatlik','Health','Здоровье','heart','#f43f5e',11)
ON CONFLICT (name) DO NOTHING;

-- 8) user_interests: NEW
CREATE TABLE IF NOT EXISTS user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  weight FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_user_interests_user ON user_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_category ON user_interests(category_id);
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_interests_select_own ON user_interests;
CREATE POLICY user_interests_select_own ON user_interests FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_interests_insert_own ON user_interests;
CREATE POLICY user_interests_insert_own ON user_interests FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_interests_update_own ON user_interests;
CREATE POLICY user_interests_update_own ON user_interests FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_interests_delete_own ON user_interests;
CREATE POLICY user_interests_delete_own ON user_interests FOR DELETE USING (auth.uid() = user_id);

-- 9) bookmarks: NEW
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post ON bookmarks(post_id);
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookmarks_select_own ON bookmarks;
CREATE POLICY bookmarks_select_own ON bookmarks FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS bookmarks_insert_own ON bookmarks;
CREATE POLICY bookmarks_insert_own ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS bookmarks_delete_own ON bookmarks;
CREATE POLICY bookmarks_delete_own ON bookmarks FOR DELETE USING (auth.uid() = user_id);

-- 10) reports: NEW
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam','inappropriate','nsfw','harassment','violence','misinformation','copyright','other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  CONSTRAINT reports_target_check CHECK ((post_id IS NOT NULL) OR (user_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_post ON reports(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id, created_at DESC);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reports_select_own ON reports;
CREATE POLICY reports_select_own ON reports FOR SELECT USING (auth.uid() = reporter_id);
DROP POLICY IF EXISTS reports_insert_authenticated ON reports;
CREATE POLICY reports_insert_authenticated ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS reports_select_admin ON reports;
CREATE POLICY reports_select_admin ON reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
);

-- 11) content_hides: NEW
CREATE TABLE IF NOT EXISTS content_hides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_content_hides_user ON content_hides(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_hides_post ON content_hides(post_id);
ALTER TABLE content_hides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_hides_select_own ON content_hides;
CREATE POLICY content_hides_select_own ON content_hides FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS content_hides_insert_own ON content_hides;
CREATE POLICY content_hides_insert_own ON content_hides FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS content_hides_delete_own ON content_hides;
CREATE POLICY content_hides_delete_own ON content_hides FOR DELETE USING (auth.uid() = user_id);

-- 12) cleanup function for expired stories
CREATE OR REPLACE FUNCTION cleanup_expired_stories()
RETURNS void AS $$
BEGIN
  UPDATE stories SET is_active = FALSE WHERE is_active = TRUE AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMIT;

NOTIFY pgrst, 'reload schema';
