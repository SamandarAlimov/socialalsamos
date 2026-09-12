-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE A-superapp: 20260711130000_todo_implementations.sql
-- SHA256 382aed5cd242a24591d11b7a29d6380477c6fe492441642a05d6e6da7155fd64
-- ============================================================================
-- Migration: Remaining TODOs (ROBUST — handles pre-existing tables missing columns)
BEGIN;

-- 1) follows
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);
ALTER TABLE follows
  ADD COLUMN IF NOT EXISTS follower_id UUID,
  ADD COLUMN IF NOT EXISTS following_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_created ON follows(created_at DESC);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read all follows" ON follows;
CREATE POLICY "Users can read all follows" ON follows FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can follow others" ON follows;
CREATE POLICY "Users can follow others" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
DROP POLICY IF EXISTS "Users can unfollow" ON follows;
CREATE POLICY "Users can unfollow" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- 2) channel_members
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  role TEXT DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  PRIMARY KEY (channel_id, user_id)
);
ALTER TABLE channel_members
  ADD COLUMN IF NOT EXISTS channel_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_created ON channel_members(created_at DESC);
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read channel members" ON channel_members;
CREATE POLICY "Users can read channel members" ON channel_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can join channels" ON channel_members;
CREATE POLICY "Users can join channels" ON channel_members FOR INSERT WITH CHECK (auth.uid() = user_id AND role = 'member');
DROP POLICY IF EXISTS "Users can leave channels" ON channel_members;
CREATE POLICY "Users can leave channels" ON channel_members FOR DELETE USING (auth.uid() = user_id);

-- 3) poll_votes
CREATE TABLE IF NOT EXISTS poll_votes (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE poll_votes
  ADD COLUMN IF NOT EXISTS post_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS option_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_poll_votes_post ON poll_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON poll_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_created ON poll_votes(created_at DESC);
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read poll votes" ON poll_votes;
CREATE POLICY "Users can read poll votes" ON poll_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can vote on polls" ON poll_votes;
CREATE POLICY "Users can vote on polls" ON poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can change their vote" ON poll_votes;
CREATE POLICY "Users can change their vote" ON poll_votes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their vote" ON poll_votes;
CREATE POLICY "Users can delete their vote" ON poll_votes FOR DELETE USING (auth.uid() = user_id);

-- 4) reports
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id)
);
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS reporter_id UUID,
  ADD COLUMN IF NOT EXISTS post_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_post ON reports(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id, created_at DESC);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own reports" ON reports;
CREATE POLICY "Users can read own reports" ON reports FOR SELECT USING (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "Users can create reports" ON reports;
CREATE POLICY "Users can create reports" ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "Admins can read all reports" ON reports;
CREATE POLICY "Admins can read all reports" ON reports FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));
DROP POLICY IF EXISTS "Admins can update reports" ON reports;
CREATE POLICY "Admins can update reports" ON reports FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- 5) content_hides
CREATE TABLE IF NOT EXISTS content_hides (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
ALTER TABLE content_hides
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS post_id UUID,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_content_hides_user ON content_hides(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_hides_post ON content_hides(post_id);
ALTER TABLE content_hides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own hides" ON content_hides;
CREATE POLICY "Users can read own hides" ON content_hides FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can hide content" ON content_hides;
CREATE POLICY "Users can hide content" ON content_hides FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can unhide content" ON content_hides;
CREATE POLICY "Users can unhide content" ON content_hides FOR DELETE USING (auth.uid() = user_id);

-- 6) posts columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_duration INTEGER;

-- 7) profiles follow counts + trigger
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.following_id;
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_follow_counts_trigger ON follows;
CREATE TRIGGER update_follow_counts_trigger AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- 8) conversations subscriber_count + trigger
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subscriber_count INTEGER DEFAULT 0;
CREATE OR REPLACE FUNCTION update_channel_member_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE conversations SET subscriber_count = COALESCE(subscriber_count,0) + 1 WHERE id = NEW.channel_id AND type = 'channel';
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE conversations SET subscriber_count = GREATEST(0, COALESCE(subscriber_count,0) - 1) WHERE id = OLD.channel_id AND type = 'channel';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_channel_member_counts_trigger ON channel_members;
CREATE TRIGGER update_channel_member_counts_trigger AFTER INSERT OR DELETE ON channel_members
  FOR EACH ROW EXECUTE FUNCTION update_channel_member_counts();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SOURCE A-superapp: 20260712_marketplace_p0_payments_escrow.sql
-- SHA256 5b198459af10001eb383d7039e1340a39c9209274b538bc3ccbbd33dea79b323
-- ============================================================================
-- =========================================================================
-- MARKETPLACE P0.1: PAYMENTS + ESCROW SYSTEM
-- Project: mbhjganbihamoiqmankv
-- Schema: Adds escrow_holds, payment_gateway tables, wallet transaction RPCs
-- All operations idempotent (IF NOT EXISTS)
-- =========================================================================

-- 1. Escrow holds table (holds funds until delivery confirmation)
CREATE TABLE IF NOT EXISTS escrow_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'UZS',
    status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded', 'cancelled')),
    release_at TIMESTAMPTZ, -- Auto-release date
    released_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrow_holds_order_id ON escrow_holds(order_id);
CREATE INDEX IF NOT EXISTS idx_escrow_holds_user_id ON escrow_holds(user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_holds_status ON escrow_holds(status);
CREATE INDEX IF NOT EXISTS idx_escrow_holds_release_at ON escrow_holds(release_at) WHERE status = 'held';

-- 2. Payment gateway transactions (external payments: Click, Payme, etc.)
CREATE TABLE IF NOT EXISTS payment_gateway_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    gateway TEXT NOT NULL CHECK (gateway IN ('wallet', 'click', 'payme', 'uzcard', 'humo', 'visa', 'mastercard')),
    gateway_transaction_id TEXT, -- External gateway transaction ID
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'UZS',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
    payment_url TEXT, -- Redirect URL for external gateway
    callback_data JSONB, -- Gateway webhook data
    error_message TEXT,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_gateway_order_id ON payment_gateway_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_gateway_user_id ON payment_gateway_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_gateway_status ON payment_gateway_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_gateway_tx_id ON payment_gateway_transactions(gateway_transaction_id);

-- 3. Add payment columns to orders table (if not exist)
DO $$ 
BEGIN
    -- payment_status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'payment_status'
    ) THEN
        ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending' 
            CHECK (payment_status IN ('pending', 'paid', 'held_escrow', 'released', 'failed', 'refunded', 'cancelled'));
    END IF;

    -- payment_method
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'wallet' 
            CHECK (payment_method IN ('wallet', 'click', 'payme', 'uzcard', 'humo', 'visa', 'mastercard', 'cash_on_delivery'));
    END IF;

    -- paid_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'paid_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN paid_at TIMESTAMPTZ;
    END IF;

    -- tracking_number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'tracking_number'
    ) THEN
        ALTER TABLE orders ADD COLUMN tracking_number TEXT;
    END IF;

    -- carrier
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'carrier'
    ) THEN
        ALTER TABLE orders ADD COLUMN carrier TEXT;
    END IF;

    -- shipped_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'shipped_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;
    END IF;

    -- delivered_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'delivered_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
    END IF;

    -- confirmed_by_buyer_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'confirmed_by_buyer_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN confirmed_by_buyer_at TIMESTAMPTZ;
    END IF;

    -- cancelled_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'cancelled_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN cancelled_at TIMESTAMPTZ;
    END IF;

    -- cancellation_reason
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'cancellation_reason'
    ) THEN
        ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
    END IF;
END $$;

-- 4. Order status history (tracking timeline)
CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON order_status_history(created_at DESC);

-- 5. Wallet transaction ledger (if not exists)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'UZS',
    type TEXT NOT NULL CHECK (type IN ('top_up', 'payment', 'refund', 'escrow_hold', 'escrow_release', 'transfer', 'withdrawal', 'commission')),
    reference_type TEXT, -- 'order', 'escrow_hold', 'product', etc.
    reference_id UUID,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON wallet_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);

-- 6. Security Definer RPC: wallet_payment (atomic payment with escrow)
CREATE OR REPLACE FUNCTION wallet_payment(
    p_buyer_id UUID,
    p_order_id UUID,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'UZS',
    p_escrow_days INTEGER DEFAULT 14
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet_balance NUMERIC;
    v_new_balance NUMERIC;
    v_escrow_id UUID;
    v_release_date TIMESTAMPTZ;
BEGIN
    -- 1. Check wallet balance
    SELECT balance INTO v_wallet_balance
    FROM user_wallets
    WHERE user_id = p_buyer_id AND currency = p_currency
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'wallet_not_found');
    END IF;

    IF v_wallet_balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance');
    END IF;

    -- 2. Debit wallet
    v_new_balance := v_wallet_balance - p_amount;
    
    UPDATE user_wallets
    SET balance = v_new_balance, updated_at = NOW()
    WHERE user_id = p_buyer_id AND currency = p_currency;

    -- 3. Create wallet transaction record
    INSERT INTO wallet_transactions (user_id, amount, balance_after, currency, type, reference_type, reference_id, description)
    VALUES (p_buyer_id, -p_amount, v_new_balance, p_currency, 'payment', 'order', p_order_id, 'Order payment (held in escrow)');

    -- 4. Create escrow hold
    v_release_date := NOW() + (p_escrow_days || ' days')::INTERVAL;
    
    INSERT INTO escrow_holds (order_id, user_id, amount, currency, status, release_at)
    VALUES (p_order_id, p_buyer_id, p_amount, p_currency, 'held', v_release_date)
    RETURNING id INTO v_escrow_id;

    -- 5. Update order payment status
    UPDATE orders
    SET payment_status = 'held_escrow',
        payment_method = 'wallet',
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 6. Record status history
    INSERT INTO order_status_history (order_id, status, note)
    VALUES (p_order_id, 'paid', 'Payment completed via wallet (escrow hold)');

    RETURN jsonb_build_object(
        'success', true,
        'escrow_id', v_escrow_id,
        'new_balance', v_new_balance,
        'release_at', v_release_date
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 7. Security Definer RPC: release_escrow (pay seller on delivery confirmation)
CREATE OR REPLACE FUNCTION release_escrow(
    p_escrow_id UUID,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_escrow_amount NUMERIC;
    v_escrow_currency TEXT;
    v_seller_id UUID;
    v_seller_balance NUMERIC;
    v_new_seller_balance NUMERIC;
BEGIN
    -- 1. Get escrow details
    SELECT amount, currency INTO v_escrow_amount, v_escrow_currency
    FROM escrow_holds
    WHERE id = p_escrow_id AND status = 'held'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'escrow_not_found_or_already_released');
    END IF;

    -- 2. Get seller from order
    SELECT seller_id INTO v_seller_id
    FROM orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
    END IF;

    -- 3. Credit seller wallet (create if not exists)
    INSERT INTO user_wallets (user_id, balance, currency)
    VALUES (v_seller_id, v_escrow_amount, v_escrow_currency)
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = user_wallets.balance + EXCLUDED.balance,
        updated_at = NOW()
    RETURNING balance INTO v_new_seller_balance;

    -- 4. Record seller wallet transaction
    INSERT INTO wallet_transactions (user_id, amount, balance_after, currency, type, reference_type, reference_id, description)
    VALUES (v_seller_id, v_escrow_amount, v_new_seller_balance, v_escrow_currency, 'escrow_release', 'order', p_order_id, 'Payment received from escrow');

    -- 5. Update escrow status
    UPDATE escrow_holds
    SET status = 'released',
        released_at = NOW(),
        updated_at = NOW()
    WHERE id = p_escrow_id;

    -- 6. Update order payment status
    UPDATE orders
    SET payment_status = 'released',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 7. Record status history
    INSERT INTO order_status_history (order_id, status, note)
    VALUES (p_order_id, 'completed', 'Escrow released, seller paid');

    RETURN jsonb_build_object(
        'success', true,
        'seller_balance', v_new_seller_balance
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 8. Security Definer RPC: refund_order (cancel + refund to buyer wallet)
CREATE OR REPLACE FUNCTION refund_order(
    p_order_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_escrow_id UUID;
    v_escrow_amount NUMERIC;
    v_escrow_currency TEXT;
    v_buyer_balance NUMERIC;
    v_new_buyer_balance NUMERIC;
BEGIN
    -- 1. Get order details
    SELECT buyer_id INTO v_buyer_id
    FROM orders
    WHERE id = p_order_id AND payment_status IN ('held_escrow', 'paid')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'order_not_found_or_cannot_refund');
    END IF;

    -- 2. Get escrow hold
    SELECT id, amount, currency INTO v_escrow_id, v_escrow_amount, v_escrow_currency
    FROM escrow_holds
    WHERE order_id = p_order_id AND status = 'held'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'escrow_not_found');
    END IF;

    -- 3. Credit buyer wallet (refund)
    SELECT balance INTO v_buyer_balance
    FROM user_wallets
    WHERE user_id = v_buyer_id AND currency = v_escrow_currency
    FOR UPDATE;

    v_new_buyer_balance := COALESCE(v_buyer_balance, 0) + v_escrow_amount;

    INSERT INTO user_wallets (user_id, balance, currency)
    VALUES (v_buyer_id, v_new_buyer_balance, v_escrow_currency)
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = user_wallets.balance + v_escrow_amount,
        updated_at = NOW();

    -- 4. Record buyer wallet transaction
    INSERT INTO wallet_transactions (user_id, amount, balance_after, currency, type, reference_type, reference_id, description)
    VALUES (v_buyer_id, v_escrow_amount, v_new_buyer_balance, v_escrow_currency, 'refund', 'order', p_order_id, 'Order refund');

    -- 5. Update escrow status
    UPDATE escrow_holds
    SET status = 'refunded',
        refunded_at = NOW(),
        notes = p_reason,
        updated_at = NOW()
    WHERE id = v_escrow_id;

    -- 6. Update order
    UPDATE orders
    SET status = 'cancelled',
        payment_status = 'refunded',
        cancelled_at = NOW(),
        cancellation_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 7. Record status history
    INSERT INTO order_status_history (order_id, status, note)
    VALUES (p_order_id, 'cancelled', CONCAT('Order cancelled and refunded: ', COALESCE(p_reason, 'No reason provided')));

    RETURN jsonb_build_object(
        'success', true,
        'refunded_amount', v_escrow_amount,
        'new_balance', v_new_buyer_balance
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 9. RLS Policies (enable RLS on new tables)
ALTER TABLE escrow_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_gateway_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Escrow holds: users can view their own holds
CREATE POLICY escrow_holds_select ON escrow_holds FOR SELECT
    USING (auth.uid() = user_id);

-- Payment gateway: users can view their own transactions
CREATE POLICY payment_gateway_select ON payment_gateway_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- Order status history: buyers and sellers can view
CREATE POLICY order_status_history_select ON order_status_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_status_history.order_id
            AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
        )
    );

-- Wallet transactions: users can view their own transactions
CREATE POLICY wallet_transactions_select ON wallet_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- 10. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- MIGRATION COMPLETE
-- Tables: escrow_holds, payment_gateway_transactions, order_status_history, wallet_transactions
-- Orders columns: payment_status, payment_method, paid_at, tracking_number, carrier, shipped_at, delivered_at, confirmed_by_buyer_at, cancelled_at, cancellation_reason
-- RPCs: wallet_payment, release_escrow, refund_order
-- =========================================================================


-- ============================================================================
-- SOURCE A-superapp: 20260712_marketplace_p1_seller_verification.sql
-- SHA256 aa9e39a62ee9a18645c229535f9e699bf6bb8789094fc89985f6ef3040ff6e94
-- ============================================================================
-- =========================================================================
-- MARKETPLACE P1.3: SELLER VERIFICATION & PRODUCT MODERATION
-- Adds verification requests, product reports/moderation
-- =========================================================================

-- 1. Seller verification requests table
CREATE TABLE IF NOT EXISTS seller_verification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL,
    business_type TEXT NOT NULL,
    business_registration_number TEXT,
    tax_id TEXT,
    id_document_url TEXT, -- Link to uploaded ID/passport
    business_document_url TEXT, -- Business registration certificate
    bank_account_info JSONB, -- Encrypted bank details
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(seller_id)
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_seller_id ON seller_verification_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON seller_verification_requests(status);

-- 2. Product reports table
CREATE TABLE IF NOT EXISTS product_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'fake', 'inappropriate', 'wrong_category', 'misleading', 'other')),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
    moderator_id UUID REFERENCES profiles(id),
    moderator_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_reports_product_id ON product_reports(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reports_status ON product_reports(status);
CREATE INDEX IF NOT EXISTS idx_product_reports_reporter_id ON product_reports(reporter_id);

-- 3. Add moderation fields to products table (if not exist)
DO $$ 
BEGIN
    -- moderation_status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'moderation_status'
    ) THEN
        ALTER TABLE products ADD COLUMN moderation_status TEXT DEFAULT 'approved' 
            CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged'));
    END IF;

    -- moderation_notes
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'moderation_notes'
    ) THEN
        ALTER TABLE products ADD COLUMN moderation_notes TEXT;
    END IF;

    -- moderated_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'moderated_at'
    ) THEN
        ALTER TABLE products ADD COLUMN moderated_at TIMESTAMPTZ;
    END IF;

    -- moderated_by
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'moderated_by'
    ) THEN
        ALTER TABLE products ADD COLUMN moderated_by UUID REFERENCES profiles(id);
    END IF;
END $$;

-- 4. Product review helpful votes table
CREATE TABLE IF NOT EXISTS review_helpful_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(review_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_review_helpful_votes_review_id ON review_helpful_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_helpful_votes_user_id ON review_helpful_votes(user_id);

-- 5. Add helpful_count to product_reviews (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_reviews' AND column_name = 'helpful_count'
    ) THEN
        ALTER TABLE product_reviews ADD COLUMN helpful_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 6. Trigger to update helpful_count
CREATE OR REPLACE FUNCTION update_review_helpful_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE product_reviews 
        SET helpful_count = helpful_count + 1 
        WHERE id = NEW.review_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE product_reviews 
        SET helpful_count = GREATEST(helpful_count - 1, 0)
        WHERE id = OLD.review_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_review_helpful_count ON review_helpful_votes;
CREATE TRIGGER trigger_update_review_helpful_count
    AFTER INSERT OR DELETE ON review_helpful_votes
    FOR EACH ROW EXECUTE FUNCTION update_review_helpful_count();

-- 7. RLS Policies
ALTER TABLE seller_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;

-- Verification requests: sellers can view their own, admins can view all
CREATE POLICY verification_requests_select ON seller_verification_requests FOR SELECT
    USING (
        auth.uid() = user_id OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    );

CREATE POLICY verification_requests_insert ON seller_verification_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Product reports: reporters and admins can view
CREATE POLICY product_reports_select ON product_reports FOR SELECT
    USING (
        auth.uid() = reporter_id OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    );

CREATE POLICY product_reports_insert ON product_reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

-- Review helpful votes: users can manage their own votes
CREATE POLICY review_helpful_votes_select ON review_helpful_votes FOR SELECT
    USING (true);

CREATE POLICY review_helpful_votes_insert ON review_helpful_votes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY review_helpful_votes_delete ON review_helpful_votes FOR DELETE
    USING (auth.uid() = user_id);

-- 8. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- MIGRATION COMPLETE
-- Tables: seller_verification_requests, product_reports, review_helpful_votes
-- Products: moderation_status, moderation_notes, moderated_at, moderated_by
-- Reviews: helpful_count with trigger
-- =========================================================================


-- ============================================================================
-- SOURCE A-superapp: 20260712_marketplace_p2_search_notifications.sql
-- SHA256 2a415dbc73a3958eb5860460560ef5d0e9abcebb472509b6a303a89e43fadfa1
-- ============================================================================
-- =========================================================================
-- MARKETPLACE P2: ADVANCED SEARCH + NOTIFICATIONS
-- PostgreSQL full-text search, filters, marketplace notifications
-- =========================================================================

-- 1. Add full-text search columns to products (if not exist)
DO $$ 
BEGIN
    -- search_vector for tsvector
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'search_vector'
    ) THEN
        ALTER TABLE products ADD COLUMN search_vector tsvector;
    END IF;

    -- tags array
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'tags'
    ) THEN
        ALTER TABLE products ADD COLUMN tags TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- 2. Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_condition ON products(condition);
CREATE INDEX IF NOT EXISTS idx_products_location ON products(location);

-- 3. Function to update search_vector
CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_products_search_vector ON products;
CREATE TRIGGER trigger_products_search_vector
    BEFORE INSERT OR UPDATE OF title, description, tags
    ON products
    FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();

-- 4. Update existing products with search_vector
UPDATE products 
SET search_vector = 
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C')
WHERE search_vector IS NULL;

-- 5. Search history table
CREATE TABLE IF NOT EXISTS product_search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON product_search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON product_search_history(created_at DESC);

-- 6. Popular searches (aggregated view)
CREATE MATERIALIZED VIEW IF NOT EXISTS popular_product_searches AS
SELECT 
    query,
    COUNT(*) as search_count,
    MAX(created_at) as last_searched_at
FROM product_search_history
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY query
ORDER BY search_count DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_popular_searches_query ON popular_product_searches(query);

-- Refresh materialized view daily
CREATE OR REPLACE FUNCTION refresh_popular_searches()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY popular_product_searches;
END;
$$ LANGUAGE plpgsql;

-- 7. Marketplace notifications table
CREATE TABLE IF NOT EXISTS marketplace_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('new_order', 'order_status', 'price_drop', 'restock', 'seller_message', 'review', 'promotion')),
    title TEXT NOT NULL,
    body TEXT,
    data JSONB, -- Additional structured data (order_id, product_id, etc.)
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    action_url TEXT, -- Deep link to relevant page
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_notifications_user_id ON marketplace_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_notifications_type ON marketplace_notifications(type);
CREATE INDEX IF NOT EXISTS idx_marketplace_notifications_is_read ON marketplace_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_marketplace_notifications_created_at ON marketplace_notifications(created_at DESC);

-- 8. Product price alerts (for price drop notifications)
CREATE TABLE IF NOT EXISTS product_price_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_price NUMERIC(12,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON product_price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_product_id ON product_price_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON product_price_alerts(is_active) WHERE is_active = true;

-- 9. Wishlist sharing table
CREATE TABLE IF NOT EXISTS shared_wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    share_code TEXT UNIQUE NOT NULL,
    product_ids UUID[] DEFAULT '{}',
    views_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_wishlists_owner_id ON shared_wishlists(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_wishlists_share_code ON shared_wishlists(share_code);

-- 10. Function to generate share code
CREATE OR REPLACE FUNCTION generate_share_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 11. RLS Policies
ALTER TABLE product_search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_wishlists ENABLE ROW LEVEL SECURITY;

-- Search history: users see their own
CREATE POLICY search_history_select ON product_search_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY search_history_insert ON product_search_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Marketplace notifications: users see their own
CREATE POLICY marketplace_notifications_select ON marketplace_notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY marketplace_notifications_update ON marketplace_notifications FOR UPDATE
    USING (auth.uid() = user_id);

-- Price alerts: users manage their own
CREATE POLICY price_alerts_select ON product_price_alerts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY price_alerts_insert ON product_price_alerts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY price_alerts_update ON product_price_alerts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY price_alerts_delete ON product_price_alerts FOR DELETE
    USING (auth.uid() = user_id);

-- Shared wishlists: owner sees all, others see public
CREATE POLICY shared_wishlists_select ON shared_wishlists FOR SELECT
    USING (auth.uid() = owner_id OR is_public = true);

CREATE POLICY shared_wishlists_insert ON shared_wishlists FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY shared_wishlists_update ON shared_wishlists FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY shared_wishlists_delete ON shared_wishlists FOR DELETE
    USING (auth.uid() = owner_id);

-- 12. Function to send marketplace notification
CREATE OR REPLACE FUNCTION send_marketplace_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_body TEXT,
    p_data JSONB DEFAULT NULL,
    p_action_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO marketplace_notifications (user_id, type, title, body, data, action_url)
    VALUES (p_user_id, p_type, p_title, p_body, p_data, p_action_url)
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Trigger to check price drops and send notifications
CREATE OR REPLACE FUNCTION check_price_drop_alerts()
RETURNS TRIGGER AS $$
DECLARE
    alert RECORD;
BEGIN
    -- Only if price decreased
    IF TG_OP = 'UPDATE' AND NEW.price < OLD.price THEN
        -- Find all active price alerts for this product
        FOR alert IN 
            SELECT * FROM product_price_alerts 
            WHERE product_id = NEW.id 
            AND is_active = true 
            AND target_price >= NEW.price
            AND (notified_at IS NULL OR notified_at < NOW() - INTERVAL '7 days')
        LOOP
            -- Send notification
            PERFORM send_marketplace_notification(
                alert.user_id,
                'price_drop',
                'Narx tushdi!',
                NEW.title || ' narxi tushdi: ' || NEW.price::TEXT || ' ' || NEW.currency,
                jsonb_build_object('product_id', NEW.id, 'old_price', OLD.price, 'new_price', NEW.price),
                '/marketplace/product/' || NEW.id
            );
            
            -- Update notified_at
            UPDATE product_price_alerts 
            SET notified_at = NOW() 
            WHERE id = alert.id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_price_drop_alerts ON products;
CREATE TRIGGER trigger_check_price_drop_alerts
    AFTER UPDATE OF price ON products
    FOR EACH ROW EXECUTE FUNCTION check_price_drop_alerts();

-- 14. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- MIGRATION COMPLETE
-- Search: search_vector, tags, GIN indexes, search history, popular searches
-- Notifications: marketplace_notifications, price_alerts, wishlist sharing
-- Functions: send_marketplace_notification, price drop trigger
-- =========================================================================


-- ============================================================================
-- SOURCE A-superapp: 20260712_marketplace_p3_analytics_inventory.sql
-- SHA256 a17ebd97779f6f9e7b2a01768bd9e6f1bdbe71f75f6d347414da0f61dc866ca7
-- ============================================================================
-- =========================================================================
-- MARKETPLACE P3: SELLER ANALYTICS + INVENTORY MANAGEMENT
-- Analytics views, inventory tracking, variant management
-- =========================================================================

-- 1. Seller analytics view (aggregated metrics)
CREATE OR REPLACE VIEW seller_analytics AS
SELECT 
    s.id as seller_id,
    s.business_name,
    s.user_id,
    
    -- Product metrics
    COUNT(DISTINCT p.id) as total_products,
    COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') as active_products,
    SUM(p.views_count) as total_views,
    SUM(p.likes_count) as total_likes,
    
    -- Order metrics
    COUNT(DISTINCT o.id) as total_orders,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') as completed_orders,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('pending', 'processing')) as pending_orders,
    SUM(o.total) FILTER (WHERE o.status = 'delivered') as total_revenue,
    AVG(o.total) FILTER (WHERE o.status = 'delivered') as avg_order_value,
    
    -- Customer metrics
    COUNT(DISTINCT o.buyer_id) as total_customers,
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.created_at > NOW() - INTERVAL '30 days') as active_customers_30d,
    
    -- Review metrics
    COUNT(DISTINCT pr.id) as total_reviews,
    AVG(pr.rating) as avg_rating,
    
    -- Conversion metrics
    CASE 
        WHEN SUM(p.views_count) > 0 
        THEN (COUNT(DISTINCT o.id)::FLOAT / SUM(p.views_count) * 100)
        ELSE 0 
    END as conversion_rate,
    
    -- Time periods
    MAX(o.created_at) as last_order_at,
    MAX(p.created_at) as last_product_at
    
FROM sellers s
LEFT JOIN products p ON p.seller_id = s.id AND p.status != 'deleted'
LEFT JOIN orders o ON o.seller_id = s.id
LEFT JOIN product_reviews pr ON pr.product_id = p.id
GROUP BY s.id, s.business_name, s.user_id;

-- 2. Product performance view
CREATE OR REPLACE VIEW product_performance AS
SELECT 
    p.id as product_id,
    p.seller_id,
    p.title,
    p.price,
    p.quantity,
    p.views_count,
    p.likes_count,
    
    -- Order metrics
    COUNT(DISTINCT oi.order_id) as times_sold,
    SUM(oi.quantity) as units_sold,
    SUM(oi.total) as revenue,
    
    -- Review metrics
    COUNT(DISTINCT pr.id) as review_count,
    AVG(pr.rating) as avg_rating,
    
    -- Conversion
    CASE 
        WHEN p.views_count > 0 
        THEN (COUNT(DISTINCT oi.order_id)::FLOAT / p.views_count * 100)
        ELSE 0 
    END as conversion_rate,
    
    -- Last activity
    MAX(oi.created_at) as last_sold_at,
    p.created_at as listed_at,
    p.updated_at
    
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN product_reviews pr ON pr.product_id = p.id
WHERE p.status != 'deleted'
GROUP BY p.id, p.seller_id, p.title, p.price, p.quantity, p.views_count, p.likes_count, p.created_at, p.updated_at;

-- 3. Inventory management fields
DO $$ 
BEGIN
    -- sku (stock keeping unit)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'sku'
    ) THEN
        ALTER TABLE products ADD COLUMN sku TEXT UNIQUE;
    END IF;

    -- low_stock_threshold
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'low_stock_threshold'
    ) THEN
        ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER DEFAULT 5;
    END IF;

    -- variants (JSON array for size/color variations)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'variants'
    ) THEN
        ALTER TABLE products ADD COLUMN variants JSONB DEFAULT '[]';
    END IF;

    -- last_restocked_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'last_restocked_at'
    ) THEN
        ALTER TABLE products ADD COLUMN last_restocked_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON products(quantity) WHERE quantity <= low_stock_threshold;

-- 4. Inventory alerts table
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('low_stock', 'out_of_stock', 'restock_reminder')),
    current_quantity INTEGER NOT NULL,
    threshold INTEGER,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, alert_type, is_resolved)
);

CREATE INDEX IF NOT EXISTS idx_inventory_alerts_product_id ON inventory_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_seller_id ON inventory_alerts(seller_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_unresolved ON inventory_alerts(is_resolved) WHERE is_resolved = false;

-- 5. Function to check and create inventory alerts
CREATE OR REPLACE FUNCTION check_inventory_alerts()
RETURNS TRIGGER AS $$
DECLARE
    v_seller_id UUID;
BEGIN
    -- Get seller_id
    SELECT seller_id INTO v_seller_id FROM products WHERE id = NEW.id;
    
    -- Low stock alert
    IF NEW.quantity > 0 AND NEW.quantity <= NEW.low_stock_threshold THEN
        INSERT INTO inventory_alerts (product_id, seller_id, alert_type, current_quantity, threshold)
        VALUES (NEW.id, v_seller_id, 'low_stock', NEW.quantity, NEW.low_stock_threshold)
        ON CONFLICT (product_id, alert_type, is_resolved) WHERE is_resolved = false DO NOTHING;
    END IF;
    
    -- Out of stock alert
    IF NEW.quantity = 0 THEN
        INSERT INTO inventory_alerts (product_id, seller_id, alert_type, current_quantity, threshold)
        VALUES (NEW.id, v_seller_id, 'out_of_stock', 0, NULL)
        ON CONFLICT (product_id, alert_type, is_resolved) WHERE is_resolved = false DO NOTHING;
        
        -- Mark low_stock as resolved
        UPDATE inventory_alerts 
        SET is_resolved = true, resolved_at = NOW() 
        WHERE product_id = NEW.id AND alert_type = 'low_stock' AND is_resolved = false;
    END IF;
    
    -- Restocked - resolve all alerts
    IF TG_OP = 'UPDATE' AND NEW.quantity > OLD.quantity AND NEW.quantity > NEW.low_stock_threshold THEN
        UPDATE inventory_alerts 
        SET is_resolved = true, resolved_at = NOW() 
        WHERE product_id = NEW.id AND is_resolved = false;
        
        UPDATE products 
        SET last_restocked_at = NOW() 
        WHERE id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_inventory_alerts ON products;
CREATE TRIGGER trigger_check_inventory_alerts
    AFTER INSERT OR UPDATE OF quantity ON products
    FOR EACH ROW EXECUTE FUNCTION check_inventory_alerts();

-- 6. Traffic sources table (for analytics)
CREATE TABLE IF NOT EXISTS product_traffic_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    source TEXT NOT NULL, -- 'search', 'category', 'direct', 'recommendation', 'external'
    referrer TEXT,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traffic_sources_product_id ON product_traffic_sources(product_id);
CREATE INDEX IF NOT EXISTS idx_traffic_sources_source ON product_traffic_sources(source);
CREATE INDEX IF NOT EXISTS idx_traffic_sources_created_at ON product_traffic_sources(created_at DESC);

-- 7. Customer demographics view (for seller analytics)
CREATE OR REPLACE VIEW seller_customer_demographics AS
SELECT 
    o.seller_id,
    COUNT(DISTINCT o.buyer_id) as total_customers,
    
    -- Order frequency segments
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE buyer_order_count = 1) as one_time_customers,
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE buyer_order_count >= 2 AND buyer_order_count <= 5) as repeat_customers,
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE buyer_order_count > 5) as loyal_customers,
    
    -- Geographic distribution
    jsonb_object_agg(
        COALESCE((o.shipping_address->>'city'), 'Unknown'),
        city_count
    ) as cities,
    
    -- Average customer value
    AVG(customer_total_spent) as avg_customer_lifetime_value,
    MAX(customer_total_spent) as max_customer_lifetime_value
    
FROM orders o
CROSS JOIN LATERAL (
    SELECT 
        COUNT(*) as buyer_order_count,
        SUM(total) as customer_total_spent
    FROM orders o2 
    WHERE o2.buyer_id = o.buyer_id AND o2.seller_id = o.seller_id
) buyer_stats
CROSS JOIN LATERAL (
    SELECT COUNT(*) as city_count
    FROM orders o3
    WHERE o3.seller_id = o.seller_id 
    AND (o3.shipping_address->>'city') = (o.shipping_address->>'city')
) city_stats
GROUP BY o.seller_id;

-- 8. RLS Policies
ALTER TABLE inventory_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_traffic_sources ENABLE ROW LEVEL SECURITY;

-- Inventory alerts: seller sees their own
CREATE POLICY inventory_alerts_select ON inventory_alerts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sellers 
            WHERE sellers.id = inventory_alerts.seller_id 
            AND sellers.user_id = auth.uid()
        )
    );

-- Traffic sources: public read (analytics)
CREATE POLICY traffic_sources_select ON product_traffic_sources FOR SELECT
    USING (true);

CREATE POLICY traffic_sources_insert ON product_traffic_sources FOR INSERT
    WITH CHECK (true);

-- 9. Function to generate SKU
CREATE OR REPLACE FUNCTION generate_sku(p_category_id UUID, p_seller_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_category_code TEXT;
    v_seller_code TEXT;
    v_counter INTEGER;
    v_sku TEXT;
BEGIN
    -- Get category code (first 3 chars of category name)
    SELECT UPPER(LEFT(REPLACE(name, ' ', ''), 3)) INTO v_category_code
    FROM product_categories WHERE id = p_category_id;
    
    v_category_code := COALESCE(v_category_code, 'GEN');
    
    -- Get seller code (first 3 chars of business name)
    SELECT UPPER(LEFT(REPLACE(business_name, ' ', ''), 3)) INTO v_seller_code
    FROM sellers WHERE id = p_seller_id;
    
    v_seller_code := COALESCE(v_seller_code, 'SEL');
    
    -- Get next counter
    SELECT COUNT(*) + 1 INTO v_counter
    FROM products WHERE seller_id = p_seller_id;
    
    -- Generate SKU: CAT-SEL-0001
    v_sku := v_category_code || '-' || v_seller_code || '-' || LPAD(v_counter::TEXT, 4, '0');
    
    RETURN v_sku;
END;
$$ LANGUAGE plpgsql;

-- 10. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- MIGRATION COMPLETE
-- Analytics: seller_analytics view, product_performance view, customer_demographics
-- Inventory: sku, low_stock_threshold, variants, inventory_alerts with triggers
-- Traffic: product_traffic_sources for analytics
-- Functions: generate_sku, check_inventory_alerts
-- =========================================================================


-- ============================================================================
-- SOURCE A-superapp: 20260712090000_batch1_mvp_critical.sql
-- SHA256 f5bebbae8ba5300b5411c5af65eef5448b503b8c00e91ed5ea951b338b58cb25
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.message_delivery_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.message_delivery_receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_message_delivery_receipts_message
  ON public.message_delivery_receipts(message_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_delivery_receipts_user
  ON public.message_delivery_receipts(user_id, delivered_at DESC);
DROP POLICY IF EXISTS "Participants view delivery receipts" ON public.message_delivery_receipts;
CREATE POLICY "Participants view delivery receipts"
  ON public.message_delivery_receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_delivery_receipts.message_id
        AND cp.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users mark own delivery receipts" ON public.message_delivery_receipts;
CREATE POLICY "Users mark own delivery receipts"
  ON public.message_delivery_receipts FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_delivery_receipts.message_id
        AND cp.user_id = auth.uid()
        AND m.sender_id <> auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users update own delivery receipts" ON public.message_delivery_receipts;
CREATE POLICY "Users update own delivery receipts"
  ON public.message_delivery_receipts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_user_id),
  CHECK (blocker_id <> blocked_user_id)
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_user_id);
DROP POLICY IF EXISTS "Users manage own blocks" ON public.user_blocks;
CREATE POLICY "Users manage own blocks"
  ON public.user_blocks FOR ALL
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON public.user_push_tokens(user_id);
DROP POLICY IF EXISTS "Users manage own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users manage own push tokens"
  ON public.user_push_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.download_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url text NOT NULL,
  file_name text,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_download_events_user_created
  ON public.download_events(user_id, created_at DESC);
DROP POLICY IF EXISTS "Users manage own download events" ON public.download_events;
CREATE POLICY "Users manage own download events"
  ON public.download_events FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_blocked_between(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = a AND blocked_user_id = b)
       OR (blocker_id = b AND blocked_user_id = a)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_dm_user(p_sender_id uuid, p_recipient_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.is_blocked_between(p_sender_id, p_recipient_id);
$$;

CREATE OR REPLACE FUNCTION public.can_send_message_to_conversation(
  p_conversation_id uuid,
  p_sender_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_blocked boolean;
BEGIN
  SELECT type INTO v_type FROM public.conversations WHERE id = p_conversation_id;
  IF v_type IS NULL THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_sender_id
  ) THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.user_blocks b
      ON (b.blocker_id = p_sender_id AND b.blocked_user_id = cp.user_id)
      OR (b.blocker_id = cp.user_id AND b.blocked_user_id = p_sender_id)
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id <> p_sender_id
  ) INTO v_blocked;
  RETURN NOT COALESCE(v_blocked, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_dm_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_message_to_conversation(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_message_to_conversation(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can create calls" ON public.video_calls;
CREATE POLICY "Users can create calls"
  ON public.video_calls FOR INSERT
  WITH CHECK (
    host_id = auth.uid()
    AND public.can_send_message_to_conversation(conversation_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.can_view_presence(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  visibility text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF auth.uid() = target_user_id THEN RETURN true; END IF;
  IF public.is_blocked_between(auth.uid(), target_user_id) THEN RETURN false; END IF;
  SELECT coalesce(last_seen_visibility, 'everyone') INTO visibility
  FROM public.user_settings WHERE user_id = target_user_id;
  visibility := coalesce(visibility, 'everyone');
  IF visibility = 'nobody' THEN RETURN false; END IF;
  IF visibility = 'contacts' THEN RETURN public.are_contacts(auth.uid(), target_user_id); END IF;
  RETURN true;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_delivery_receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_delivery_receipts;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_blocks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260712100000_fix_posts_schema_mismatches.sql
-- SHA256 88bde74b177a52b1e0fcbe180f2a06f7a18ba496669fd1753fc8f4c767355af9
-- ============================================================================
-- Migration: Fix Posts Schema — views_count + post_views (ROBUST)
BEGIN;

-- posts.views_count
ALTER TABLE posts ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_posts_views_count_desc ON posts(views_count DESC)
  WHERE visibility = 'public' AND moderation_status = 'approved';

-- post_views (jadval MAVJUD bo'lishi mumkin — ustunlarni kafolatlaymiz)
CREATE TABLE IF NOT EXISTS post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  UNIQUE(post_id, viewer_id)
);
ALTER TABLE post_views
  ADD COLUMN IF NOT EXISTS post_id UUID,
  ADD COLUMN IF NOT EXISTS viewer_id UUID,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_views_viewer ON post_views(viewer_id, viewed_at DESC) WHERE viewer_id IS NOT NULL;

ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_views_insert ON post_views;
CREATE POLICY post_views_insert ON post_views FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS post_views_select_own ON post_views;
CREATE POLICY post_views_select_own ON post_views FOR SELECT USING (viewer_id = auth.uid() OR viewer_id IS NULL);
DROP POLICY IF EXISTS post_views_select_author ON post_views;
CREATE POLICY post_views_select_author ON post_views FOR SELECT USING (
  EXISTS (SELECT 1 FROM posts WHERE posts.id = post_views.post_id AND posts.user_id = auth.uid())
);

-- views_count trigger
CREATE OR REPLACE FUNCTION update_post_views_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET views_count = COALESCE(views_count,0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET views_count = GREATEST(COALESCE(views_count,0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_post_views_count_trigger ON post_views;
CREATE TRIGGER update_post_views_count_trigger AFTER INSERT OR DELETE ON post_views
  FOR EACH ROW EXECUTE FUNCTION update_post_views_count();

-- Backfill
UPDATE posts
SET views_count = COALESCE((SELECT COUNT(*) FROM post_views WHERE post_views.post_id = posts.id), 0)
WHERE views_count = 0;

COMMENT ON COLUMN posts.views_count IS 'Total unique views (tracked via post_views)';
COMMENT ON TABLE post_views IS 'Unique post views per user/IP for analytics/trending';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SOURCE A-superapp: 20260712103000_batch2_calls_live.sql
-- SHA256 6a343170ced87dbf95c0763dd2ec9c64a92daf0384f12b18c4579e79117493f7
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.call_webrtc_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.call_webrtc_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users read call config" ON public.call_webrtc_config;
CREATE POLICY "Authenticated users read call config"
  ON public.call_webrtc_config FOR SELECT
  USING (auth.role() = 'authenticated');

ALTER TABLE public.call_participants
  ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'connecting',
  ADD COLUMN IF NOT EXISTS network_quality text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_info jsonb,
  ADD COLUMN IF NOT EXISTS screen_share_track_id text;

CREATE INDEX IF NOT EXISTS idx_call_participants_call_state
  ON public.call_participants(call_id, connection_state, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.call_quality_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rtt_ms integer NOT NULL DEFAULT 0,
  jitter_ms integer NOT NULL DEFAULT 0,
  packet_loss numeric NOT NULL DEFAULT 0,
  quality text NOT NULL DEFAULT 'disconnected',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.call_quality_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_call_quality_reports_call_created
  ON public.call_quality_reports(call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_quality_reports_user_created
  ON public.call_quality_reports(user_id, created_at DESC);
DROP POLICY IF EXISTS "Call participants view quality reports" ON public.call_quality_reports;
CREATE POLICY "Call participants view quality reports"
  ON public.call_quality_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.call_participants cp
      WHERE cp.call_id = call_quality_reports.call_id
        AND cp.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users write own quality reports" ON public.call_quality_reports;
CREATE POLICY "Users write own quality reports"
  ON public.call_quality_reports FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.call_participants cp
      WHERE cp.call_id = call_quality_reports.call_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_call_events_call_created
  ON public.call_events(call_id, created_at DESC);
DROP POLICY IF EXISTS "Call participants view call events" ON public.call_events;
CREATE POLICY "Call participants view call events"
  ON public.call_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.call_participants cp
      WHERE cp.call_id = call_events.call_id
        AND cp.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Call participants write own events" ON public.call_events;
CREATE POLICY "Call participants write own events"
  ON public.call_events FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.call_participants cp
      WHERE cp.call_id = call_events.call_id
        AND cp.user_id = auth.uid()
    )
  );

ALTER TABLE public.live_stream_viewers
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_live_stream_viewers_last_seen
  ON public.live_stream_viewers(stream_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.live_stream_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  moderator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_stream_moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_live_stream_mod_actions_stream
  ON public.live_stream_moderation_actions(stream_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_stream_mod_actions_target
  ON public.live_stream_moderation_actions(target_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.can_moderate_live_stream(p_stream_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.id = p_stream_id
      AND ls.user_id = p_user_id
  );
$$;

DROP POLICY IF EXISTS "Live moderators write moderation actions" ON public.live_stream_moderation_actions;
CREATE POLICY "Live moderators write moderation actions"
  ON public.live_stream_moderation_actions FOR INSERT
  WITH CHECK (public.can_moderate_live_stream(stream_id, auth.uid()));
DROP POLICY IF EXISTS "Live participants view relevant moderation actions" ON public.live_stream_moderation_actions;
CREATE POLICY "Live participants view relevant moderation actions"
  ON public.live_stream_moderation_actions FOR SELECT
  USING (
    public.can_moderate_live_stream(stream_id, auth.uid())
    OR target_user_id = auth.uid()
  );

CREATE TABLE IF NOT EXISTS public.live_stream_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_stream_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_live_stream_reports_stream_status
  ON public.live_stream_reports(stream_id, status, created_at DESC);
DROP POLICY IF EXISTS "Users create own live reports" ON public.live_stream_reports;
CREATE POLICY "Users create own live reports"
  ON public.live_stream_reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS "Moderators view live reports" ON public.live_stream_reports;
CREATE POLICY "Moderators view live reports"
  ON public.live_stream_reports FOR SELECT
  USING (public.can_moderate_live_stream(stream_id, auth.uid()));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_quality_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_quality_reports;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_stream_moderation_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_moderation_actions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_stream_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_reports;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260712110000_view_history.sql
-- SHA256 ccf8225c4fbc1af3593cbe856f67b1f2c169f01787c178e61129b35d9cace777
-- ============================================================================
-- Migration: View History for Watch/View Content Tracking
-- Date: 2026-07-12
-- Purpose: Track user view history for videos, posts, products, channels, and other content

BEGIN;

-- Create view_history table
CREATE TABLE IF NOT EXISTS view_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'post', 'product', 'channel', 'article', 'story')),
  content_id UUID NOT NULL,
  progress NUMERIC, -- For videos: 0-1 (percentage) or seconds; NULL for other types
  viewed_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_user_content UNIQUE (user_id, content_type, content_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_view_history_user_viewed ON view_history(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_view_history_content ON view_history(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_view_history_user_type ON view_history(user_id, content_type, viewed_at DESC);

-- Enable RLS
ALTER TABLE view_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can read own history" ON view_history;
CREATE POLICY "Users can read own history" ON view_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own history" ON view_history;
CREATE POLICY "Users can insert own history" ON view_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own history" ON view_history;
CREATE POLICY "Users can update own history" ON view_history
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own history" ON view_history;
CREATE POLICY "Users can delete own history" ON view_history
  FOR DELETE USING (auth.uid() = user_id);

-- Create user_preferences table for history settings (if not exists)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  history_paused BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Comments for documentation
COMMENT ON TABLE view_history IS 'User content view history - YouTube/Instagram style watch history';
COMMENT ON COLUMN view_history.content_type IS 'Type of content: video, post, product, channel, article, story';
COMMENT ON COLUMN view_history.progress IS 'For videos: playback position (0-1 or seconds); NULL for other content';
COMMENT ON COLUMN view_history.viewed_at IS 'Timestamp of view (updated on re-view to move to top)';

COMMENT ON TABLE user_preferences IS 'User preferences including history pause state';
COMMENT ON COLUMN user_preferences.history_paused IS 'When true, stop recording view history';

COMMIT;


-- ============================================================================
-- SOURCE A-superapp: 20260712120000_comprehensive_schema_sync.sql
-- SHA256 ac6c820f78cdd177a9b290ca639735d9be41859b214157b8fbcf86cd31b26d14
-- ============================================================================
-- Comprehensive Schema Sync Migration
-- Adds all missing columns found in client code audit
-- Project: mbhjganbihamoiqmankv.supabase.co
-- Date: 2026-07-12

-- ============================================================================
-- conversation_participants: Add mute_until column
-- ============================================================================
ALTER TABLE conversation_participants 
ADD COLUMN IF NOT EXISTS mute_until timestamptz;

COMMENT ON COLUMN conversation_participants.mute_until IS 'Timestamp when mute expires (null = not muted or muted indefinitely)';

-- ============================================================================
-- posts: Add all missing columns for repost/share/discovery features
-- ============================================================================

-- Source columns (for reposts from groups/channels)
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS source_type text CHECK (source_type IN ('user', 'group', 'channel', 'repost'));

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS source_id uuid;

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS source_title text;

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS source_avatar_url text;

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS source_message_id uuid;

-- Discovery & rich content columns
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS poll_data jsonb;

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS location text;

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS mentioned_users uuid[];

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS tags text[];

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS thumbnail_url text;

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS video_duration integer;

-- Content moderation columns
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS moderation_status text CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged'));

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS maturity_rating text CHECK (maturity_rating IN ('general', 'teen', 'mature', 'explicit'));

-- Set defaults for existing rows
UPDATE posts SET source_type = 'user' WHERE source_type IS NULL;
UPDATE posts SET moderation_status = 'approved' WHERE moderation_status IS NULL;
UPDATE posts SET maturity_rating = 'general' WHERE maturity_rating IS NULL;

-- Add column comments
COMMENT ON COLUMN posts.source_type IS 'Type of content source: user (original), group, channel, or repost';
COMMENT ON COLUMN posts.source_id IS 'ID of source group/channel if reposted';
COMMENT ON COLUMN posts.source_title IS 'Title of source group/channel';
COMMENT ON COLUMN posts.source_avatar_url IS 'Avatar of source group/channel';
COMMENT ON COLUMN posts.source_message_id IS 'Original message ID if reposted from group/channel';
COMMENT ON COLUMN posts.poll_data IS 'JSON data for polls: {question, options: [{text, votes}], expires_at}';
COMMENT ON COLUMN posts.location IS 'Geographic location text or coordinates';
COMMENT ON COLUMN posts.mentioned_users IS 'Array of user IDs mentioned in post';
COMMENT ON COLUMN posts.tags IS 'Array of hashtags extracted from content';
COMMENT ON COLUMN posts.thumbnail_url IS 'Video thumbnail URL (for video posts)';
COMMENT ON COLUMN posts.video_duration IS 'Video duration in seconds';
COMMENT ON COLUMN posts.moderation_status IS 'Content moderation status';
COMMENT ON COLUMN posts.maturity_rating IS 'Age-appropriateness rating';

-- ============================================================================
-- user_preferences: Add history_paused column
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  history_paused boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS for user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
CREATE POLICY "Users can view own preferences" 
ON user_preferences FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" 
ON user_preferences FOR ALL 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE user_preferences IS 'User-specific preferences and settings';
COMMENT ON COLUMN user_preferences.history_paused IS 'Whether view history recording is paused';

-- ============================================================================
-- Indexes for performance
-- ============================================================================

-- Posts indexes for new columns
CREATE INDEX IF NOT EXISTS idx_posts_source_type ON posts(source_type) WHERE source_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_source_id ON posts(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING GIN(tags) WHERE tags IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_mentioned_users ON posts USING GIN(mentioned_users) WHERE mentioned_users IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_moderation_status ON posts(moderation_status);

-- conversation_participants index for mute_until
CREATE INDEX IF NOT EXISTS idx_conversation_participants_mute_until 
ON conversation_participants(mute_until) 
WHERE mute_until IS NOT NULL;

-- ============================================================================
-- Reload API schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

