export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_account_members: {
        Row: {
          ad_account_id: string
          created_at: string
          id: string
          invited_by: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_account_members_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_account_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_account_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_accounts: {
        Row: {
          billing_email: string | null
          business_country: string | null
          business_name: string | null
          created_at: string
          currency: string
          id: string
          name: string
          owner_user_id: string
          spend_limit: number | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          business_country?: string | null
          business_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          name: string
          owner_user_id: string
          spend_limit?: number | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          business_country?: string | null
          business_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          name?: string
          owner_user_id?: string
          spend_limit?: number | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_budget_ledger_v2: {
        Row: {
          ad_account_id: string
          amount: number
          campaign_id: string | null
          created_at: string
          currency: string
          id: string
          kind: string
          metadata: Json
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          ad_account_id: string
          amount: number
          campaign_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          kind: string
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          ad_account_id?: string
          amount?: number
          campaign_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_budget_ledger_v2_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_budget_ledger_v2_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns_v2: {
        Row: {
          ad_account_id: string
          attribution_click_days: number
          attribution_view_days: number
          buying_type: string
          created_at: string
          created_by: string
          daily_budget: number | null
          end_at: string | null
          id: string
          lifetime_budget: number | null
          metadata: Json
          name: string
          objective: string
          optimization_goal: string | null
          special_ad_category: string | null
          start_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          attribution_click_days?: number
          attribution_view_days?: number
          buying_type?: string
          created_at?: string
          created_by: string
          daily_budget?: number | null
          end_at?: string | null
          id?: string
          lifetime_budget?: number | null
          metadata?: Json
          name: string
          objective: string
          optimization_goal?: string | null
          special_ad_category?: string | null
          start_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          attribution_click_days?: number
          attribution_view_days?: number
          buying_type?: string
          created_at?: string
          created_by?: string
          daily_budget?: number | null
          end_at?: string | null
          id?: string
          lifetime_budget?: number | null
          metadata?: Json
          name?: string
          objective?: string
          optimization_goal?: string | null
          special_ad_category?: string | null
          start_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_v2_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_v2_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_clicks: {
        Row: {
          ad_id: string
          created_at: string
          device_type: string | null
          id: string
          placement: string
          user_id: string | null
        }
        Insert: {
          ad_id: string
          created_at?: string
          device_type?: string | null
          id?: string
          placement: string
          user_id?: string | null
        }
        Update: {
          ad_id?: string
          created_at?: string
          device_type?: string | null
          id?: string
          placement?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_clicks_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_conversion_events_v2: {
        Row: {
          ad_account_id: string | null
          ad_set_id: string | null
          campaign_id: string | null
          click_event_key: string | null
          created_at: string
          currency: string | null
          delivery_item_id: string | null
          event_id: string | null
          event_name: string
          id: string
          impression_event_key: string | null
          legacy_ad_id: string | null
          metadata: Json
          occurred_at: string
          source: string
          source_url: string | null
          user_id: string | null
          value: number | null
        }
        Insert: {
          ad_account_id?: string | null
          ad_set_id?: string | null
          campaign_id?: string | null
          click_event_key?: string | null
          created_at?: string
          currency?: string | null
          delivery_item_id?: string | null
          event_id?: string | null
          event_name: string
          id?: string
          impression_event_key?: string | null
          legacy_ad_id?: string | null
          metadata?: Json
          occurred_at?: string
          source?: string
          source_url?: string | null
          user_id?: string | null
          value?: number | null
        }
        Update: {
          ad_account_id?: string | null
          ad_set_id?: string | null
          campaign_id?: string | null
          click_event_key?: string | null
          created_at?: string
          currency?: string | null
          delivery_item_id?: string | null
          event_id?: string | null
          event_name?: string
          id?: string
          impression_event_key?: string | null
          legacy_ad_id?: string | null
          metadata?: Json
          occurred_at?: string
          source?: string
          source_url?: string | null
          user_id?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_conversion_events_v2_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_conversion_events_v2_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "ad_sets_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_conversion_events_v2_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_conversion_events_v2_delivery_item_id_fkey"
            columns: ["delivery_item_id"]
            isOneToOne: false
            referencedRelation: "ad_delivery_items_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_conversion_events_v2_legacy_ad_id_fkey"
            columns: ["legacy_ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_conversion_events_v2_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creatives_v2: {
        Row: {
          ad_account_id: string
          body: string | null
          call_to_action: string | null
          created_at: string
          created_by: string
          destination_url: string | null
          display_url: string | null
          format: string
          headline: string | null
          id: string
          media_url: string | null
          metadata: Json
          moderation_status: string
          name: string
          policy_labels: string[]
          quality_score: number
          status: string
          thumbnail_url: string | null
          tracking_params: Json
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          body?: string | null
          call_to_action?: string | null
          created_at?: string
          created_by: string
          destination_url?: string | null
          display_url?: string | null
          format: string
          headline?: string | null
          id?: string
          media_url?: string | null
          metadata?: Json
          moderation_status?: string
          name: string
          policy_labels?: string[]
          quality_score?: number
          status?: string
          thumbnail_url?: string | null
          tracking_params?: Json
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          body?: string | null
          call_to_action?: string | null
          created_at?: string
          created_by?: string
          destination_url?: string | null
          display_url?: string | null
          format?: string
          headline?: string | null
          id?: string
          media_url?: string | null
          metadata?: Json
          moderation_status?: string
          name?: string
          policy_labels?: string[]
          quality_score?: number
          status?: string
          thumbnail_url?: string | null
          tracking_params?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_v2_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creatives_v2_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_daily_metrics_v3: {
        Row: {
          ad_id: string
          clicks: number
          conversion_value: number
          conversions: number
          day: string
          dismissals: number
          estimated_spend: number
          impressions: number
          placement: string
          reports: number
          updated_at: string
        }
        Insert: {
          ad_id: string
          clicks?: number
          conversion_value?: number
          conversions?: number
          day: string
          dismissals?: number
          estimated_spend?: number
          impressions?: number
          placement: string
          reports?: number
          updated_at?: string
        }
        Update: {
          ad_id?: string
          clicks?: number
          conversion_value?: number
          conversions?: number
          day?: string
          dismissals?: number
          estimated_spend?: number
          impressions?: number
          placement?: string
          reports?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_daily_metrics_v3_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_delivery_config: {
        Row: {
          daily_cap: number
          enabled: boolean
          hide_cooldown_seconds: number
          min_organic_before_first: number
          min_organic_gap: number
          min_session_seconds: number
          min_time_gap_seconds: number
          placement: string
          same_ad_daily_cap: number
          same_ad_gap_seconds: number
          session_cap: number
          updated_at: string
        }
        Insert: {
          daily_cap?: number
          enabled?: boolean
          hide_cooldown_seconds?: number
          min_organic_before_first?: number
          min_organic_gap?: number
          min_session_seconds?: number
          min_time_gap_seconds?: number
          placement: string
          same_ad_daily_cap?: number
          same_ad_gap_seconds?: number
          session_cap?: number
          updated_at?: string
        }
        Update: {
          daily_cap?: number
          enabled?: boolean
          hide_cooldown_seconds?: number
          min_organic_before_first?: number
          min_organic_gap?: number
          min_session_seconds?: number
          min_time_gap_seconds?: number
          placement?: string
          same_ad_daily_cap?: number
          same_ad_gap_seconds?: number
          session_cap?: number
          updated_at?: string
        }
        Relationships: []
      }
      ad_delivery_events: {
        Row: {
          ad_id: string
          created_at: string
          device_type: string | null
          event_key: string | null
          event_type: string
          fraud_score: number
          id: string
          invalid_reason: string | null
          is_invalid: boolean
          metadata: Json
          placement: string
          score: number | null
          session_id: string | null
          slot_key: string | null
          user_id: string | null
        }
        Insert: {
          ad_id: string
          created_at?: string
          device_type?: string | null
          event_key?: string | null
          event_type: string
          fraud_score?: number
          id?: string
          invalid_reason?: string | null
          is_invalid?: boolean
          metadata?: Json
          placement: string
          score?: number | null
          session_id?: string | null
          slot_key?: string | null
          user_id?: string | null
        }
        Update: {
          ad_id?: string
          created_at?: string
          device_type?: string | null
          event_key?: string | null
          event_type?: string
          fraud_score?: number
          id?: string
          invalid_reason?: string | null
          is_invalid?: boolean
          metadata?: Json
          placement?: string
          score?: number | null
          session_id?: string | null
          slot_key?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_delivery_events_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_delivery_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_delivery_items_v2: {
        Row: {
          ad_account_id: string
          ad_set_id: string
          campaign_id: string
          created_at: string
          creative_id: string
          delivery_weight: number
          external_key: string | null
          id: string
          legacy_ad_id: string | null
          metadata: Json
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          ad_set_id: string
          campaign_id: string
          created_at?: string
          creative_id: string
          delivery_weight?: number
          external_key?: string | null
          id?: string
          legacy_ad_id?: string | null
          metadata?: Json
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          ad_set_id?: string
          campaign_id?: string
          created_at?: string
          creative_id?: string
          delivery_weight?: number
          external_key?: string | null
          id?: string
          legacy_ad_id?: string | null
          metadata?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_delivery_items_v2_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_delivery_items_v2_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "ad_sets_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_delivery_items_v2_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_delivery_items_v2_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_delivery_items_v2_legacy_ad_id_fkey"
            columns: ["legacy_ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_experiment_assignments_v4: {
        Row: {
          assigned_at: string
          experiment_id: string
          id: string
          session_id: string | null
          user_id: string | null
          variant_id: string
        }
        Insert: {
          assigned_at?: string
          experiment_id: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          variant_id: string
        }
        Update: {
          assigned_at?: string
          experiment_id?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_experiment_assignments_v4_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ad_experiments_v4"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_experiment_assignments_v4_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_experiment_assignments_v4_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ad_experiment_variants_v4"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_experiment_variants_v4: {
        Row: {
          allocation_pct: number
          created_at: string
          delivery_item_id: string
          experiment_id: string
          id: string
          is_control: boolean
          name: string
        }
        Insert: {
          allocation_pct: number
          created_at?: string
          delivery_item_id: string
          experiment_id: string
          id?: string
          is_control?: boolean
          name: string
        }
        Update: {
          allocation_pct?: number
          created_at?: string
          delivery_item_id?: string
          experiment_id?: string
          id?: string
          is_control?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_experiment_variants_v4_delivery_item_id_fkey"
            columns: ["delivery_item_id"]
            isOneToOne: false
            referencedRelation: "ad_delivery_items_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_experiment_variants_v4_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ad_experiments_v4"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_experiments_v4: {
        Row: {
          ad_account_id: string
          campaign_id: string
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          metadata: Json
          minimum_sample_size: number
          name: string
          primary_metric: string
          starts_at: string | null
          status: string
          traffic_percent: number
          updated_at: string
          winner_variant_id: string | null
        }
        Insert: {
          ad_account_id: string
          campaign_id: string
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          metadata?: Json
          minimum_sample_size?: number
          name: string
          primary_metric?: string
          starts_at?: string | null
          status?: string
          traffic_percent?: number
          updated_at?: string
          winner_variant_id?: string | null
        }
        Update: {
          ad_account_id?: string
          campaign_id?: string
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          metadata?: Json
          minimum_sample_size?: number
          name?: string
          primary_metric?: string
          starts_at?: string | null
          status?: string
          traffic_percent?: number
          updated_at?: string
          winner_variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_experiments_v4_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_experiments_v4_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_experiments_v4_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_experiments_v4_winner_variant_id_fkey"
            columns: ["winner_variant_id"]
            isOneToOne: false
            referencedRelation: "ad_experiment_variants_v4"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_fraud_signals_v4: {
        Row: {
          ad_id: string
          created_at: string
          delivery_event_id: string | null
          device_type: string | null
          id: string
          metadata: Json
          placement: string
          session_id: string | null
          severity: number
          signal_type: string
          user_id: string | null
        }
        Insert: {
          ad_id: string
          created_at?: string
          delivery_event_id?: string | null
          device_type?: string | null
          id?: string
          metadata?: Json
          placement: string
          session_id?: string | null
          severity: number
          signal_type: string
          user_id?: string | null
        }
        Update: {
          ad_id?: string
          created_at?: string
          delivery_event_id?: string | null
          device_type?: string | null
          id?: string
          metadata?: Json
          placement?: string
          session_id?: string | null
          severity?: number
          signal_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_fraud_signals_v4_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_fraud_signals_v4_delivery_event_id_fkey"
            columns: ["delivery_event_id"]
            isOneToOne: false
            referencedRelation: "ad_delivery_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_fraud_signals_v4_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_frequency_counters: {
        Row: {
          ad_id: string
          clicks: number
          day: string
          dismissals: number
          first_impression_at: string | null
          impressions: number
          last_click_at: string | null
          last_impression_at: string | null
          placement: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_id: string
          clicks?: number
          day?: string
          dismissals?: number
          first_impression_at?: string | null
          impressions?: number
          last_click_at?: string | null
          last_impression_at?: string | null
          placement: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_id?: string
          clicks?: number
          day?: string
          dismissals?: number
          first_impression_at?: string | null
          impressions?: number
          last_click_at?: string | null
          last_impression_at?: string | null
          placement?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_frequency_counters_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_frequency_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_impressions: {
        Row: {
          ad_id: string
          created_at: string
          device_type: string | null
          id: string
          placement: string
          user_id: string | null
        }
        Insert: {
          ad_id: string
          created_at?: string
          device_type?: string | null
          id?: string
          placement: string
          user_id?: string | null
        }
        Update: {
          ad_id?: string
          created_at?: string
          device_type?: string | null
          id?: string
          placement?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_impressions_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_moderation_reviews_v2: {
        Row: {
          ad_account_id: string
          created_at: string
          creative_id: string
          decision: string
          id: string
          metadata: Json
          notes: string | null
          policy_labels: string[]
          reason_code: string | null
          reviewer_id: string | null
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          creative_id: string
          decision: string
          id?: string
          metadata?: Json
          notes?: string | null
          policy_labels?: string[]
          reason_code?: string | null
          reviewer_id?: string | null
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          creative_id?: string
          decision?: string
          id?: string
          metadata?: Json
          notes?: string | null
          policy_labels?: string[]
          reason_code?: string | null
          reviewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_moderation_reviews_v2_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_moderation_reviews_v2_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_moderation_reviews_v2_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_quality_state_v3: {
        Row: {
          ad_id: string
          conversion_rate_30d: number
          ctr_30d: number
          hide_rate_30d: number
          quality_score: number
          report_rate_30d: number
          sample_impressions_30d: number
          status: string
          updated_at: string
        }
        Insert: {
          ad_id: string
          conversion_rate_30d?: number
          ctr_30d?: number
          hide_rate_30d?: number
          quality_score?: number
          report_rate_30d?: number
          sample_impressions_30d?: number
          status?: string
          updated_at?: string
        }
        Update: {
          ad_id?: string
          conversion_rate_30d?: number
          ctr_30d?: number
          hide_rate_30d?: number
          quality_score?: number
          report_rate_30d?: number
          sample_impressions_30d?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_quality_state_v3_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: true
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_reach: {
        Row: {
          ad_id: string
          first_seen_at: string
          id: string
          user_id: string
        }
        Insert: {
          ad_id: string
          first_seen_at?: string
          id?: string
          user_id: string
        }
        Update: {
          ad_id?: string
          first_seen_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_reach_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_sets_v2: {
        Row: {
          ad_account_id: string
          bid_amount: number | null
          bid_strategy: string
          campaign_id: string
          created_at: string
          created_by: string
          daily_budget: number | null
          end_at: string | null
          frequency_cap: Json
          id: string
          lifetime_budget: number | null
          metadata: Json
          name: string
          optimization_event: string | null
          placements: string[]
          schedule: Json
          start_at: string | null
          status: string
          targeting: Json
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          bid_amount?: number | null
          bid_strategy?: string
          campaign_id: string
          created_at?: string
          created_by: string
          daily_budget?: number | null
          end_at?: string | null
          frequency_cap?: Json
          id?: string
          lifetime_budget?: number | null
          metadata?: Json
          name: string
          optimization_event?: string | null
          placements?: string[]
          schedule?: Json
          start_at?: string | null
          status?: string
          targeting?: Json
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          bid_amount?: number | null
          bid_strategy?: string
          campaign_id?: string
          created_at?: string
          created_by?: string
          daily_budget?: number | null
          end_at?: string | null
          frequency_cap?: Json
          id?: string
          lifetime_budget?: number | null
          metadata?: Json
          name?: string
          optimization_event?: string | null
          placements?: string[]
          schedule?: Json
          start_at?: string | null
          status?: string
          targeting?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_v2_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_sets_v2_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_sets_v2_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_user_feedback: {
        Row: {
          ad_id: string
          created_at: string
          feedback_type: string
          id: string
          metadata: Json
          placement: string
          user_id: string
        }
        Insert: {
          ad_id: string
          created_at?: string
          feedback_type: string
          id?: string
          metadata?: Json
          placement: string
          user_id: string
        }
        Update: {
          ad_id?: string
          created_at?: string
          feedback_type?: string
          id?: string
          metadata?: Json
          placement?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_user_feedback_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_user_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_actions: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json
          before_state: Json
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json
          before_state?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json
          before_state?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_entity_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          pinned: boolean
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          pinned?: boolean
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          pinned?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_entity_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_feature_flag_history: {
        Row: {
          after_state: Json
          before_state: Json
          changed_by: string | null
          created_at: string
          flag_key: string
          id: string
          reason: string | null
        }
        Insert: {
          after_state?: Json
          before_state?: Json
          changed_by?: string | null
          created_at?: string
          flag_key: string
          id?: string
          reason?: string | null
        }
        Update: {
          after_state?: Json
          before_state?: Json
          changed_by?: string | null
          created_at?: string
          flag_key?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_feature_flag_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_incidents: {
        Row: {
          area: string
          assigned_to: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          resolution_note: string | null
          resolved_at: string | null
          severity: string
          source: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          area?: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: string
          source?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          area?: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: string
          source?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_incidents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "admin_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          expires_at: string | null
          id: string
          kind: string
          metadata: Json
          severity: string
          target_role_key: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          metadata?: Json
          severity?: string
          target_role_key?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          metadata?: Json
          severity?: string
          target_role_key?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_target_role_key_fkey"
            columns: ["target_role_key"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "admin_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_permissions: {
        Row: {
          category: string
          created_at: string
          description: string
          key: string
          label: string
          risk_level: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string
          key: string
          label: string
          risk_level?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          key?: string
          label?: string
          risk_level?: string
        }
        Relationships: []
      }
      admin_role_assignments: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          metadata: Json
          revoked_at: string | null
          revoked_by: string | null
          role_key: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          metadata?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          role_key: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          metadata?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          role_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_role_assignments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_role_assignments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_role_assignments_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "admin_role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_role_permissions: {
        Row: {
          created_at: string
          permission_key: string
          role_key: string
        }
        Insert: {
          created_at?: string
          permission_key: string
          role_key: string
        }
        Update: {
          created_at?: string
          permission_key?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "admin_permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "admin_role_permissions_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["key"]
          },
        ]
      }
      admin_roles: {
        Row: {
          created_at: string
          description: string
          is_system: boolean
          key: string
          label: string
          rank: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          is_system?: boolean
          key: string
          label: string
          rank?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          is_system?: boolean
          key?: string
          label?: string
          rank?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_user_deletion_jobs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          reason: string
          requested_at: string
          requested_by: string
          status: string
          target_user_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          reason: string
          requested_at?: string
          requested_by: string
          status?: string
          target_user_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          status?: string
          target_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ads: {
        Row: {
          ad_account_id: string | null
          ad_set_v2_id: string | null
          ad_type: string
          bid_amount: number | null
          billing_type: string
          budget: number
          call_to_action: string | null
          campaign_v2_id: string | null
          clicks_count: number
          created_at: string
          creative_v2_id: string | null
          daily_budget: number | null
          delivery_item_v2_id: string | null
          description: string | null
          destination_url: string | null
          end_date: string | null
          id: string
          impressions_count: number
          media_type: string
          media_url: string
          reach_count: number
          spent: number
          start_date: string | null
          status: string
          target_age_max: number | null
          target_age_min: number | null
          target_countries: string[] | null
          target_gender: string | null
          target_interests: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          ad_set_v2_id?: string | null
          ad_type?: string
          bid_amount?: number | null
          billing_type?: string
          budget?: number
          call_to_action?: string | null
          campaign_v2_id?: string | null
          clicks_count?: number
          created_at?: string
          creative_v2_id?: string | null
          daily_budget?: number | null
          delivery_item_v2_id?: string | null
          description?: string | null
          destination_url?: string | null
          end_date?: string | null
          id?: string
          impressions_count?: number
          media_type?: string
          media_url: string
          reach_count?: number
          spent?: number
          start_date?: string | null
          status?: string
          target_age_max?: number | null
          target_age_min?: number | null
          target_countries?: string[] | null
          target_gender?: string | null
          target_interests?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
          ad_set_v2_id?: string | null
          ad_type?: string
          bid_amount?: number | null
          billing_type?: string
          budget?: number
          call_to_action?: string | null
          campaign_v2_id?: string | null
          clicks_count?: number
          created_at?: string
          creative_v2_id?: string | null
          daily_budget?: number | null
          delivery_item_v2_id?: string | null
          description?: string | null
          destination_url?: string | null
          end_date?: string | null
          id?: string
          impressions_count?: number
          media_type?: string
          media_url?: string
          reach_count?: number
          spent?: number
          start_date?: string | null
          status?: string
          target_age_max?: number | null
          target_age_min?: number | null
          target_countries?: string[] | null
          target_gender?: string | null
          target_interests?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_ad_set_v2_id_fkey"
            columns: ["ad_set_v2_id"]
            isOneToOne: false
            referencedRelation: "ad_sets_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_campaign_v2_id_fkey"
            columns: ["campaign_v2_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_creative_v2_id_fkey"
            columns: ["creative_v2_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_delivery_item_v2_id_fkey"
            columns: ["delivery_item_v2_id"]
            isOneToOne: false
            referencedRelation: "ad_delivery_items_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_run_events: {
        Row: {
          created_at: string
          id: number
          payload: Json
          run_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: number
          payload?: Json
          run_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: number
          payload?: Json
          run_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_runs: {
        Row: {
          checkpoint: Json
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          dispatch_token: string
          final_text: string | null
          id: string
          input: Json
          language: string | null
          last_error: string | null
          lease_until: string | null
          max_rounds: number
          max_run_ms: number
          max_tool_calls: number
          mode: string
          requested_model: string
          resolved_model: string | null
          round_count: number
          status: string
          task: string | null
          tool_call_count: number
          tool_groups: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          checkpoint?: Json
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          dispatch_token: string
          final_text?: string | null
          id?: string
          input?: Json
          language?: string | null
          last_error?: string | null
          lease_until?: string | null
          max_rounds?: number
          max_run_ms?: number
          max_tool_calls?: number
          mode?: string
          requested_model?: string
          resolved_model?: string | null
          round_count?: number
          status?: string
          task?: string | null
          tool_call_count?: number
          tool_groups?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          checkpoint?: Json
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          dispatch_token?: string
          final_text?: string | null
          id?: string
          input?: Json
          language?: string | null
          last_error?: string | null
          lease_until?: string | null
          max_rounds?: number
          max_run_ms?: number
          max_tool_calls?: number
          mode?: string
          requested_model?: string
          resolved_model?: string | null
          round_count?: number
          status?: string
          task?: string | null
          tool_call_count?: number
          tool_groups?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_api_key_pool: {
        Row: {
          api_key: string
          created_at: string
          id: number
          is_active: boolean
          priority: number
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: number
          is_active?: boolean
          priority?: number
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: number
          is_active?: boolean
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_computer_tasks: {
        Row: {
          action: string
          approved_at: string | null
          conversation_id: string | null
          created_at: string
          device_id: string | null
          error: string | null
          expires_at: string
          finished_at: string | null
          id: string
          payload: Json
          reason: string
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          approved_at?: string | null
          conversation_id?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          expires_at?: string
          finished_at?: string | null
          id?: string
          payload?: Json
          reason: string
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          approved_at?: string | null
          conversation_id?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          expires_at?: string
          finished_at?: string | null
          id?: string
          payload?: Json
          reason?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_computer_tasks_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "ai_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_connectors: {
        Row: {
          auth_token: string | null
          auth_type: string | null
          base_url: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          kind: string
          last_error: string | null
          last_ok_at: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_token?: string | null
          auth_type?: string | null
          base_url: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          kind?: string
          last_error?: string | null
          last_ok_at?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_token?: string | null
          auth_type?: string | null
          base_url?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          kind?: string
          last_error?: string | null
          last_ok_at?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          context: string | null
          created_at: string
          id: string
          messages: Json
          project_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          id?: string
          messages?: Json
          project_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          id?: string
          messages?: Json
          project_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ai_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_devices: {
        Row: {
          agent_version: string | null
          capabilities: Json
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          paired_at: string
          platform: string | null
          revoked: boolean
          user_id: string
        }
        Insert: {
          agent_version?: string | null
          capabilities?: Json
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name: string
          paired_at?: string
          platform?: string | null
          revoked?: boolean
          user_id: string
        }
        Update: {
          agent_version?: string | null
          capabilities?: Json
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          paired_at?: string
          platform?: string | null
          revoked?: boolean
          user_id?: string
        }
        Relationships: []
      }
      ai_github_connections: {
        Row: {
          created_at: string
          login: string | null
          scopes: string[]
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          login?: string | null
          scopes?: string[]
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          login?: string | null
          scopes?: string[]
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_media_jobs: {
        Row: {
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          output_url: string | null
          params: Json
          prompt: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          output_url?: string | null
          params?: Json
          prompt: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          output_url?: string | null
          params?: Json
          prompt?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_memories: {
        Row: {
          content: string | null
          created_at: string
          id: string
          key: string
          kind: string
          source: string | null
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          key: string
          kind?: string
          source?: string | null
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          key?: string
          kind?: string
          source?: string | null
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      ai_preferences: {
        Row: {
          alerts_enabled: boolean | null
          content_filter: string[] | null
          created_at: string
          daily_time_limit_minutes: number | null
          id: string
          recommendation_topics: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alerts_enabled?: boolean | null
          content_filter?: string[] | null
          created_at?: string
          daily_time_limit_minutes?: number | null
          id?: string
          recommendation_topics?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alerts_enabled?: boolean | null
          content_filter?: string[] | null
          created_at?: string
          daily_time_limit_minutes?: number | null
          id?: string
          recommendation_topics?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_projects: {
        Row: {
          created_at: string
          id: string
          instructions: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          api_key: string
          created_at: string
          domains: string[] | null
          id: string
          is_active: boolean | null
          key_type: string
          last_used_at: string | null
          name: string
          requests_limit: number | null
          requests_today: number | null
          secret_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string
          created_at?: string
          domains?: string[] | null
          id?: string
          is_active?: boolean | null
          key_type?: string
          last_used_at?: string | null
          name: string
          requests_limit?: number | null
          requests_today?: number | null
          secret_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          domains?: string[] | null
          id?: string
          is_active?: boolean | null
          key_type?: string
          last_used_at?: string | null
          name?: string
          requests_limit?: number | null
          requests_today?: number | null
          secret_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          ip_address: string | null
          method: string
          request_body: Json | null
          response_time_ms: number | null
          status_code: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          method?: string
          request_body?: Json | null
          response_time_ms?: number | null
          status_code: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          method?: string
          request_body?: Json | null
          response_time_ms?: number | null
          status_code?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      app_analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          platform: string | null
          properties: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          platform?: string | null
          properties?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          platform?: string | null
          properties?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appeals: {
        Row: {
          appellant_id: string | null
          assigned_admin_id: string | null
          created_at: string
          decision_note: string | null
          enforcement_action_id: string
          id: string
          reason: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appellant_id?: string | null
          assigned_admin_id?: string | null
          created_at?: string
          decision_note?: string | null
          enforcement_action_id: string
          id?: string
          reason: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appellant_id?: string | null
          assigned_admin_id?: string | null
          created_at?: string
          decision_note?: string | null
          enforcement_action_id?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appeals_appellant_id_fkey"
            columns: ["appellant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appeals_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appeals_enforcement_action_id_fkey"
            columns: ["enforcement_action_id"]
            isOneToOne: false
            referencedRelation: "enforcement_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_devices: {
        Row: {
          created_at: string
          device_hash: string
          id: string
          identity_id: string
          ip: string | null
          label: string | null
          last_seen_at: string
          revoked_at: string | null
          revoked_reason: string | null
          slot_no: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_hash: string
          id?: string
          identity_id: string
          ip?: string | null
          label?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          slot_no?: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_hash?: string
          id?: string
          identity_id?: string
          ip?: string | null
          label?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          slot_no?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_devices_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "auth_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          identity_id: string | null
          ip: unknown
          metadata: Json
          outcome: string
          reason: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          identity_id?: string | null
          ip?: unknown
          metadata?: Json
          outcome?: string
          reason?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          identity_id?: string | null
          ip?: unknown
          metadata?: Json
          outcome?: string
          reason?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_events_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "auth_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_identities: {
        Row: {
          alsamos_email: string | null
          created_at: string
          id: string
          max_accounts: number
          migration_status: string
          phone: string | null
          phone_verified_at: string | null
          primary_user_id: string
          tos_accepted_at: string | null
          tos_version: string | null
          updated_at: string
        }
        Insert: {
          alsamos_email?: string | null
          created_at?: string
          id?: string
          max_accounts?: number
          migration_status?: string
          phone?: string | null
          phone_verified_at?: string | null
          primary_user_id: string
          tos_accepted_at?: string | null
          tos_version?: string | null
          updated_at?: string
        }
        Update: {
          alsamos_email?: string | null
          created_at?: string
          id?: string
          max_accounts?: number
          migration_status?: string
          phone?: string | null
          phone_verified_at?: string | null
          primary_user_id?: string
          tos_accepted_at?: string | null
          tos_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      auth_login_attempts: {
        Row: {
          created_at: string
          email_hash: string
          id: number
          ip: unknown
          outcome: string
        }
        Insert: {
          created_at?: string
          email_hash: string
          id?: number
          ip?: unknown
          outcome: string
        }
        Update: {
          created_at?: string
          email_hash?: string
          id?: number
          ip?: unknown
          outcome?: string
        }
        Relationships: []
      }
      auth_login_tickets: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          identity_id: string
          ip: unknown
          purpose: string
          token_hash: string
          user_agent: string | null
          uses_left: number
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          identity_id: string
          ip?: unknown
          purpose?: string
          token_hash: string
          user_agent?: string | null
          uses_left?: number
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          identity_id?: string
          ip?: unknown
          purpose?: string
          token_hash?: string
          user_agent?: string | null
          uses_left?: number
        }
        Relationships: [
          {
            foreignKeyName: "auth_login_tickets_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "auth_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_messages: {
        Row: {
          bot_id: string
          created_at: string
          direction: string
          id: string
          kind: string
          payload: Json
          text: string | null
          user_id: string | null
        }
        Insert: {
          bot_id: string
          created_at?: string
          direction: string
          id?: string
          kind?: string
          payload?: Json
          text?: string | null
          user_id?: string | null
        }
        Update: {
          bot_id?: string
          created_at?: string
          direction?: string
          id?: string
          kind?: string
          payload?: Json
          text?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_messages_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_updates: {
        Row: {
          bot_id: string
          consumed_at: string | null
          created_at: string
          id: number
          payload: Json
          update_type: string
          user_id: string | null
        }
        Insert: {
          bot_id: string
          consumed_at?: string | null
          created_at?: string
          id?: number
          payload?: Json
          update_type: string
          user_id?: string | null
        }
        Update: {
          bot_id?: string
          consumed_at?: string | null
          created_at?: string
          id?: number
          payload?: Json
          update_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_updates_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          allowed_updates: Json
          commands: Json
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          last_used_at: string | null
          mini_app_id: string | null
          mini_app_url: string | null
          owner_id: string
          publisher_id: string | null
          requests_total: number
          token_hash: string
          token_prefix: string
          updated_at: string
          username: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          allowed_updates?: Json
          commands?: Json
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          mini_app_id?: string | null
          mini_app_url?: string | null
          owner_id: string
          publisher_id?: string | null
          requests_total?: number
          token_hash: string
          token_prefix: string
          updated_at?: string
          username: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          allowed_updates?: Json
          commands?: Json
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          mini_app_id?: string | null
          mini_app_url?: string | null
          owner_id?: string
          publisher_id?: string | null
          requests_total?: number
          token_hash?: string
          token_prefix?: string
          updated_at?: string
          username?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bots_mini_app_id_fkey"
            columns: ["mini_app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bots_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
        ]
      }
      business_accounts: {
        Row: {
          admin_email: string | null
          admin_first_name: string | null
          admin_last_name: string | null
          admin_phone: string | null
          company_address: string | null
          company_domain: string | null
          company_name: string
          company_size: string | null
          created_at: string
          domain_verified: boolean
          id: string
          industry: string | null
          owner_id: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          admin_email?: string | null
          admin_first_name?: string | null
          admin_last_name?: string | null
          admin_phone?: string | null
          company_address?: string | null
          company_domain?: string | null
          company_name: string
          company_size?: string | null
          created_at?: string
          domain_verified?: boolean
          id?: string
          industry?: string | null
          owner_id: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_email?: string | null
          admin_first_name?: string | null
          admin_last_name?: string | null
          admin_phone?: string | null
          company_address?: string | null
          company_domain?: string | null
          company_name?: string
          company_size?: string | null
          created_at?: string
          domain_verified?: boolean
          id?: string
          industry?: string | null
          owner_id?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      call_events: {
        Row: {
          call_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          call_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          call_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_history: {
        Row: {
          call_id: string
          call_type: string
          callee_id: string | null
          caller_id: string
          conversation_id: string
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          started_at: string | null
          status: string
        }
        Insert: {
          call_id: string
          call_type?: string
          callee_id?: string | null
          caller_id: string
          conversation_id: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          call_id?: string
          call_type?: string
          callee_id?: string | null
          caller_id?: string
          conversation_id?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_history_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_invites: {
        Row: {
          call_id: string
          call_type: string
          conversation_id: string | null
          created_at: string
          id: string
          invitee_id: string | null
          inviter_id: string | null
          metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          call_id: string
          call_type?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          invitee_id?: string | null
          inviter_id?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          call_id?: string
          call_type?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          invitee_id?: string | null
          inviter_id?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_invites_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_invites_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_invites_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_participants: {
        Row: {
          call_id: string
          connection_state: string
          device_info: Json | null
          id: string
          is_hand_raised: boolean | null
          is_muted: boolean | null
          is_screen_sharing: boolean | null
          is_video_on: boolean | null
          joined_at: string | null
          last_seen_at: string | null
          left_at: string | null
          network_quality: string | null
          role: string
          screen_share_track_id: string | null
          user_id: string
        }
        Insert: {
          call_id: string
          connection_state?: string
          device_info?: Json | null
          id?: string
          is_hand_raised?: boolean | null
          is_muted?: boolean | null
          is_screen_sharing?: boolean | null
          is_video_on?: boolean | null
          joined_at?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          network_quality?: string | null
          role?: string
          screen_share_track_id?: string | null
          user_id: string
        }
        Update: {
          call_id?: string
          connection_state?: string
          device_info?: Json | null
          id?: string
          is_hand_raised?: boolean | null
          is_muted?: boolean | null
          is_screen_sharing?: boolean | null
          is_video_on?: boolean | null
          joined_at?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          network_quality?: string | null
          role?: string
          screen_share_track_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_quality_events: {
        Row: {
          bitrate_kbps: number | null
          call_id: string
          created_at: string
          id: string
          jitter_ms: number | null
          metadata: Json
          packets_lost: number | null
          peer_id: string | null
          quality: string
          rtt_ms: number | null
          user_id: string
        }
        Insert: {
          bitrate_kbps?: number | null
          call_id: string
          created_at?: string
          id?: string
          jitter_ms?: number | null
          metadata?: Json
          packets_lost?: number | null
          peer_id?: string | null
          quality?: string
          rtt_ms?: number | null
          user_id: string
        }
        Update: {
          bitrate_kbps?: number | null
          call_id?: string
          created_at?: string
          id?: string
          jitter_ms?: number | null
          metadata?: Json
          packets_lost?: number | null
          peer_id?: string | null
          quality?: string
          rtt_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_quality_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_quality_events_peer_id_fkey"
            columns: ["peer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_quality_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_quality_reports: {
        Row: {
          call_id: string
          created_at: string
          id: string
          jitter_ms: number
          packet_loss: number
          quality: string
          rtt_ms: number
          user_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          jitter_ms?: number
          packet_loss?: number
          quality?: string
          rtt_ms?: number
          user_id: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          jitter_ms?: number
          packet_loss?: number
          quality?: string
          rtt_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_quality_reports_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_quality_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_room_members: {
        Row: {
          call_id: string
          connection_state: string
          joined_at: string
          left_at: string | null
          media_state: Json
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          call_id: string
          connection_state?: string
          joined_at?: string
          left_at?: string | null
          media_state?: Json
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          call_id?: string
          connection_state?: string
          joined_at?: string
          left_at?: string | null
          media_state?: Json
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_room_members_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_signals: {
        Row: {
          call_id: string
          created_at: string
          expires_at: string
          id: string
          payload: Json
          sender_id: string
          target_user_id: string | null
          type: string
        }
        Insert: {
          call_id: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          sender_id: string
          target_user_id?: string | null
          type: string
        }
        Update: {
          call_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          sender_id?: string
          target_user_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_signals_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_webrtc_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          product_variant_id: string | null
          quantity: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          product_variant_id?: string | null
          quantity?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          product_variant_id?: string | null
          quantity?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          name_en: string | null
          name_ru: string | null
          name_uz: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          name_en?: string | null
          name_ru?: string | null
          name_uz?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_en?: string | null
          name_ru?: string | null
          name_uz?: string | null
        }
        Relationships: []
      }
      channel_invite_links: {
        Row: {
          channel_id: string
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          uses_count: number
        }
        Insert: {
          channel_id: string
          code?: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          uses_count?: number
        }
        Update: {
          channel_id?: string
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_invite_links_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_join_requests: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_join_requests_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          created_at: string | null
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_post_views: {
        Row: {
          created_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_post_views_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          admin_permissions: Json
          allow_comments: boolean
          avatar_url: string | null
          channel_type: string
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          invite_code: string | null
          is_paid: boolean
          linked_group_id: string | null
          name: string
          owner_id: string
          posts_count: number
          subscriber_count: number
          subscription_price: number | null
          updated_at: string
          username: string | null
        }
        Insert: {
          admin_permissions?: Json
          allow_comments?: boolean
          avatar_url?: string | null
          channel_type?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string | null
          is_paid?: boolean
          linked_group_id?: string | null
          name: string
          owner_id: string
          posts_count?: number
          subscriber_count?: number
          subscription_price?: number | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          admin_permissions?: Json
          allow_comments?: boolean
          avatar_url?: string | null
          channel_type?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string | null
          is_paid?: boolean
          linked_group_id?: string | null
          name?: string
          owner_id?: string
          posts_count?: number
          subscriber_count?: number
          subscription_price?: number | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_linked_group_id_fkey"
            columns: ["linked_group_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_folders: {
        Row: {
          created_at: string
          exclude_conversation_ids: string[]
          id: string
          include_conversation_ids: string[]
          include_types: string[]
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exclude_conversation_ids?: string[]
          id?: string
          include_conversation_ids?: string[]
          include_types?: string[]
          position?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exclude_conversation_ids?: string[]
          id?: string
          include_conversation_ids?: string[]
          include_types?: string[]
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_folders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          created_at: string
          feeling: string | null
          id: string
          latitude: number
          longitude: number
          note: string | null
          photo_urls: string[] | null
          place_category: string | null
          place_id: string
          place_name: string
          tagged_users: string[] | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          feeling?: string | null
          id?: string
          latitude: number
          longitude: number
          note?: string | null
          photo_urls?: string[] | null
          place_category?: string | null
          place_id: string
          place_name: string
          tagged_users?: string[] | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          feeling?: string | null
          id?: string
          latitude?: number
          longitude?: number
          note?: string | null
          photo_urls?: string[] | null
          place_category?: string | null
          place_id?: string
          place_name?: string
          tagged_users?: string[] | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      circle_invitations: {
        Row: {
          circle_id: string
          created_at: string
          id: string
          invited_by_id: string
          invited_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          id?: string
          invited_by_id: string
          invited_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          id?: string
          invited_by_id?: string
          invited_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_invitations_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "family_circles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          likes_count: number | null
          parent_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_discovery_matches: {
        Row: {
          created_at: string
          last_seen_at: string
          matched_user_id: string
          owner_user_id: string
          source: string
        }
        Insert: {
          created_at?: string
          last_seen_at?: string
          matched_user_id: string
          owner_user_id: string
          source?: string
        }
        Update: {
          created_at?: string
          last_seen_at?: string
          matched_user_id?: string
          owner_user_id?: string
          source?: string
        }
        Relationships: []
      }
      contact_discovery_rate_events: {
        Row: {
          created_at: string
          id: number
          matched_count: number
          requested_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          matched_count?: number
          requested_count: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          matched_count?: number
          requested_count?: number
          user_id?: string
        }
        Relationships: []
      }
      content_hides: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_hides_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_hides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_admin_actions: {
        Row: {
          action: string
          actor_id: string
          conversation_id: string
          created_at: string
          details: Json
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          conversation_id: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          conversation_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_admin_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_admin_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_admin_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_admin_rights: {
        Row: {
          can_change_info: boolean
          can_delete_messages: boolean
          can_edit_messages: boolean
          can_invite_users: boolean
          can_manage_topics: boolean
          can_manage_video_chats: boolean
          can_pin_messages: boolean
          can_post_messages: boolean
          can_promote_members: boolean
          can_restrict_members: boolean
          conversation_id: string
          created_at: string
          custom_title: string | null
          id: string
          is_anonymous: boolean
          user_id: string
        }
        Insert: {
          can_change_info?: boolean
          can_delete_messages?: boolean
          can_edit_messages?: boolean
          can_invite_users?: boolean
          can_manage_topics?: boolean
          can_manage_video_chats?: boolean
          can_pin_messages?: boolean
          can_post_messages?: boolean
          can_promote_members?: boolean
          can_restrict_members?: boolean
          conversation_id: string
          created_at?: string
          custom_title?: string | null
          id?: string
          is_anonymous?: boolean
          user_id: string
        }
        Update: {
          can_change_info?: boolean
          can_delete_messages?: boolean
          can_edit_messages?: boolean
          can_invite_users?: boolean
          can_manage_topics?: boolean
          can_manage_video_chats?: boolean
          can_pin_messages?: boolean
          can_post_messages?: boolean
          can_promote_members?: boolean
          can_restrict_members?: boolean
          conversation_id?: string
          created_at?: string
          custom_title?: string | null
          id?: string
          is_anonymous?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_admin_rights_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_bans: {
        Row: {
          banned_by: string | null
          conversation_id: string
          created_at: string
          id: string
          is_banned: boolean
          reason: string | null
          restrictions: Json
          until_date: string | null
          user_id: string
        }
        Insert: {
          banned_by?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_banned?: boolean
          reason?: string | null
          restrictions?: Json
          until_date?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_banned?: boolean
          reason?: string | null
          restrictions?: Json
          until_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_bans_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_boosts: {
        Row: {
          conversation_id: string
          created_at: string
          expires_at: string | null
          id: string
          slots: number
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          slots?: number
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          slots?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_boosts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_invite_links: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_primary: boolean
          is_revoked: boolean
          member_limit: number | null
          requires_approval: boolean
          slug: string
          title: string | null
          used_count: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_primary?: boolean
          is_revoked?: boolean
          member_limit?: number | null
          requires_approval?: boolean
          slug: string
          title?: string | null
          used_count?: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_primary?: boolean
          is_revoked?: boolean
          member_limit?: number | null
          requires_approval?: boolean
          slug?: string
          title?: string | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_invite_links_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_join_requests: {
        Row: {
          bio: string | null
          conversation_id: string
          created_at: string
          id: string
          invite_link_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          invite_link_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          invite_link_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_join_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_join_requests_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "conversation_invite_links"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_notification_settings: {
        Row: {
          conversation_id: string
          mentions_only: boolean
          mute_forever: boolean
          muted_until: string | null
          preview_enabled: boolean
          sound: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          mentions_only?: boolean
          mute_forever?: boolean
          muted_until?: string | null
          preview_enabled?: boolean
          sound?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          mentions_only?: boolean
          mute_forever?: boolean
          muted_until?: string | null
          preview_enabled?: boolean
          sound?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notification_settings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          archive_on_new_message: boolean
          archived_at: string | null
          conversation_id: string
          folder_ids: string[]
          id: string
          is_archived: boolean | null
          is_muted: boolean | null
          is_pinned: boolean | null
          is_request: boolean
          joined_at: string | null
          last_read_at: string | null
          manually_unread: boolean
          mute_until: string | null
          pinned_order: number | null
          role: string | null
          updated_at: string
          user_id: string
          wallpaper_blur: number | null
          wallpaper_dim: number | null
          wallpaper_type: string | null
          wallpaper_updated_at: string | null
          wallpaper_value: string | null
        }
        Insert: {
          archive_on_new_message?: boolean
          archived_at?: string | null
          conversation_id: string
          folder_ids?: string[]
          id?: string
          is_archived?: boolean | null
          is_muted?: boolean | null
          is_pinned?: boolean | null
          is_request?: boolean
          joined_at?: string | null
          last_read_at?: string | null
          manually_unread?: boolean
          mute_until?: string | null
          pinned_order?: number | null
          role?: string | null
          updated_at?: string
          user_id: string
          wallpaper_blur?: number | null
          wallpaper_dim?: number | null
          wallpaper_type?: string | null
          wallpaper_updated_at?: string | null
          wallpaper_value?: string | null
        }
        Update: {
          archive_on_new_message?: boolean
          archived_at?: string | null
          conversation_id?: string
          folder_ids?: string[]
          id?: string
          is_archived?: boolean | null
          is_muted?: boolean | null
          is_pinned?: boolean | null
          is_request?: boolean
          joined_at?: string | null
          last_read_at?: string | null
          manually_unread?: boolean
          mute_until?: string | null
          pinned_order?: number | null
          role?: string | null
          updated_at?: string
          user_id?: string
          wallpaper_blur?: number | null
          wallpaper_dim?: number | null
          wallpaper_type?: string | null
          wallpaper_updated_at?: string | null
          wallpaper_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_restrictions: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string | null
          kind: string
          reason: string | null
          until_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by?: string | null
          kind: string
          reason?: string | null
          until_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          kind?: string
          reason?: string | null
          until_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_restrictions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_restrictions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_restrictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_topics: {
        Row: {
          color: string | null
          conversation_id: string
          created_at: string
          created_by: string | null
          icon_emoji: string | null
          id: string
          is_closed: boolean
          is_general: boolean
          is_pinned: boolean
          last_message_at: string | null
          title: string
        }
        Insert: {
          color?: string | null
          conversation_id: string
          created_at?: string
          created_by?: string | null
          icon_emoji?: string | null
          id?: string
          is_closed?: boolean
          is_general?: boolean
          is_pinned?: boolean
          last_message_at?: string | null
          title: string
        }
        Update: {
          color?: string | null
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          icon_emoji?: string | null
          id?: string
          is_closed?: boolean
          is_general?: boolean
          is_pinned?: boolean
          last_message_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_topics_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          admin_permissions: Json
          aggressive_anti_spam: boolean
          allowed_reactions: string[] | null
          anti_spam: boolean
          auto_delete_seconds: number
          avatar_url: string | null
          boost_level: number
          boosts_count: number
          created_at: string | null
          custom_emoji_pack: string | null
          description: string | null
          emoji_status: string | null
          hide_members: boolean
          id: string
          invite_code: string | null
          is_encrypted: boolean | null
          is_forum: boolean
          is_public: boolean | null
          join_by_request: boolean
          last_message_at: string | null
          linked_chat_id: string | null
          linked_group_id: string | null
          name: string | null
          owner_id: string | null
          permissions: Json
          profile_color: string | null
          reactions_mode: string
          restrict_saving_content: boolean
          sign_messages: boolean
          slow_mode_seconds: number
          stats_enabled: boolean
          subscriber_count: number | null
          subscribers_count: number | null
          theme: string | null
          type: string | null
          username: string | null
          wallpaper_url: string | null
        }
        Insert: {
          admin_permissions?: Json
          aggressive_anti_spam?: boolean
          allowed_reactions?: string[] | null
          anti_spam?: boolean
          auto_delete_seconds?: number
          avatar_url?: string | null
          boost_level?: number
          boosts_count?: number
          created_at?: string | null
          custom_emoji_pack?: string | null
          description?: string | null
          emoji_status?: string | null
          hide_members?: boolean
          id?: string
          invite_code?: string | null
          is_encrypted?: boolean | null
          is_forum?: boolean
          is_public?: boolean | null
          join_by_request?: boolean
          last_message_at?: string | null
          linked_chat_id?: string | null
          linked_group_id?: string | null
          name?: string | null
          owner_id?: string | null
          permissions?: Json
          profile_color?: string | null
          reactions_mode?: string
          restrict_saving_content?: boolean
          sign_messages?: boolean
          slow_mode_seconds?: number
          stats_enabled?: boolean
          subscriber_count?: number | null
          subscribers_count?: number | null
          theme?: string | null
          type?: string | null
          username?: string | null
          wallpaper_url?: string | null
        }
        Update: {
          admin_permissions?: Json
          aggressive_anti_spam?: boolean
          allowed_reactions?: string[] | null
          anti_spam?: boolean
          auto_delete_seconds?: number
          avatar_url?: string | null
          boost_level?: number
          boosts_count?: number
          created_at?: string | null
          custom_emoji_pack?: string | null
          description?: string | null
          emoji_status?: string | null
          hide_members?: boolean
          id?: string
          invite_code?: string | null
          is_encrypted?: boolean | null
          is_forum?: boolean
          is_public?: boolean | null
          join_by_request?: boolean
          last_message_at?: string | null
          linked_chat_id?: string | null
          linked_group_id?: string | null
          name?: string | null
          owner_id?: string | null
          permissions?: Json
          profile_color?: string | null
          reactions_mode?: string
          restrict_saving_content?: boolean
          sign_messages?: boolean
          slow_mode_seconds?: number
          stats_enabled?: boolean
          subscriber_count?: number | null
          subscribers_count?: number | null
          theme?: string | null
          type?: string | null
          username?: string | null
          wallpaper_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_linked_group_id_fkey"
            columns: ["linked_group_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crash_logs: {
        Row: {
          context: string | null
          created_at: string
          error: string
          id: string
          platform: string | null
          stack: string | null
          user_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          error: string
          id?: string
          platform?: string | null
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string
          error?: string
          id?: string
          platform?: string | null
          stack?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crash_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customs_declarations: {
        Row: {
          clearance_status: string
          created_at: string
          currency: string
          declared_value: number
          destination_country: string | null
          documents: Json
          duty_amount: number
          fees_amount: number
          hs_code: string | null
          id: string
          incoterm: string
          invoice_number: string | null
          items: Json
          notes: string | null
          origin_country: string | null
          payment_status: string
          shipment_id: string
          tax_amount: number
          updated_at: string
        }
        Insert: {
          clearance_status?: string
          created_at?: string
          currency?: string
          declared_value?: number
          destination_country?: string | null
          documents?: Json
          duty_amount?: number
          fees_amount?: number
          hs_code?: string | null
          id?: string
          incoterm?: string
          invoice_number?: string | null
          items?: Json
          notes?: string | null
          origin_country?: string | null
          payment_status?: string
          shipment_id: string
          tax_amount?: number
          updated_at?: string
        }
        Update: {
          clearance_status?: string
          created_at?: string
          currency?: string
          declared_value?: number
          destination_country?: string | null
          documents?: Json
          duty_amount?: number
          fees_amount?: number
          hs_code?: string | null
          id?: string
          incoterm?: string
          invoice_number?: string | null
          items?: Json
          notes?: string | null
          origin_country?: string | null
          payment_status?: string
          shipment_id?: string
          tax_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customs_declarations_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: true
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_routes: {
        Row: {
          created_at: string
          id: string
          places_visited: number | null
          route_date: string
          route_geometry: Json | null
          total_distance_km: number | null
          total_duration_minutes: number | null
          updated_at: string
          user_id: string
          visits_summary: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          places_visited?: number | null
          route_date: string
          route_geometry?: Json | null
          total_distance_km?: number | null
          total_duration_minutes?: number | null
          updated_at?: string
          user_id: string
          visits_summary?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          places_visited?: number | null
          route_date?: string
          route_geometry?: Json | null
          total_distance_km?: number | null
          total_duration_minutes?: number | null
          updated_at?: string
          user_id?: string
          visits_summary?: Json | null
        }
        Relationships: []
      }
      discovery_hidden_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      download_events: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          status: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          status?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          status?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          attachments: Json | null
          body: string | null
          cc_recipients: string | null
          created_at: string
          id: string
          scheduled_at: string | null
          subject: string | null
          to_recipients: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          body?: string | null
          cc_recipients?: string | null
          created_at?: string
          id?: string
          scheduled_at?: string | null
          subject?: string | null
          to_recipients?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          body?: string | null
          cc_recipients?: string | null
          created_at?: string
          id?: string
          scheduled_at?: string | null
          subject?: string | null
          to_recipients?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      emails: {
        Row: {
          ai_actions: Json | null
          ai_summary: string | null
          attachments: Json | null
          body: string
          cc_recipients: Json | null
          created_at: string
          folder: string | null
          from_avatar: string | null
          from_email: string
          from_name: string
          id: string
          is_read: boolean | null
          is_starred: boolean | null
          is_verified: boolean | null
          labels: string[] | null
          priority: string | null
          snippet: string | null
          subject: string
          thread_id: string | null
          timestamp: string
          to_recipients: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_actions?: Json | null
          ai_summary?: string | null
          attachments?: Json | null
          body: string
          cc_recipients?: Json | null
          created_at?: string
          folder?: string | null
          from_avatar?: string | null
          from_email: string
          from_name: string
          id?: string
          is_read?: boolean | null
          is_starred?: boolean | null
          is_verified?: boolean | null
          labels?: string[] | null
          priority?: string | null
          snippet?: string | null
          subject: string
          thread_id?: string | null
          timestamp?: string
          to_recipients?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_actions?: Json | null
          ai_summary?: string | null
          attachments?: Json | null
          body?: string
          cc_recipients?: Json | null
          created_at?: string
          folder?: string | null
          from_avatar?: string | null
          from_email?: string
          from_name?: string
          id?: string
          is_read?: boolean | null
          is_starred?: boolean | null
          is_verified?: boolean | null
          labels?: string[] | null
          priority?: string | null
          snippet?: string | null
          subject?: string
          thread_id?: string | null
          timestamp?: string
          to_recipients?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      enforcement_actions: {
        Row: {
          action_type: string
          approved_at: string | null
          case_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          executed_at: string | null
          executed_by: string | null
          execution_result: Json
          failure_reason: string | null
          id: string
          metadata: Json
          policy_code: string | null
          required_approvals: number
          starts_at: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          executed_at?: string | null
          executed_by?: string | null
          execution_result?: Json
          failure_reason?: string | null
          id?: string
          metadata?: Json
          policy_code?: string | null
          required_approvals?: number
          starts_at?: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          executed_at?: string | null
          executed_by?: string | null
          execution_result?: Json
          failure_reason?: string | null
          id?: string
          metadata?: Json
          policy_code?: string | null
          required_approvals?: number
          starts_at?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "enforcement_actions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_actions_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_actions_policy_code_fkey"
            columns: ["policy_code"]
            isOneToOne: false
            referencedRelation: "moderation_policies"
            referencedColumns: ["code"]
          },
        ]
      }
      enforcement_approvals: {
        Row: {
          approver_id: string
          created_at: string
          decision: string
          enforcement_action_id: string
          id: string
          note: string
        }
        Insert: {
          approver_id: string
          created_at?: string
          decision: string
          enforcement_action_id: string
          id?: string
          note: string
        }
        Update: {
          approver_id?: string
          created_at?: string
          decision?: string
          enforcement_action_id?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "enforcement_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_approvals_enforcement_action_id_fkey"
            columns: ["enforcement_action_id"]
            isOneToOne: false
            referencedRelation: "enforcement_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      enforcement_execution_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          enforcement_action_id: string
          event_type: string
          id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          enforcement_action_id: string
          event_type: string
          id?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          enforcement_action_id?: string
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enforcement_execution_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_execution_events_enforcement_action_id_fkey"
            columns: ["enforcement_action_id"]
            isOneToOne: false
            referencedRelation: "enforcement_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_holds: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          order_id: string
          refunded_at: string | null
          release_at: string | null
          released_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          order_id: string
          refunded_at?: string | null
          release_at?: string | null
          released_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          order_id?: string
          refunded_at?: string | null
          release_at?: string | null
          released_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_holds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_circles: {
        Row: {
          admin_ids: string[]
          created_at: string
          creator_id: string
          description: string | null
          id: string
          member_ids: string[]
          name: string
          settings: Json
          updated_at: string
        }
        Insert: {
          admin_ids?: string[]
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          member_ids?: string[]
          name: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          admin_ids?: string[]
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          member_ids?: string[]
          name?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          min_version: string | null
          platforms: string[]
          rollout_percentage: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          min_version?: string | null
          platforms?: string[]
          rollout_percentage?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          min_version?: string | null
          platforms?: string[]
          rollout_percentage?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      frequent_places: {
        Row: {
          address: string | null
          average_stay_minutes: number | null
          confidence_score: number | null
          created_at: string
          id: string
          is_auto_detected: boolean | null
          last_visited_at: string | null
          latitude: number
          longitude: number
          name: string
          place_type: string
          updated_at: string
          user_id: string
          visit_count: number | null
        }
        Insert: {
          address?: string | null
          average_stay_minutes?: number | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          is_auto_detected?: boolean | null
          last_visited_at?: string | null
          latitude: number
          longitude: number
          name: string
          place_type?: string
          updated_at?: string
          user_id: string
          visit_count?: number | null
        }
        Update: {
          address?: string | null
          average_stay_minutes?: number | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          is_auto_detected?: boolean | null
          last_visited_at?: string | null
          latitude?: number
          longitude?: number
          name?: string
          place_type?: string
          updated_at?: string
          user_id?: string
          visit_count?: number | null
        }
        Relationships: []
      }
      function_usage: {
        Row: {
          created_at: string
          function_name: string
          id: string
          ip_hash: string | null
          metadata: Json
          mode: string
          outcome: string
          reason: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          mode?: string
          outcome?: string
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          mode?: string
          outcome?: string
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      hashtags: {
        Row: {
          created_at: string
          id: string
          last_used_at: string
          post_count: number | null
          posts_count: number
          tag: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string
          post_count?: number | null
          posts_count?: number
          tag: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string
          post_count?: number | null
          posts_count?: number
          tag?: string
        }
        Relationships: []
      }
      hidden_posts: {
        Row: {
          hidden_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          hidden_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          hidden_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_accounts: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          identity_id: string
          is_primary: boolean
          last_used_at: string | null
          login_email: string
          slot_no: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          identity_id: string
          is_primary?: boolean
          last_used_at?: string | null
          login_email: string
          slot_no: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          identity_id?: string
          is_primary?: boolean
          last_used_at?: string | null
          login_email?: string
          slot_no?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_accounts_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "auth_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_alerts: {
        Row: {
          alert_type: string
          created_at: string
          current_quantity: number
          id: string
          is_resolved: boolean | null
          product_id: string
          resolved_at: string | null
          seller_id: string
          threshold: number | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          current_quantity: number
          id?: string
          is_resolved?: boolean | null
          product_id: string
          resolved_at?: string | null
          seller_id: string
          threshold?: number | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          current_quantity?: number
          id?: string
          is_resolved?: boolean | null
          product_id?: string
          resolved_at?: string | null
          seller_id?: string
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_alerts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_analytics"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "inventory_alerts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_accounts: {
        Row: {
          app_restrictions: boolean
          child_age: number
          child_first_name: string
          child_last_name: string
          child_username: string
          content_filter_level: string
          created_at: string
          device_name: string | null
          device_type: string | null
          id: string
          location_sharing: boolean
          parent_approval_required: boolean
          parent_id: string
          screen_time_limit: number
          sleep_mode_enabled: boolean
          sleep_mode_end: string | null
          sleep_mode_start: string | null
          updated_at: string
        }
        Insert: {
          app_restrictions?: boolean
          child_age: number
          child_first_name: string
          child_last_name: string
          child_username: string
          content_filter_level?: string
          created_at?: string
          device_name?: string | null
          device_type?: string | null
          id?: string
          location_sharing?: boolean
          parent_approval_required?: boolean
          parent_id: string
          screen_time_limit?: number
          sleep_mode_enabled?: boolean
          sleep_mode_end?: string | null
          sleep_mode_start?: string | null
          updated_at?: string
        }
        Update: {
          app_restrictions?: boolean
          child_age?: number
          child_first_name?: string
          child_last_name?: string
          child_username?: string
          content_filter_level?: string
          created_at?: string
          device_name?: string | null
          device_type?: string | null
          id?: string
          location_sharing?: boolean
          parent_approval_required?: boolean
          parent_id?: string
          screen_time_limit?: number
          sleep_mode_enabled?: boolean
          sleep_mode_end?: string | null
          sleep_mode_start?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      legacy_emails: {
        Row: {
          created_at: string
          id: string
          identity_id: string | null
          is_recovery: boolean
          migrated_at: string | null
          old_email: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identity_id?: string | null
          is_recovery?: boolean
          migrated_at?: string | null
          old_email: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identity_id?: string | null
          is_recovery?: boolean
          migrated_at?: string | null
          old_email?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_emails_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "auth_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      link_previews: {
        Row: {
          description: string | null
          image_url: string | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          description?: string | null
          image_url?: string | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          description?: string | null
          image_url?: string | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      live_location_updates: {
        Row: {
          accuracy: number | null
          battery_level: number | null
          created_at: string
          heading: number | null
          id: string
          latitude: number
          live_location_id: string
          longitude: number
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          battery_level?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          latitude: number
          live_location_id: string
          longitude: number
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          battery_level?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          latitude?: number
          live_location_id?: string
          longitude?: number
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_location_updates_live_location_id_fkey"
            columns: ["live_location_id"]
            isOneToOne: false
            referencedRelation: "message_live_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          is_pinned: boolean | null
          stream_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          stream_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          stream_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_comments_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_stream_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_moderation_actions: {
        Row: {
          action_type: string
          created_at: string
          expires_at: string | null
          id: string
          moderator_id: string
          reason: string | null
          stream_id: string
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          expires_at?: string | null
          id?: string
          moderator_id: string
          reason?: string | null
          stream_id: string
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          moderator_id?: string
          reason?: string | null
          stream_id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_moderation_actions_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_stream_moderation_actions_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_stream_moderation_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          stream_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          stream_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          stream_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_reactions_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_stream_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          status: string
          stream_id: string
          target_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          status?: string
          stream_id: string
          target_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          stream_id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_stream_reports_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_stream_reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_viewers: {
        Row: {
          id: string
          joined_at: string
          last_seen_at: string
          left_at: string | null
          stream_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          stream_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          stream_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_viewers_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_stream_viewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_streams: {
        Row: {
          created_at: string
          description: string | null
          ended_at: string | null
          id: string
          peak_viewers: number | null
          started_at: string
          status: string
          thumbnail_url: string | null
          title: string | null
          user_id: string
          viewer_count: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id?: string
          peak_viewers?: number | null
          started_at?: string
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          user_id: string
          viewer_count?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id?: string
          peak_viewers?: number | null
          started_at?: string
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          user_id?: string
          viewer_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_streams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_trips: {
        Row: {
          created_at: string
          current_location: string | null
          destination: string
          estimated_arrival: string | null
          id: string
          is_active: boolean | null
          origin: string
          planned_route: Json | null
          progress: number | null
          shared_with: string[] | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_location?: string | null
          destination: string
          estimated_arrival?: string | null
          id?: string
          is_active?: boolean | null
          origin: string
          planned_route?: Json | null
          progress?: number | null
          shared_with?: string[] | null
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_location?: string | null
          destination?: string
          estimated_arrival?: string | null
          id?: string
          is_active?: boolean | null
          origin?: string
          planned_route?: Json | null
          progress?: number | null
          shared_with?: string[] | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      location_history: {
        Row: {
          accuracy: number | null
          created_at: string
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      location_share_tokens: {
        Row: {
          allowed_users: string[] | null
          created_at: string
          expires_at: string
          id: string
          is_active: boolean | null
          user_id: string
        }
        Insert: {
          allowed_users?: string[] | null
          created_at?: string
          expires_at: string
          id?: string
          is_active?: boolean | null
          user_id: string
        }
        Update: {
          allowed_users?: string[] | null
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      mailbox_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          is_primary: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailbox_aliases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      map_incidents: {
        Row: {
          created_at: string
          description: string | null
          downvotes: number | null
          expires_at: string | null
          id: string
          kind: string
          latitude: number
          longitude: number
          photo_url: string | null
          reporter_id: string
          severity: string | null
          updated_at: string
          upvotes: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          downvotes?: number | null
          expires_at?: string | null
          id?: string
          kind: string
          latitude: number
          longitude: number
          photo_url?: string | null
          reporter_id: string
          severity?: string | null
          updated_at?: string
          upvotes?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          downvotes?: number | null
          expires_at?: string | null
          id?: string
          kind?: string
          latitude?: number
          longitude?: number
          photo_url?: string | null
          reporter_id?: string
          severity?: string | null
          updated_at?: string
          upvotes?: number | null
        }
        Relationships: []
      }
      map_pois: {
        Row: {
          address: string | null
          category: string
          created_at: string
          id: string
          latitude: number
          longitude: number
          name: string | null
          opening_hours: string | null
          osm_id: string
          osm_type: string
          phone: string | null
          tags: Json | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          category: string
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          name?: string | null
          opening_hours?: string | null
          osm_id: string
          osm_type: string
          phone?: string | null
          tags?: Json | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string | null
          opening_hours?: string | null
          osm_id?: string
          osm_type?: string
          phone?: string | null
          tags?: Json | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      marketplace_carriers: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          modes: string[]
          name: string
          tracking_url_template: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          modes?: string[]
          name: string
          tracking_url_template?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          modes?: string[]
          name?: string
          tracking_url_template?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          data: Json | null
          id: string
          is_read: boolean | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_order_events: {
        Row: {
          actor_id: string | null
          actor_role: string
          created_at: string
          from_status: string | null
          id: string
          order_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          created_at?: string
          from_status?: string | null
          id?: string
          order_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          from_status?: string | null
          id?: string
          order_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_payments: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string
          currency: string
          direction: string
          id: string
          metadata: Json
          method: string
          order_id: string | null
          receipt_number: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string
          currency?: string
          direction: string
          id?: string
          metadata?: Json
          method: string
          order_id?: string | null
          receipt_number?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string
          currency?: string
          direction?: string
          id?: string
          metadata?: Json
          method?: string
          order_id?: string | null
          receipt_number?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      marketplace_shipping_quotes: {
        Row: {
          billable_weight_kg: number
          cart_value: number
          checkout_total: number
          created_at: string
          currency: string
          customs_handling: number
          destination_country_code: string
          estimate_only: boolean
          estimated_duty: number
          estimated_import_charges: number
          estimated_landed_total: number
          estimated_vat: number
          eta_days_max: number
          eta_days_min: number
          expires_at: string
          id: string
          incoterm: string
          metadata_complete: boolean
          origin_country_code: string
          seller_id: string
          service_level: string
          shipping_charge: number
          transport_mode: string
          user_id: string
          warnings: Json
        }
        Insert: {
          billable_weight_kg?: number
          cart_value?: number
          checkout_total?: number
          created_at?: string
          currency?: string
          customs_handling?: number
          destination_country_code: string
          estimate_only?: boolean
          estimated_duty?: number
          estimated_import_charges?: number
          estimated_landed_total?: number
          estimated_vat?: number
          eta_days_max: number
          eta_days_min: number
          expires_at?: string
          id?: string
          incoterm: string
          metadata_complete?: boolean
          origin_country_code: string
          seller_id: string
          service_level: string
          shipping_charge?: number
          transport_mode: string
          user_id: string
          warnings?: Json
        }
        Update: {
          billable_weight_kg?: number
          cart_value?: number
          checkout_total?: number
          created_at?: string
          currency?: string
          customs_handling?: number
          destination_country_code?: string
          estimate_only?: boolean
          estimated_duty?: number
          estimated_import_charges?: number
          estimated_landed_total?: number
          estimated_vat?: number
          eta_days_max?: number
          eta_days_min?: number
          expires_at?: string
          id?: string
          incoterm?: string
          metadata_complete?: boolean
          origin_country_code?: string
          seller_id?: string
          service_level?: string
          shipping_charge?: number
          transport_mode?: string
          user_id?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_shipping_quotes_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_analytics"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "marketplace_shipping_quotes_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_video_products: {
        Row: {
          created_at: string
          position: number
          post_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          position?: number
          post_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          position?: number
          post_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_video_products_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_video_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "marketplace_video_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      media_thumbnail_cache: {
        Row: {
          created_at: string
          duration_ms: number | null
          generated_by: string | null
          height: number | null
          media_type: string
          media_url: string
          thumbnail_url: string
          updated_at: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          generated_by?: string | null
          height?: number | null
          media_type: string
          media_url: string
          thumbnail_url: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          generated_by?: string | null
          height?: number | null
          media_type?: string
          media_url?: string
          thumbnail_url?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_thumbnail_cache_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meet_here_invitations: {
        Row: {
          accepted_users: string[]
          created_at: string
          creator_id: string
          declined_users: string[]
          id: string
          invited_users: string[]
          latitude: number
          longitude: number
          meeting_time: string | null
          message: string | null
          place_id: string
          place_name: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_users?: string[]
          created_at?: string
          creator_id: string
          declined_users?: string[]
          id?: string
          invited_users?: string[]
          latitude: number
          longitude: number
          meeting_time?: string | null
          message?: string | null
          place_id: string
          place_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_users?: string[]
          created_at?: string
          creator_id?: string
          declined_users?: string[]
          id?: string
          invited_users?: string[]
          latitude?: number
          longitude?: number
          meeting_time?: string | null
          message?: string | null
          place_id?: string
          place_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_deletions: {
        Row: {
          deleted_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          deleted_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          deleted_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_deletions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deletions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_delivery_receipts: {
        Row: {
          delivered_at: string
          message_id: string
          user_id: string
        }
        Insert: {
          delivered_at?: string
          message_id: string
          user_id: string
        }
        Update: {
          delivered_at?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_delivery_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_delivery_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_drafts: {
        Row: {
          content: string
          conversation_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_drafts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_edit_history: {
        Row: {
          conversation_id: string
          edited_at: string
          editor_id: string
          id: string
          message_id: string
          new_content: string | null
          previous_content: string | null
        }
        Insert: {
          conversation_id: string
          edited_at?: string
          editor_id: string
          id?: string
          message_id: string
          new_content?: string | null
          previous_content?: string | null
        }
        Update: {
          conversation_id?: string
          edited_at?: string
          editor_id?: string
          id?: string
          message_id?: string
          new_content?: string | null
          previous_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_edit_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_edit_history_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_edit_history_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_hashtags: {
        Row: {
          conversation_id: string
          created_at: string
          message_id: string
          tag: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          message_id: string
          tag: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          message_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_hashtags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_hashtags_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_live_locations: {
        Row: {
          conversation_id: string
          created_at: string
          current_latitude: number
          current_longitude: number
          destination_latitude: number | null
          destination_longitude: number | null
          destination_name: string | null
          expires_at: string
          id: string
          is_active: boolean
          last_updated: string
          message_id: string
          sender_id: string
          update_interval_seconds: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          current_latitude: number
          current_longitude: number
          destination_latitude?: number | null
          destination_longitude?: number | null
          destination_name?: string | null
          expires_at: string
          id?: string
          is_active?: boolean
          last_updated?: string
          message_id: string
          sender_id: string
          update_interval_seconds?: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          current_latitude?: number
          current_longitude?: number
          destination_latitude?: number | null
          destination_longitude?: number | null
          destination_name?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          last_updated?: string
          message_id?: string
          sender_id?: string
          update_interval_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_live_locations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_live_locations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_media_items: {
        Row: {
          album_id: string | null
          created_at: string
          duration_ms: number | null
          file_name: string | null
          height: number | null
          id: string
          media_type: string
          message_id: string
          position: number
          size_bytes: number | null
          thumbnail_url: string | null
          url: string
          user_id: string
          width: number | null
        }
        Insert: {
          album_id?: string | null
          created_at?: string
          duration_ms?: number | null
          file_name?: string | null
          height?: number | null
          id?: string
          media_type: string
          message_id: string
          position?: number
          size_bytes?: number | null
          thumbnail_url?: string | null
          url: string
          user_id: string
          width?: number | null
        }
        Update: {
          album_id?: string | null
          created_at?: string
          duration_ms?: number | null
          file_name?: string | null
          height?: number | null
          id?: string
          media_type?: string
          message_id?: string
          position?: number
          size_bytes?: number | null
          thumbnail_url?: string | null
          url?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_media_items_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_media_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_poll_votes: {
        Row: {
          message_id: string
          option_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          option_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          option_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_poll_votes_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_polls: {
        Row: {
          allows_multiple: boolean
          closes_at: string | null
          created_at: string
          created_by: string
          is_anonymous: boolean
          message_id: string
          options: Json
          question: string
          updated_at: string
        }
        Insert: {
          allows_multiple?: boolean
          closes_at?: string | null
          created_at?: string
          created_by: string
          is_anonymous?: boolean
          message_id: string
          options?: Json
          question: string
          updated_at?: string
        }
        Update: {
          allows_multiple?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string
          is_anonymous?: boolean
          message_id?: string
          options?: Json
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_polls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          conversation_id: string | null
          created_at: string
          details: string | null
          id: string
          message_id: string | null
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_conversation_id: string | null
          target_message_id: string | null
          target_user_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string | null
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_conversation_id?: string | null
          target_message_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string | null
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_conversation_id?: string | null
          target_message_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_target_conversation_id_fkey"
            columns: ["target_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_target_message_id_fkey"
            columns: ["target_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_transcriptions: {
        Row: {
          audio_url: string | null
          created_at: string
          id: string
          language: string | null
          message_id: string
          text: string
          user_id: string | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          id?: string
          language?: string | null
          message_id: string
          text: string
          user_id?: string | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          id?: string
          language?: string | null
          message_id?: string
          text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_transcriptions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_transcriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_translations: {
        Row: {
          created_at: string
          id: string
          message_id: string
          source_text: string | null
          target_language: string
          translated_text: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          source_text?: string | null
          target_language: string
          translated_text: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          source_text?: string | null
          target_language?: string
          translated_text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_translations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_translations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_signature: string | null
          auto_delete_at: string | null
          call_id: string | null
          client_message_id: string | null
          comment_count: number
          content: string | null
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          duration_ms: number | null
          edited_at: string | null
          effect_id: string | null
          forwarded_from_message_id: string | null
          forwarded_from_name: string | null
          forwards_count: number
          height: number | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          is_silent: boolean
          live_location_expires_at: string | null
          live_location_stopped_at: string | null
          location_payload: Json | null
          media_file_name: string | null
          media_path: string | null
          media_size_bytes: number | null
          media_type: string | null
          media_url: string | null
          metadata: Json
          mime_type: string | null
          original_content: string | null
          original_post_id: string | null
          reply_to_id: string | null
          sender_id: string | null
          shared_post_id: string | null
          size_bytes: number | null
          story_id: string | null
          thumb_path: string | null
          topic_id: string | null
          updated_at: string | null
          view_count: number
          views_count: number
          waveform: Json | null
          width: number | null
        }
        Insert: {
          author_signature?: string | null
          auto_delete_at?: string | null
          call_id?: string | null
          client_message_id?: string | null
          comment_count?: number
          content?: string | null
          conversation_id: string
          created_at?: string | null
          deleted_at?: string | null
          duration_ms?: number | null
          edited_at?: string | null
          effect_id?: string | null
          forwarded_from_message_id?: string | null
          forwarded_from_name?: string | null
          forwards_count?: number
          height?: number | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          is_silent?: boolean
          live_location_expires_at?: string | null
          live_location_stopped_at?: string | null
          location_payload?: Json | null
          media_file_name?: string | null
          media_path?: string | null
          media_size_bytes?: number | null
          media_type?: string | null
          media_url?: string | null
          metadata?: Json
          mime_type?: string | null
          original_content?: string | null
          original_post_id?: string | null
          reply_to_id?: string | null
          sender_id?: string | null
          shared_post_id?: string | null
          size_bytes?: number | null
          story_id?: string | null
          thumb_path?: string | null
          topic_id?: string | null
          updated_at?: string | null
          view_count?: number
          views_count?: number
          waveform?: Json | null
          width?: number | null
        }
        Update: {
          author_signature?: string | null
          auto_delete_at?: string | null
          call_id?: string | null
          client_message_id?: string | null
          comment_count?: number
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          deleted_at?: string | null
          duration_ms?: number | null
          edited_at?: string | null
          effect_id?: string | null
          forwarded_from_message_id?: string | null
          forwarded_from_name?: string | null
          forwards_count?: number
          height?: number | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          is_silent?: boolean
          live_location_expires_at?: string | null
          live_location_stopped_at?: string | null
          location_payload?: Json | null
          media_file_name?: string | null
          media_path?: string | null
          media_size_bytes?: number | null
          media_type?: string | null
          media_url?: string | null
          metadata?: Json
          mime_type?: string | null
          original_content?: string | null
          original_post_id?: string | null
          reply_to_id?: string | null
          sender_id?: string | null
          shared_post_id?: string | null
          size_bytes?: number | null
          story_id?: string | null
          thumb_path?: string | null
          topic_id?: string | null
          updated_at?: string | null
          view_count?: number
          views_count?: number
          waveform?: Json | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_original_post_id_fkey"
            columns: ["original_post_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "conversation_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_categories: {
        Row: {
          icon: string | null
          id: string
          is_active: boolean
          labels: Json
          sort_order: number
        }
        Insert: {
          icon?: string | null
          id: string
          is_active?: boolean
          labels?: Json
          sort_order?: number
        }
        Update: {
          icon?: string | null
          id?: string
          is_active?: boolean
          labels?: Json
          sort_order?: number
        }
        Relationships: []
      }
      mini_app_credentials: {
        Row: {
          app_id: string
          client_id: string
          created_at: string
          created_by: string | null
          environment: string
          id: string
          is_active: boolean
          label: string | null
          last_used_at: string | null
          requests_total: number
          revoked_at: string | null
          scopes: Json
          secret_hash: string
          secret_prefix: string
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          app_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
          requests_total?: number
          revoked_at?: string | null
          scopes?: Json
          secret_hash: string
          secret_prefix: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          app_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
          requests_total?: number
          revoked_at?: string | null
          scopes?: Json
          secret_hash?: string
          secret_prefix?: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_credentials_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_events: {
        Row: {
          app_id: string
          created_at: string
          duration_ms: number | null
          error_code: string | null
          event: string
          id: number
          platform: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          app_id: string
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          event: string
          id?: number
          platform?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          app_id?: string
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          event?: string
          id?: number
          platform?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_events_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_installs: {
        Row: {
          app_id: string
          created_at: string
          last_opened_at: string | null
          open_count: number
          pinned: boolean
          user_id: string
        }
        Insert: {
          app_id: string
          created_at?: string
          last_opened_at?: string | null
          open_count?: number
          pinned?: boolean
          user_id: string
        }
        Update: {
          app_id?: string
          created_at?: string
          last_opened_at?: string | null
          open_count?: number
          pinned?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_installs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_notifications: {
        Row: {
          action_url: string | null
          app_id: string
          body: string | null
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          app_id: string
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          app_id?: string
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_notifications_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_payment_intents: {
        Row: {
          amount: number
          app_id: string
          cancelled_at: string | null
          created_at: string
          currency: string
          description: string | null
          expires_at: string
          failure_code: string | null
          id: string
          idempotency_key: string | null
          merchant_user_id: string
          paid_at: string | null
          payer_user_id: string
          status: string
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          app_id: string
          cancelled_at?: string | null
          created_at?: string
          currency: string
          description?: string | null
          expires_at?: string
          failure_code?: string | null
          id?: string
          idempotency_key?: string | null
          merchant_user_id: string
          paid_at?: string | null
          payer_user_id: string
          status?: string
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          app_id?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          expires_at?: string
          failure_code?: string | null
          id?: string
          idempotency_key?: string | null
          merchant_user_id?: string
          paid_at?: string | null
          payer_user_id?: string
          status?: string
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_payment_intents_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_payments: {
        Row: {
          amount: number
          app_id: string
          created_at: string
          currency: string
          description: string | null
          external_id: string | null
          id: string
          payload: Json
          provider: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          app_id: string
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          provider?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          app_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          provider?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_payments_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_reports: {
        Row: {
          app_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string | null
          status: string
        }
        Insert: {
          app_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          status?: string
        }
        Update: {
          app_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_reports_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_reviews: {
        Row: {
          app_id: string
          comment: string | null
          created_at: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          app_id: string
          comment?: string | null
          created_at?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          app_id?: string
          comment?: string | null
          created_at?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_reviews_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_sdk_sessions: {
        Row: {
          app_id: string
          consumed_at: string | null
          expires_at: string
          id: string
          issued_at: string
          nonce: string
          platform: string
          user_id: string
        }
        Insert: {
          app_id: string
          consumed_at?: string | null
          expires_at: string
          id?: string
          issued_at?: string
          nonce: string
          platform?: string
          user_id: string
        }
        Update: {
          app_id?: string
          consumed_at?: string | null
          expires_at?: string
          id?: string
          issued_at?: string
          nonce?: string
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_sdk_sessions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_stats_cache: {
        Row: {
          app_id: string
          avg_rating: number
          errors_30d: number
          installs: number
          opens_30d: number
          opens_7d: number
          rating_count: number
          refreshed_at: string
          users_30d: number
        }
        Insert: {
          app_id: string
          avg_rating?: number
          errors_30d?: number
          installs?: number
          opens_30d?: number
          opens_7d?: number
          rating_count?: number
          refreshed_at?: string
          users_30d?: number
        }
        Update: {
          app_id?: string
          avg_rating?: number
          errors_30d?: number
          installs?: number
          opens_30d?: number
          opens_7d?: number
          rating_count?: number
          refreshed_at?: string
          users_30d?: number
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_stats_cache_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: true
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_updates: {
        Row: {
          app_id: string
          consumed_at: string | null
          created_at: string
          id: number
          payload: Json
          update_type: string
          user_id: string | null
        }
        Insert: {
          app_id: string
          consumed_at?: string | null
          created_at?: string
          id?: number
          payload?: Json
          update_type: string
          user_id?: string | null
        }
        Update: {
          app_id?: string
          consumed_at?: string | null
          created_at?: string
          id?: number
          payload?: Json
          update_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_updates_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_versions: {
        Row: {
          app_id: string
          id: string
          manifest: Json
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          version: number
        }
        Insert: {
          app_id: string
          id?: string
          manifest: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          version: number
        }
        Update: {
          app_id?: string
          id?: string
          manifest?: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_versions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_apps: {
        Row: {
          age_rating: number
          app_type: string
          bot_id: string | null
          category: string
          countries: string[] | null
          created_at: string
          deep_link: string | null
          description: string | null
          display_mode: string
          frame_blocked: boolean
          frame_check_error: string | null
          frame_checked_at: string | null
          handle: string | null
          icon_url: string | null
          id: string
          is_approved: boolean
          is_pinned: boolean
          locales: string[]
          name: string
          permissions: Json
          pin_priority: number | null
          price_model: string
          privacy_url: string | null
          published_at: string | null
          publisher_id: string | null
          rating: number
          rejected_reason: string | null
          screenshots: Json
          short_description: string | null
          status: string
          support_url: string | null
          terms_url: string | null
          updated_at: string
          url: string
          user_id: string
          users_count: number
        }
        Insert: {
          age_rating?: number
          app_type?: string
          bot_id?: string | null
          category?: string
          countries?: string[] | null
          created_at?: string
          deep_link?: string | null
          description?: string | null
          display_mode?: string
          frame_blocked?: boolean
          frame_check_error?: string | null
          frame_checked_at?: string | null
          handle?: string | null
          icon_url?: string | null
          id?: string
          is_approved?: boolean
          is_pinned?: boolean
          locales?: string[]
          name: string
          permissions?: Json
          pin_priority?: number | null
          price_model?: string
          privacy_url?: string | null
          published_at?: string | null
          publisher_id?: string | null
          rating?: number
          rejected_reason?: string | null
          screenshots?: Json
          short_description?: string | null
          status?: string
          support_url?: string | null
          terms_url?: string | null
          updated_at?: string
          url: string
          user_id: string
          users_count?: number
        }
        Update: {
          age_rating?: number
          app_type?: string
          bot_id?: string | null
          category?: string
          countries?: string[] | null
          created_at?: string
          deep_link?: string | null
          description?: string | null
          display_mode?: string
          frame_blocked?: boolean
          frame_check_error?: string | null
          frame_checked_at?: string | null
          handle?: string | null
          icon_url?: string | null
          id?: string
          is_approved?: boolean
          is_pinned?: boolean
          locales?: string[]
          name?: string
          permissions?: Json
          pin_priority?: number | null
          price_model?: string
          privacy_url?: string | null
          published_at?: string | null
          publisher_id?: string | null
          rating?: number
          rejected_reason?: string | null
          screenshots?: Json
          short_description?: string | null
          status?: string
          support_url?: string | null
          terms_url?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          users_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "mini_apps_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mini_apps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_case_reports: {
        Row: {
          case_id: string
          linked_at: string
          linked_by: string | null
          report_id: string
        }
        Insert: {
          case_id: string
          linked_at?: string
          linked_by?: string | null
          report_id: string
        }
        Update: {
          case_id?: string
          linked_at?: string
          linked_by?: string | null
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_case_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_case_reports_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_case_reports_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_cases: {
        Row: {
          assigned_admin_id: string | null
          assigned_team: string
          case_number: number
          case_type: string
          due_at: string | null
          id: string
          metadata: Json
          opened_at: string
          opened_by: string | null
          policy_code: string | null
          priority: string
          resolved_at: string | null
          severity: string
          status: string
          subject_id: string
          subject_type: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          assigned_team?: string
          case_number?: never
          case_type?: string
          due_at?: string | null
          id?: string
          metadata?: Json
          opened_at?: string
          opened_by?: string | null
          policy_code?: string | null
          priority?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          subject_id: string
          subject_type: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          assigned_team?: string
          case_number?: never
          case_type?: string
          due_at?: string | null
          id?: string
          metadata?: Json
          opened_at?: string
          opened_by?: string | null
          policy_code?: string | null
          priority?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          subject_id?: string
          subject_type?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_cases_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_cases_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_decisions: {
        Row: {
          case_id: string
          created_at: string
          decided_by: string | null
          decision: string
          id: string
          metadata: Json
          policy_code: string | null
          rationale: string
        }
        Insert: {
          case_id: string
          created_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          metadata?: Json
          policy_code?: string | null
          rationale: string
        }
        Update: {
          case_id?: string
          created_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          metadata?: Json
          policy_code?: string | null
          rationale?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_evidence: {
        Row: {
          captured_at: string
          captured_by: string | null
          case_id: string
          evidence_type: string
          id: string
          media_reference: string | null
          metadata: Json
          object_id: string
          object_type: string
          snapshot_json: Json
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          case_id: string
          evidence_type?: string
          id?: string
          media_reference?: string | null
          metadata?: Json
          object_id: string
          object_type: string
          snapshot_json?: Json
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          case_id?: string
          evidence_type?: string
          id?: string
          media_reference?: string | null
          metadata?: Json
          object_id?: string
          object_type?: string
          snapshot_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "moderation_evidence_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_policies: {
        Row: {
          active: boolean
          allowed_target_types: string[]
          category: string
          code: string
          created_at: string
          default_action: string | null
          default_duration_hours: number | null
          description: string
          execution_mode: string
          required_approvals: number
          requires_independent_approval: boolean
          severity_default: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          allowed_target_types?: string[]
          category: string
          code: string
          created_at?: string
          default_action?: string | null
          default_duration_hours?: number | null
          description?: string
          execution_mode?: string
          required_approvals?: number
          requires_independent_approval?: boolean
          severity_default?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          allowed_target_types?: string[]
          category?: string
          code?: string
          created_at?: string
          default_action?: string | null
          default_duration_hours?: number | null
          description?: string
          execution_mode?: string
          required_approvals?: number
          requires_independent_approval?: boolean
          severity_default?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      music_ingest_runs: {
        Row: {
          error_message: string | null
          fetched_count: number
          finished_at: string | null
          id: string
          inserted_count: number
          skipped_count: number
          source: Database["public"]["Enums"]["music_source"]
          started_at: string
        }
        Insert: {
          error_message?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          inserted_count?: number
          skipped_count?: number
          source: Database["public"]["Enums"]["music_source"]
          started_at?: string
        }
        Update: {
          error_message?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          inserted_count?: number
          skipped_count?: number
          source?: Database["public"]["Enums"]["music_source"]
          started_at?: string
        }
        Relationships: []
      }
      music_tracks: {
        Row: {
          album: string | null
          artist: string | null
          attribution: string | null
          audio_url: string
          bpm: number | null
          cover_url: string | null
          created_at: string
          duration_seconds: number | null
          external_id: string | null
          genre: string | null
          id: string
          ingested_at: string | null
          is_commercial_ok: boolean | null
          is_public: boolean
          language: string | null
          license: string | null
          license_url: string | null
          owner_id: string | null
          popularity: number
          source: Database["public"]["Enums"]["music_source"]
          storage_bucket: string | null
          storage_key: string | null
          title: string
          uses_count: number
          waveform: Json | null
        }
        Insert: {
          album?: string | null
          artist?: string | null
          attribution?: string | null
          audio_url: string
          bpm?: number | null
          cover_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_id?: string | null
          genre?: string | null
          id?: string
          ingested_at?: string | null
          is_commercial_ok?: boolean | null
          is_public?: boolean
          language?: string | null
          license?: string | null
          license_url?: string | null
          owner_id?: string | null
          popularity?: number
          source?: Database["public"]["Enums"]["music_source"]
          storage_bucket?: string | null
          storage_key?: string | null
          title: string
          uses_count?: number
          waveform?: Json | null
        }
        Update: {
          album?: string | null
          artist?: string | null
          attribution?: string | null
          audio_url?: string
          bpm?: number | null
          cover_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_id?: string | null
          genre?: string | null
          id?: string
          ingested_at?: string | null
          is_commercial_ok?: boolean | null
          is_public?: boolean
          language?: string | null
          license?: string | null
          license_url?: string | null
          owner_id?: string | null
          popularity?: number
          source?: Database["public"]["Enums"]["music_source"]
          storage_bucket?: string | null
          storage_key?: string | null
          title?: string
          uses_count?: number
          waveform?: Json | null
        }
        Relationships: []
      }
      muted_users: {
        Row: {
          created_at: string | null
          id: string
          muted_id: string
          muter_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          muted_id: string
          muter_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          muted_id?: string
          muter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "muted_users_muted_id_fkey"
            columns: ["muted_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muted_users_muter_id_fkey"
            columns: ["muter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_access_tokens: {
        Row: {
          client_id: string
          created_at: string | null
          expires_at: string
          id: string
          revoked: boolean | null
          scope: string
          token: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          expires_at?: string
          id?: string
          revoked?: boolean | null
          scope: string
          token?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          revoked?: boolean | null
          scope?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_access_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      oauth_authorization_codes: {
        Row: {
          client_id: string
          code: string
          code_challenge: string | null
          code_challenge_method: string | null
          created_at: string | null
          expires_at: string
          id: string
          redirect_uri: string
          scope: string
          state: string | null
          used: boolean | null
          user_id: string
        }
        Insert: {
          client_id: string
          code?: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          redirect_uri: string
          scope: string
          state?: string | null
          used?: boolean | null
          user_id: string
        }
        Update: {
          client_id?: string
          code?: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          redirect_uri?: string
          scope?: string
          state?: string | null
          used?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_authorization_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      oauth_clients: {
        Row: {
          allowed_scopes: string[]
          client_id: string
          client_secret: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          logo_url: string | null
          name: string
          owner_id: string
          redirect_uris: string[]
          updated_at: string | null
        }
        Insert: {
          allowed_scopes?: string[]
          client_id?: string
          client_secret?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          logo_url?: string | null
          name: string
          owner_id: string
          redirect_uris?: string[]
          updated_at?: string | null
        }
        Update: {
          allowed_scopes?: string[]
          client_id?: string
          client_secret?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          redirect_uris?: string[]
          updated_at?: string | null
        }
        Relationships: []
      }
      oauth_refresh_tokens: {
        Row: {
          access_token_id: string | null
          client_id: string
          created_at: string | null
          expires_at: string
          id: string
          revoked: boolean | null
          scope: string
          token: string
          user_id: string
        }
        Insert: {
          access_token_id?: string | null
          client_id: string
          created_at?: string | null
          expires_at?: string
          id?: string
          revoked?: boolean | null
          scope: string
          token?: string
          user_id: string
        }
        Update: {
          access_token_id?: string | null
          client_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          revoked?: boolean | null
          scope?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_refresh_tokens_access_token_id_fkey"
            columns: ["access_token_id"]
            isOneToOne: false
            referencedRelation: "oauth_access_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_refresh_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price: number
          product_id: string
          product_variant_id: string | null
          quantity: number
          title: string
          total: number
          variant_options: Json
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price: number
          product_id: string
          product_variant_id?: string | null
          quantity?: number
          title: string
          total: number
          variant_options?: Json
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price?: number
          product_id?: string
          product_variant_id?: string | null
          quantity?: number
          title?: string
          total?: number
          variant_options?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          order_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id: string
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json | null
          buyer_id: string
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          carrier: string | null
          confirmed_by_buyer_at: string | null
          created_at: string
          currency: string | null
          delivered_at: string | null
          failure_reason: string | null
          handoff_code: string | null
          handoff_verified_at: string | null
          handoff_verified_by: string | null
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          receipt_number: string | null
          refunded_at: string | null
          seller_id: string
          shipped_at: string | null
          shipping_address: Json | null
          shipping_cost: number | null
          status: string | null
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          buyer_id: string
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          confirmed_by_buyer_at?: string | null
          created_at?: string
          currency?: string | null
          delivered_at?: string | null
          failure_reason?: string | null
          handoff_code?: string | null
          handoff_verified_at?: string | null
          handoff_verified_by?: string | null
          id?: string
          notes?: string | null
          order_number: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          receipt_number?: string | null
          refunded_at?: string | null
          seller_id: string
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_cost?: number | null
          status?: string | null
          subtotal: number
          total: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          buyer_id?: string
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          confirmed_by_buyer_at?: string | null
          created_at?: string
          currency?: string | null
          delivered_at?: string | null
          failure_reason?: string | null
          handoff_code?: string | null
          handoff_verified_at?: string | null
          handoff_verified_by?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          receipt_number?: string | null
          refunded_at?: string | null
          seller_id?: string
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_cost?: number | null
          status?: string | null
          subtotal?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_analytics"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_transactions: {
        Row: {
          amount: number
          callback_data: Json | null
          completed_at: string | null
          created_at: string
          currency: string
          error_message: string | null
          failed_at: string | null
          gateway: string
          gateway_transaction_id: string | null
          id: string
          order_id: string
          payment_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          callback_data?: Json | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          error_message?: string | null
          failed_at?: string | null
          gateway: string
          gateway_transaction_id?: string | null
          id?: string
          order_id: string
          payment_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          callback_data?: Json | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          error_message?: string | null
          failed_at?: string | null
          gateway?: string
          gateway_transaction_id?: string | null
          id?: string
          order_id?: string
          payment_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_gateway_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_messages: {
        Row: {
          conversation_id: string
          id: string
          message_id: string
          pinned_at: string
          pinned_by: string
        }
        Insert: {
          conversation_id: string
          id?: string
          message_id: string
          pinned_at?: string
          pinned_by: string
        }
        Update: {
          conversation_id?: string
          id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      place_reviews: {
        Row: {
          categories: string[] | null
          category_ratings: Json | null
          comment: string | null
          created_at: string
          helpful_count: number
          id: string
          photo_urls: string[] | null
          place_id: string
          place_key: string | null
          place_name: string
          rating: number
          review_text: string | null
          updated_at: string
          user_id: string
          visit_date: string | null
        }
        Insert: {
          categories?: string[] | null
          category_ratings?: Json | null
          comment?: string | null
          created_at?: string
          helpful_count?: number
          id?: string
          photo_urls?: string[] | null
          place_id: string
          place_key?: string | null
          place_name: string
          rating: number
          review_text?: string | null
          updated_at?: string
          user_id: string
          visit_date?: string | null
        }
        Update: {
          categories?: string[] | null
          category_ratings?: Json | null
          comment?: string | null
          created_at?: string
          helpful_count?: number
          id?: string
          photo_urls?: string[] | null
          place_id?: string
          place_key?: string | null
          place_name?: string
          rating?: number
          review_text?: string | null
          updated_at?: string
          user_id?: string
          visit_date?: string | null
        }
        Relationships: []
      }
      place_visits: {
        Row: {
          address: string | null
          arrived_at: string
          category: string | null
          created_at: string
          device_id: string | null
          dwell_seconds: number
          id: string
          latitude: number
          left_at: string | null
          longitude: number
          name: string | null
          source: string
          user_id: string
        }
        Insert: {
          address?: string | null
          arrived_at?: string
          category?: string | null
          created_at?: string
          device_id?: string | null
          dwell_seconds?: number
          id?: string
          latitude: number
          left_at?: string | null
          longitude: number
          name?: string | null
          source?: string
          user_id: string
        }
        Update: {
          address?: string | null
          arrived_at?: string
          category?: string | null
          created_at?: string
          device_id?: string | null
          dwell_seconds?: number
          id?: string
          latitude?: number
          left_at?: string | null
          longitude?: number
          name?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string | null
          id: string
          latitude: number
          longitude: number
          name: string
          usage_count: number
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          latitude: number
          longitude: number
          name: string
          usage_count?: number
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          usage_count?: number
        }
        Relationships: []
      }
      platform_feedback: {
        Row: {
          assigned_to: string | null
          attachments: string[]
          category: string
          contact_allowed: boolean
          created_at: string
          description: string
          diagnostics: Json
          id: string
          last_activity_at: string
          last_response_by: string | null
          priority: string
          rating: number | null
          reference_code: string
          resolution_note: string | null
          source_route: string | null
          source_url: string | null
          staff_last_viewed_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          user_last_viewed_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachments?: string[]
          category: string
          contact_allowed?: boolean
          created_at?: string
          description: string
          diagnostics?: Json
          id?: string
          last_activity_at?: string
          last_response_by?: string | null
          priority?: string
          rating?: number | null
          reference_code?: string
          resolution_note?: string | null
          source_route?: string | null
          source_url?: string | null
          staff_last_viewed_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          user_last_viewed_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachments?: string[]
          category?: string
          contact_allowed?: boolean
          created_at?: string
          description?: string
          diagnostics?: Json
          id?: string
          last_activity_at?: string
          last_response_by?: string | null
          priority?: string
          rating?: number | null
          reference_code?: string
          resolution_note?: string | null
          source_route?: string | null
          source_url?: string | null
          staff_last_viewed_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          user_last_viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_feedback_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_feedback_messages: {
        Row: {
          author_role: string
          author_user_id: string | null
          body: string
          created_at: string
          feedback_id: string
          id: string
          is_internal: boolean
        }
        Insert: {
          author_role: string
          author_user_id?: string | null
          body: string
          created_at?: string
          feedback_id: string
          id?: string
          is_internal?: boolean
        }
        Update: {
          author_role?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          feedback_id?: string
          id?: string
          is_internal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "platform_feedback_messages_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_feedback_messages_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "platform_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          emoji: string | null
          id: string
          image_url: string | null
          label: string
          poll_id: string
          position: number
          votes_count: number
        }
        Insert: {
          emoji?: string | null
          id?: string
          image_url?: string | null
          label: string
          poll_id: string
          position?: number
          votes_count?: number
        }
        Update: {
          emoji?: string | null
          id?: string
          image_url?: string | null
          label?: string
          poll_id?: string
          position?: number
          votes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          numeric_value: number | null
          option_id: string | null
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          numeric_value?: number | null
          option_id?: string | null
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          numeric_value?: number | null
          option_id?: string | null
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes_legacy_pre_structured: {
        Row: {
          created_at: string
          option_id: string
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          allow_multiple: boolean
          closes_at: string | null
          correct_option_id: string | null
          created_at: string
          explanation: string | null
          id: string
          is_anonymous: boolean
          left_label: string | null
          max_choices: number | null
          max_value: number | null
          min_value: number | null
          poll_type: Database["public"]["Enums"]["poll_type"]
          post_id: string
          question: string
          quiz_mode: boolean
          right_label: string | null
          show_results_before_vote: boolean
          step: number | null
          total_voters: number
          total_votes: number
        }
        Insert: {
          allow_multiple?: boolean
          closes_at?: string | null
          correct_option_id?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          is_anonymous?: boolean
          left_label?: string | null
          max_choices?: number | null
          max_value?: number | null
          min_value?: number | null
          poll_type?: Database["public"]["Enums"]["poll_type"]
          post_id: string
          question: string
          quiz_mode?: boolean
          right_label?: string | null
          show_results_before_vote?: boolean
          step?: number | null
          total_voters?: number
          total_votes?: number
        }
        Update: {
          allow_multiple?: boolean
          closes_at?: string | null
          correct_option_id?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          is_anonymous?: boolean
          left_label?: string | null
          max_choices?: number | null
          max_value?: number | null
          min_value?: number | null
          poll_type?: Database["public"]["Enums"]["poll_type"]
          post_id?: string
          question?: string
          quiz_mode?: boolean
          right_label?: string | null
          show_results_before_vote?: boolean
          step?: number | null
          total_voters?: number
          total_votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "polls_correct_option_fk"
            columns: ["correct_option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_analytics_sessions: {
        Row: {
          completed: boolean
          device_type: string
          dwell_ms: number
          engaged: boolean
          first_seen_at: string
          id: string
          is_follower: boolean
          last_seen_at: string
          max_position_ms: number
          media_duration_ms: number | null
          post_id: string
          profile_clicked: boolean
          session_id: string
          source: string
          viewer_id: string
          watch_ms: number
        }
        Insert: {
          completed?: boolean
          device_type?: string
          dwell_ms?: number
          engaged?: boolean
          first_seen_at?: string
          id?: string
          is_follower?: boolean
          last_seen_at?: string
          max_position_ms?: number
          media_duration_ms?: number | null
          post_id: string
          profile_clicked?: boolean
          session_id: string
          source?: string
          viewer_id: string
          watch_ms?: number
        }
        Update: {
          completed?: boolean
          device_type?: string
          dwell_ms?: number
          engaged?: boolean
          first_seen_at?: string
          id?: string
          is_follower?: boolean
          last_seen_at?: string
          max_position_ms?: number
          media_duration_ms?: number | null
          post_id?: string
          profile_clicked?: boolean
          session_id?: string
          source?: string
          viewer_id?: string
          watch_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_analytics_sessions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_analytics_sessions_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_collaborators: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          post_id: string
          responded_at: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          post_id: string
          responded_at?: string | null
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          post_id?: string
          responded_at?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_collaborators_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_collaborators_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_hashtags: {
        Row: {
          created_at: string
          hashtag: string | null
          hashtag_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          hashtag?: string | null
          hashtag_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          hashtag?: string | null
          hashtag_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_hashtags_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_hashtags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_locations: {
        Row: {
          accuracy_m: number | null
          created_at: string
          heading: number | null
          id: string
          label: string | null
          latitude: number
          live_until: string | null
          longitude: number
          mode: Database["public"]["Enums"]["post_location_mode"]
          place_id: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          label?: string | null
          latitude: number
          live_until?: string | null
          longitude: number
          mode?: Database["public"]["Enums"]["post_location_mode"]
          place_id?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          label?: string | null
          latitude?: number
          live_until?: string | null
          longitude?: number
          mode?: Database["public"]["Enums"]["post_location_mode"]
          place_id?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_locations_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_locations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          alt_text: string | null
          aspect_ratio: string | null
          created_at: string
          duration_seconds: number | null
          edit_state: Json | null
          file_name: string | null
          file_size: number | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["media_kind"]
          mime_type: string | null
          position: number
          post_id: string
          storage_bucket: string | null
          storage_key: string | null
          storage_url: string
          thumbnail_bucket: string | null
          thumbnail_key: string | null
          thumbnail_url: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          aspect_ratio?: string | null
          created_at?: string
          duration_seconds?: number | null
          edit_state?: Json | null
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          mime_type?: string | null
          position?: number
          post_id: string
          storage_bucket?: string | null
          storage_key?: string | null
          storage_url: string
          thumbnail_bucket?: string | null
          thumbnail_key?: string | null
          thumbnail_url?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          aspect_ratio?: string | null
          created_at?: string
          duration_seconds?: number | null
          edit_state?: Json | null
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          mime_type?: string | null
          position?: number
          post_id?: string
          storage_bucket?: string | null
          storage_key?: string | null
          storage_url?: string
          thumbnail_bucket?: string | null
          thumbnail_key?: string | null
          thumbnail_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_music: {
        Row: {
          created_at: string
          end_seconds: number | null
          id: string
          muted_original: boolean
          post_id: string
          start_seconds: number
          track_id: string | null
          volume: number
        }
        Insert: {
          created_at?: string
          end_seconds?: number | null
          id?: string
          muted_original?: boolean
          post_id: string
          start_seconds?: number
          track_id?: string | null
          volume?: number
        }
        Update: {
          created_at?: string
          end_seconds?: number | null
          id?: string
          muted_original?: boolean
          post_id?: string
          start_seconds?: number
          track_id?: string | null
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_music_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_music_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      post_product_tags: {
        Row: {
          created_at: string
          position: Json | null
          post_id: string
          product_id: string
          tagged_by: string | null
        }
        Insert: {
          created_at?: string
          position?: Json | null
          post_id: string
          product_id: string
          tagged_by?: string | null
        }
        Update: {
          created_at?: string
          position?: Json | null
          post_id?: string
          product_id?: string
          tagged_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_product_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "post_product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_product_tags_tagged_by_fkey"
            columns: ["tagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          id: string
          ip_address: unknown
          post_id: string
          user_agent: string | null
          user_id: string
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          id?: string
          ip_address?: unknown
          post_id: string
          user_agent?: string | null
          user_id: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          id?: string
          ip_address?: unknown
          post_id?: string
          user_agent?: string | null
          user_id?: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          bookmarks_count: number | null
          channel_id: string | null
          comments_count: number | null
          content: string | null
          content_search: unknown
          content_type: string
          created_at: string | null
          edit_state: Json | null
          effects_used: string[] | null
          formatted_content: Json | null
          has_poll: boolean
          hashtags: string[] | null
          id: string
          is_hidden: boolean | null
          is_pinned: boolean | null
          likes_count: number | null
          location: string | null
          location_address: string | null
          location_geohash: string | null
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          maturity_rating: string | null
          media_type: string | null
          media_urls: string[] | null
          mentioned_users: string[] | null
          moderation_status: string | null
          poll_data: Json | null
          post_kind: string
          published_at: string | null
          reposts_count: number
          scheduled_at: string | null
          shares_count: number | null
          source_avatar_url: string | null
          source_conversation_id: string | null
          source_id: string | null
          source_message_id: string | null
          source_title: string | null
          source_type: string | null
          status: string
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          video_duration: number | null
          views_count: number
          visibility: string
        }
        Insert: {
          bookmarks_count?: number | null
          channel_id?: string | null
          comments_count?: number | null
          content?: string | null
          content_search?: unknown
          content_type?: string
          created_at?: string | null
          edit_state?: Json | null
          effects_used?: string[] | null
          formatted_content?: Json | null
          has_poll?: boolean
          hashtags?: string[] | null
          id?: string
          is_hidden?: boolean | null
          is_pinned?: boolean | null
          likes_count?: number | null
          location?: string | null
          location_address?: string | null
          location_geohash?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          maturity_rating?: string | null
          media_type?: string | null
          media_urls?: string[] | null
          mentioned_users?: string[] | null
          moderation_status?: string | null
          poll_data?: Json | null
          post_kind?: string
          published_at?: string | null
          reposts_count?: number
          scheduled_at?: string | null
          shares_count?: number | null
          source_avatar_url?: string | null
          source_conversation_id?: string | null
          source_id?: string | null
          source_message_id?: string | null
          source_title?: string | null
          source_type?: string | null
          status?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
          video_duration?: number | null
          views_count?: number
          visibility?: string
        }
        Update: {
          bookmarks_count?: number | null
          channel_id?: string | null
          comments_count?: number | null
          content?: string | null
          content_search?: unknown
          content_type?: string
          created_at?: string | null
          edit_state?: Json | null
          effects_used?: string[] | null
          formatted_content?: Json | null
          has_poll?: boolean
          hashtags?: string[] | null
          id?: string
          is_hidden?: boolean | null
          is_pinned?: boolean | null
          likes_count?: number | null
          location?: string | null
          location_address?: string | null
          location_geohash?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          maturity_rating?: string | null
          media_type?: string | null
          media_urls?: string[] | null
          mentioned_users?: string[] | null
          moderation_status?: string | null
          poll_data?: Json | null
          post_kind?: string
          published_at?: string | null
          reposts_count?: number
          scheduled_at?: string | null
          shares_count?: number | null
          source_avatar_url?: string | null
          source_conversation_id?: string | null
          source_id?: string | null
          source_message_id?: string | null
          source_title?: string | null
          source_type?: string | null
          status?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
          video_duration?: number | null
          views_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_settings: {
        Row: {
          allowed_users: string[] | null
          blocked_users: string[] | null
          created_at: string
          ghost_mode_enabled: boolean | null
          id: string
          incognito_mode_enabled: boolean | null
          pause_tracking: boolean | null
          share_accurate_location: boolean | null
          share_history: boolean | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          allowed_users?: string[] | null
          blocked_users?: string[] | null
          created_at?: string
          ghost_mode_enabled?: boolean | null
          id?: string
          incognito_mode_enabled?: boolean | null
          pause_tracking?: boolean | null
          share_accurate_location?: boolean | null
          share_history?: boolean | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          allowed_users?: string[] | null
          blocked_users?: string[] | null
          created_at?: string
          ghost_mode_enabled?: boolean | null
          id?: string
          incognito_mode_enabled?: boolean | null
          pause_tracking?: boolean | null
          share_accurate_location?: boolean | null
          share_history?: boolean | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      privacy_zones: {
        Row: {
          center: string
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          radius_meters: number
          updated_at: string
          user_id: string
        }
        Insert: {
          center: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          radius_meters?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          center?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          radius_meters?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          position: number | null
          slug: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          position?: number | null
          slug: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          position?: number | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          media_type: string
          position: number | null
          product_id: string
          thumbnail_url: string | null
          url: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          media_type?: string
          position?: number | null
          product_id: string
          thumbnail_url?: string | null
          url: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          media_type?: string
          position?: number | null
          product_id?: string
          thumbnail_url?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_likes: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_likes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_likes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean | null
          product_id: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          product_id: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          product_id?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_messages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_messages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_alerts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          notified_at: string | null
          product_id: string
          target_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          notified_at?: string | null
          product_id: string
          target_price: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          notified_at?: string | null
          product_id?: string
          target_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_price_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          moderator_id: string | null
          moderator_notes: string | null
          product_id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          moderator_id?: string | null
          moderator_notes?: string | null
          product_id: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          moderator_id?: string | null
          moderator_notes?: string | null
          product_id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_reports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_review_media: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          media_type: string
          position: number
          review_id: string
          thumbnail_url: string | null
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          media_type: string
          position?: number
          review_id: string
          thumbnail_url?: string | null
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          media_type?: string
          position?: number
          review_id?: string
          thumbnail_url?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_review_media_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          content: string | null
          created_at: string
          helpful_count: number | null
          id: string
          order_id: string | null
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          order_id?: string | null
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          order_id?: string | null
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_profile_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_search_history: {
        Row: {
          created_at: string
          id: string
          query: string
          results_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          results_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          results_count?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_search_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_traffic_sources: {
        Row: {
          created_at: string
          id: string
          product_id: string
          referrer: string | null
          session_id: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          referrer?: string | null
          session_id?: string | null
          source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          referrer?: string | null
          session_id?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_traffic_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_traffic_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_traffic_sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          compare_at_price: number | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          options: Json
          position: number
          price: number | null
          product_id: string
          quantity: number
          sku: string | null
          updated_at: string
        }
        Insert: {
          compare_at_price?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          options?: Json
          position?: number
          price?: number | null
          product_id: string
          quantity?: number
          sku?: string | null
          updated_at?: string
        }
        Update: {
          compare_at_price?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          options?: Json
          position?: number
          price?: number | null
          product_id?: string
          quantity?: number
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          battery_included: boolean
          category_id: string | null
          compare_at_price: number | null
          condition: string | null
          created_at: string
          currency: string | null
          customs_category: string | null
          description: string | null
          hazardous_materials: boolean
          hs_code: string | null
          id: string
          images: string[]
          is_featured: boolean | null
          is_food: boolean
          is_negotiable: boolean | null
          last_restocked_at: string | null
          latitude: number | null
          likes_count: number | null
          location: string | null
          longitude: number | null
          low_stock_threshold: number | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          moderation_status: string | null
          origin_city: string | null
          origin_country_code: string | null
          package_height_cm: number | null
          package_length_cm: number | null
          package_width_cm: number | null
          preparation_minutes: number | null
          price: number
          quantity: number | null
          restaurant_category: string | null
          restaurant_options: Json
          search_vector: unknown
          seller_id: string
          serving_label: string | null
          shipping_available: boolean | null
          shipping_price: number | null
          sku: string | null
          status: string | null
          tags: string[] | null
          temperature_controlled: boolean
          title: string
          updated_at: string
          variants: Json | null
          views_count: number | null
          weight_kg: number | null
        }
        Insert: {
          battery_included?: boolean
          category_id?: string | null
          compare_at_price?: number | null
          condition?: string | null
          created_at?: string
          currency?: string | null
          customs_category?: string | null
          description?: string | null
          hazardous_materials?: boolean
          hs_code?: string | null
          id?: string
          images?: string[]
          is_featured?: boolean | null
          is_food?: boolean
          is_negotiable?: boolean | null
          last_restocked_at?: string | null
          latitude?: number | null
          likes_count?: number | null
          location?: string | null
          longitude?: number | null
          low_stock_threshold?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string | null
          origin_city?: string | null
          origin_country_code?: string | null
          package_height_cm?: number | null
          package_length_cm?: number | null
          package_width_cm?: number | null
          preparation_minutes?: number | null
          price: number
          quantity?: number | null
          restaurant_category?: string | null
          restaurant_options?: Json
          search_vector?: unknown
          seller_id: string
          serving_label?: string | null
          shipping_available?: boolean | null
          shipping_price?: number | null
          sku?: string | null
          status?: string | null
          tags?: string[] | null
          temperature_controlled?: boolean
          title: string
          updated_at?: string
          variants?: Json | null
          views_count?: number | null
          weight_kg?: number | null
        }
        Update: {
          battery_included?: boolean
          category_id?: string | null
          compare_at_price?: number | null
          condition?: string | null
          created_at?: string
          currency?: string | null
          customs_category?: string | null
          description?: string | null
          hazardous_materials?: boolean
          hs_code?: string | null
          id?: string
          images?: string[]
          is_featured?: boolean | null
          is_food?: boolean
          is_negotiable?: boolean | null
          last_restocked_at?: string | null
          latitude?: number | null
          likes_count?: number | null
          location?: string | null
          longitude?: number | null
          low_stock_threshold?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string | null
          origin_city?: string | null
          origin_country_code?: string | null
          package_height_cm?: number | null
          package_length_cm?: number | null
          package_width_cm?: number | null
          preparation_minutes?: number | null
          price?: number
          quantity?: number | null
          restaurant_category?: string | null
          restaurant_options?: Json
          search_vector?: unknown
          seller_id?: string
          serving_label?: string | null
          shipping_available?: boolean | null
          shipping_price?: number | null
          sku?: string | null
          status?: string | null
          tags?: string[] | null
          temperature_controlled?: boolean
          title?: string
          updated_at?: string
          variants?: Json | null
          views_count?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_analytics"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_photo_history: {
        Row: {
          id: string
          is_current: boolean
          photo_url: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          id?: string
          is_current?: boolean
          photo_url: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          id?: string
          is_current?: boolean
          photo_url?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_photos: {
        Row: {
          created_at: string
          id: string
          image_url: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          country: string | null
          cover_url: string | null
          created_at: string | null
          display_name: string | null
          email_filters: Json
          followers_count: number | null
          following_count: number | null
          id: string
          is_admin: boolean | null
          is_online: boolean | null
          is_verified: boolean | null
          last_seen: string | null
          last_seen_at: string | null
          location: string | null
          notification_preferences: Json
          posts_count: number | null
          preferences: Json | null
          role: string | null
          signatures: Json
          updated_at: string | null
          user_id: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email_filters?: Json
          followers_count?: number | null
          following_count?: number | null
          id: string
          is_admin?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          last_seen?: string | null
          last_seen_at?: string | null
          location?: string | null
          notification_preferences?: Json
          posts_count?: number | null
          preferences?: Json | null
          role?: string | null
          signatures?: Json
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email_filters?: Json
          followers_count?: number | null
          following_count?: number | null
          id?: string
          is_admin?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          last_seen?: string | null
          last_seen_at?: string | null
          location?: string | null
          notification_preferences?: Json
          posts_count?: number | null
          preferences?: Json | null
          role?: string | null
          signatures?: Json
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      publisher_domains: {
        Row: {
          check_error: string | null
          created_at: string
          domain: string
          id: string
          last_checked_at: string | null
          publisher_id: string
          verified_at: string | null
          verify_token: string
        }
        Insert: {
          check_error?: string | null
          created_at?: string
          domain: string
          id?: string
          last_checked_at?: string | null
          publisher_id: string
          verified_at?: string | null
          verify_token?: string
        }
        Update: {
          check_error?: string | null
          created_at?: string
          domain?: string
          id?: string
          last_checked_at?: string | null
          publisher_id?: string
          verified_at?: string | null
          verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "publisher_domains_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
        ]
      }
      publisher_members: {
        Row: {
          created_at: string
          publisher_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          publisher_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          publisher_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publisher_members_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
        ]
      }
      publishers: {
        Row: {
          country_code: string | null
          created_at: string
          display_name: string
          handle: string
          id: string
          legal_name: string | null
          logo_url: string | null
          owner_id: string
          support_email: string | null
          tax_id: string | null
          type: string
          updated_at: string
          verification: string
          website: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          display_name: string
          handle: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          owner_id: string
          support_email?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
          verification?: string
          website?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          display_name?: string
          handle?: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          owner_id?: string
          support_email?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
          verification?: string
          website?: string | null
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          created_at: string
          id: string
          key: string
          scope: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          scope: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          scope?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_notifications: {
        Row: {
          api_key_id: string
          created_at: string
          id: string
          sent_at: string
          threshold_percent: number
          user_id: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          id?: string
          sent_at?: string
          threshold_percent: number
          user_id: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          id?: string
          sent_at?: string
          threshold_percent?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_notifications_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      recent_stickers: {
        Row: {
          last_used: string | null
          sticker_id: string
          use_count: number | null
          user_id: string
        }
        Insert: {
          last_used?: string | null
          sticker_id: string
          use_count?: number | null
          user_id: string
        }
        Update: {
          last_used?: string | null
          sticker_id?: string
          use_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recent_stickers_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recent_stickers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_events: {
        Row: {
          author_id: string | null
          created_at: string
          dwell_ms: number | null
          event_type: string
          id: string
          metadata: Json
          post_id: string
          source: string
          user_id: string
          weight: number
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          dwell_ms?: number | null
          event_type: string
          id?: string
          metadata?: Json
          post_id: string
          source?: string
          user_id: string
          weight?: number
        }
        Update: {
          author_id?: string | null
          created_at?: string
          dwell_ms?: number | null
          event_type?: string
          id?: string
          metadata?: Json
          post_id?: string
          source?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_events_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_global_rankings: {
        Row: {
          calculated_at: string
          content_mode: string
          engagement_score: number
          freshness_score: number
          post_id: string
          quality_score: number
          score: number
        }
        Insert: {
          calculated_at?: string
          content_mode?: string
          engagement_score?: number
          freshness_score?: number
          post_id: string
          quality_score?: number
          score?: number
        }
        Update: {
          calculated_at?: string
          content_mode?: string
          engagement_score?: number
          freshness_score?: number
          post_id?: string
          quality_score?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_global_rankings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          post_id: string | null
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          post_id?: string | null
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          post_id?: string | null
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports_v2: {
        Row: {
          created_at: string
          description: string | null
          id: string
          legacy_id: string | null
          legacy_source: string | null
          metadata: Json
          priority: string
          reason_code: string
          reporter_id: string | null
          resolved_at: string | null
          source_surface: string | null
          status: string
          subreason_code: string | null
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          legacy_id?: string | null
          legacy_source?: string | null
          metadata?: Json
          priority?: string
          reason_code: string
          reporter_id?: string | null
          resolved_at?: string | null
          source_surface?: string | null
          status?: string
          subreason_code?: string | null
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          legacy_id?: string | null
          legacy_source?: string | null
          metadata?: Json
          priority?: string
          reason_code?: string
          reporter_id?: string | null
          resolved_at?: string | null
          source_surface?: string | null
          status?: string
          subreason_code?: string | null
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_v2_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          quote: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          quote?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          quote?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reposts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_usernames: {
        Row: {
          category: string
          reason: string | null
          released_at: string | null
          released_by: string | null
          released_to: string | null
          reserved_at: string
          reserved_by: string | null
          username: string
        }
        Insert: {
          category: string
          reason?: string | null
          released_at?: string | null
          released_by?: string | null
          released_to?: string | null
          reserved_at?: string
          reserved_by?: string | null
          username: string
        }
        Update: {
          category?: string
          reason?: string | null
          released_at?: string | null
          released_by?: string | null
          released_to?: string | null
          reserved_at?: string
          reserved_by?: string | null
          username?: string
        }
        Relationships: []
      }
      review_helpful_votes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_helpful_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_helpful_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      route_history: {
        Row: {
          actual_duration_seconds: number | null
          completed_at: string | null
          created_at: string
          destination: string
          destination_name: string | null
          distance_meters: number
          duration_seconds: number
          id: string
          mode: string
          origin: string
          origin_name: string | null
          route_geometry: Json | null
          started_at: string
          user_id: string
        }
        Insert: {
          actual_duration_seconds?: number | null
          completed_at?: string | null
          created_at?: string
          destination: string
          destination_name?: string | null
          distance_meters: number
          duration_seconds: number
          id?: string
          mode?: string
          origin: string
          origin_name?: string | null
          route_geometry?: Json | null
          started_at?: string
          user_id: string
        }
        Update: {
          actual_duration_seconds?: number | null
          completed_at?: string | null
          created_at?: string
          destination?: string
          destination_name?: string | null
          distance_meters?: number
          duration_seconds?: number
          id?: string
          mode?: string
          origin?: string
          origin_name?: string | null
          route_geometry?: Json | null
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_message_tags: {
        Row: {
          message_id: string
          tag: string
          updated_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          tag: string
          updated_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          tag?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_message_tags_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_message_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_passwords: {
        Row: {
          category: string | null
          created_at: string
          encrypted_password: string
          favicon_url: string | null
          id: string
          is_breached: boolean | null
          last_used_at: string | null
          notes: string | null
          strength: string | null
          updated_at: string
          user_id: string
          username: string
          website: string
          website_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          encrypted_password: string
          favicon_url?: string | null
          id?: string
          is_breached?: boolean | null
          last_used_at?: string | null
          notes?: string | null
          strength?: string | null
          updated_at?: string
          user_id: string
          username: string
          website: string
          website_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          encrypted_password?: string
          favicon_url?: string | null
          id?: string
          is_breached?: boolean | null
          last_used_at?: string | null
          notes?: string | null
          strength?: string | null
          updated_at?: string
          user_id?: string
          username?: string
          website?: string
          website_url?: string | null
        }
        Relationships: []
      }
      saved_place_lists: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_places: {
        Row: {
          address: string | null
          category: string | null
          collection: string
          created_at: string
          icon: string | null
          id: string
          is_favorite: boolean | null
          latitude: number
          list_id: string | null
          longitude: number
          name: string
          notes: string | null
          place_key: string | null
          updated_at: string
          user_id: string
          visited_at: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          collection?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_favorite?: boolean | null
          latitude: number
          list_id?: string | null
          longitude: number
          name: string
          notes?: string | null
          place_key?: string | null
          updated_at?: string
          user_id: string
          visited_at?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          collection?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_favorite?: boolean | null
          latitude?: number
          list_id?: string | null
          longitude?: number
          name?: string
          notes?: string | null
          place_key?: string | null
          updated_at?: string
          user_id?: string
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_places_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "saved_place_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_routes: {
        Row: {
          created_at: string
          destination: string
          destination_name: string | null
          id: string
          last_used_at: string | null
          mode: string
          name: string
          origin: string
          origin_name: string | null
          preference: string
          updated_at: string
          use_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          destination: string
          destination_name?: string | null
          id?: string
          last_used_at?: string | null
          mode?: string
          name: string
          origin: string
          origin_name?: string | null
          preference?: string
          updated_at?: string
          use_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string
          destination_name?: string | null
          id?: string
          last_used_at?: string | null
          mode?: string
          name?: string
          origin?: string
          origin_name?: string | null
          preference?: string
          updated_at?: string
          use_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      scheduled_emails: {
        Row: {
          attachments: Json | null
          body: string
          cc_recipients: Json | null
          created_at: string
          id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string
          to_recipients: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          body: string
          cc_recipients?: Json | null
          created_at?: string
          id?: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          subject: string
          to_recipients?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          body?: string
          cc_recipients?: Json | null
          created_at?: string
          id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_recipients?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          is_silent: boolean
          media_type: string | null
          media_url: string | null
          reply_to_id: string | null
          scheduled_for: string
          sender_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          is_silent?: boolean
          media_type?: string | null
          media_url?: string | null
          reply_to_id?: string | null
          scheduled_for: string
          sender_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          is_silent?: boolean
          media_type?: string | null
          media_url?: string | null
          reply_to_id?: string | null
          scheduled_for?: string
          sender_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_activity_events: {
        Row: {
          id: number
          metadata: Json
          normalized_query: string
          query: string
          searched_at: string
          source: string
          user_id: string
        }
        Insert: {
          id?: number
          metadata?: Json
          normalized_query: string
          query: string
          searched_at?: string
          source?: string
          user_id: string
        }
        Update: {
          id?: number
          metadata?: Json
          normalized_query?: string
          query?: string
          searched_at?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          cache_key: string
          created_at: string | null
          results: Json
        }
        Insert: {
          cache_key: string
          created_at?: string | null
          results: Json
        }
        Update: {
          cache_key?: string
          created_at?: string | null
          results?: Json
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string | null
          id: string
          query: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          query: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          query?: string
          user_id?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string | null
          description: string
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description: string
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      seller_verification_requests: {
        Row: {
          bank_account_info: Json | null
          business_document_url: string | null
          business_name: string
          business_registration_number: string | null
          business_type: string
          created_at: string
          id: string
          id_document_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: string
          tax_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_account_info?: Json | null
          business_document_url?: string | null
          business_name: string
          business_registration_number?: string | null
          business_type: string
          created_at?: string
          id?: string
          id_document_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id: string
          status?: string
          tax_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_account_info?: Json | null
          business_document_url?: string | null
          business_name?: string
          business_registration_number?: string | null
          business_type?: string
          created_at?: string
          id?: string
          id_document_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string
          status?: string
          tax_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_verification_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "seller_analytics"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "seller_verification_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          business_name: string
          business_type: string
          cover_url: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          is_verified: boolean | null
          location: string | null
          logo_url: string | null
          phone: string | null
          rating: number | null
          status: string | null
          store_name: string | null
          total_reviews: number | null
          total_sales: number | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          business_name: string
          business_type?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          phone?: string | null
          rating?: number | null
          status?: string | null
          store_name?: string | null
          total_reviews?: number | null
          total_sales?: number | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          business_name?: string
          business_type?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          phone?: string | null
          rating?: number | null
          status?: string | null
          store_name?: string | null
          total_reviews?: number | null
          total_sales?: number | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sellers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_wishlists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          owner_id: string
          product_ids: string[] | null
          share_code: string
          updated_at: string
          views_count: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          owner_id: string
          product_ids?: string[] | null
          share_code: string
          updated_at?: string
          views_count?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          owner_id?: string
          product_ids?: string[] | null
          share_code?: string
          updated_at?: string
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_wishlists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          country_code: string | null
          created_at: string
          description: string | null
          event_code: string
          id: string
          is_public: boolean
          leg_id: string | null
          location: string | null
          metadata: Json
          occurred_at: string
          shipment_id: string
          status: string
          title: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          description?: string | null
          event_code: string
          id?: string
          is_public?: boolean
          leg_id?: string | null
          location?: string | null
          metadata?: Json
          occurred_at?: string
          shipment_id: string
          status: string
          title: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          description?: string | null
          event_code?: string
          id?: string
          is_public?: boolean
          leg_id?: string | null
          location?: string | null
          metadata?: Json
          occurred_at?: string
          shipment_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "shipment_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_legs: {
        Row: {
          arrived_at: string | null
          carrier_name: string | null
          created_at: string
          departed_at: string | null
          destination_country: string | null
          destination_name: string | null
          estimated_arrival_at: string | null
          estimated_departure_at: string | null
          id: string
          metadata: Json
          mode: string
          origin_country: string | null
          origin_name: string | null
          position: number
          shipment_id: string
          status: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          carrier_name?: string | null
          created_at?: string
          departed_at?: string | null
          destination_country?: string | null
          destination_name?: string | null
          estimated_arrival_at?: string | null
          estimated_departure_at?: string | null
          id?: string
          metadata?: Json
          mode: string
          origin_country?: string | null
          origin_name?: string | null
          position?: number
          shipment_id: string
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          carrier_name?: string | null
          created_at?: string
          departed_at?: string | null
          destination_country?: string | null
          destination_name?: string | null
          estimated_arrival_at?: string | null
          estimated_departure_at?: string | null
          id?: string
          metadata?: Json
          mode?: string
          origin_country?: string | null
          origin_name?: string | null
          position?: number
          shipment_id?: string
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_legs_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          buyer_id: string
          carrier_id: string | null
          carrier_name: string | null
          created_at: string
          currency: string
          current_country: string | null
          current_location: string | null
          customs_status: string
          declared_value: number
          delivered_at: string | null
          destination_country: string | null
          duties_payer: string
          estimated_delivery_at: string | null
          estimated_departure_at: string | null
          id: string
          incoterm: string
          metadata: Json
          order_id: string
          origin_country: string | null
          seller_id: string
          service_level: string
          shipped_at: string | null
          status: string
          tracking_number: string | null
          transport_mode: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          currency?: string
          current_country?: string | null
          current_location?: string | null
          customs_status?: string
          declared_value?: number
          delivered_at?: string | null
          destination_country?: string | null
          duties_payer?: string
          estimated_delivery_at?: string | null
          estimated_departure_at?: string | null
          id?: string
          incoterm?: string
          metadata?: Json
          order_id: string
          origin_country?: string | null
          seller_id: string
          service_level?: string
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          transport_mode?: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          currency?: string
          current_country?: string | null
          current_location?: string | null
          customs_status?: string
          declared_value?: number
          delivered_at?: string | null
          destination_country?: string | null
          duties_payer?: string
          estimated_delivery_at?: string | null
          estimated_departure_at?: string | null
          id?: string
          incoterm?: string
          metadata?: Json
          order_id?: string
          origin_country?: string | null
          seller_id?: string
          service_level?: string
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          transport_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "marketplace_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_analytics"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "shipments_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      step_history: {
        Row: {
          active_minutes: number | null
          calories_burned: number | null
          created_at: string
          date: string
          distance_meters: number | null
          id: string
          steps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_minutes?: number | null
          calories_burned?: number | null
          created_at?: string
          date: string
          distance_meters?: number | null
          id?: string
          steps?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_minutes?: number | null
          calories_burned?: number | null
          created_at?: string
          date?: string
          distance_meters?: number | null
          id?: string
          steps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sticker_favorites: {
        Row: {
          created_at: string
          full_url: string | null
          kind: Database["public"]["Enums"]["sticker_kind"]
          preview_url: string | null
          sticker_id: string | null
          sticker_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_url?: string | null
          kind?: Database["public"]["Enums"]["sticker_kind"]
          preview_url?: string | null
          sticker_id?: string | null
          sticker_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_url?: string | null
          kind?: Database["public"]["Enums"]["sticker_kind"]
          preview_url?: string | null
          sticker_id?: string | null
          sticker_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticker_favorites_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      sticker_moderators: {
        Row: {
          added_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sticker_packs: {
        Row: {
          cover_lottie_url: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          default_kind: Database["public"]["Enums"]["sticker_kind"]
          description: string | null
          icon_emoji: string | null
          icon_key: string | null
          icon_url: string | null
          id: string
          install_count: number
          is_animated: boolean
          is_premium: boolean
          is_public: boolean
          name: string
          owner_id: string | null
          position: number
          review_status: Database["public"]["Enums"]["sticker_moderation_status"]
          slug: string
          source: Database["public"]["Enums"]["sticker_pack_source"]
          sticker_count: number
          submitted_at: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          cover_lottie_url?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          default_kind?: Database["public"]["Enums"]["sticker_kind"]
          description?: string | null
          icon_emoji?: string | null
          icon_key?: string | null
          icon_url?: string | null
          id?: string
          install_count?: number
          is_animated?: boolean
          is_premium?: boolean
          is_public?: boolean
          name: string
          owner_id?: string | null
          position?: number
          review_status?: Database["public"]["Enums"]["sticker_moderation_status"]
          slug: string
          source?: Database["public"]["Enums"]["sticker_pack_source"]
          sticker_count?: number
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          cover_lottie_url?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          default_kind?: Database["public"]["Enums"]["sticker_kind"]
          description?: string | null
          icon_emoji?: string | null
          icon_key?: string | null
          icon_url?: string | null
          id?: string
          install_count?: number
          is_animated?: boolean
          is_premium?: boolean
          is_public?: boolean
          name?: string
          owner_id?: string | null
          position?: number
          review_status?: Database["public"]["Enums"]["sticker_moderation_status"]
          slug?: string
          source?: Database["public"]["Enums"]["sticker_pack_source"]
          sticker_count?: number
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticker_packs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sticker_recents: {
        Row: {
          full_url: string | null
          kind: Database["public"]["Enums"]["sticker_kind"]
          preview_url: string | null
          sticker_id: string | null
          sticker_key: string
          use_count: number
          used_at: string
          user_id: string
        }
        Insert: {
          full_url?: string | null
          kind?: Database["public"]["Enums"]["sticker_kind"]
          preview_url?: string | null
          sticker_id?: string | null
          sticker_key: string
          use_count?: number
          used_at?: string
          user_id: string
        }
        Update: {
          full_url?: string | null
          kind?: Database["public"]["Enums"]["sticker_kind"]
          preview_url?: string | null
          sticker_id?: string | null
          sticker_key?: string
          use_count?: number
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticker_recents_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      sticker_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string | null
          sticker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id?: string | null
          sticker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string | null
          sticker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticker_reports_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      sticker_usage_events: {
        Row: {
          context: string
          created_at: string
          id: number
          sticker_id: string | null
          sticker_key: string
          user_id: string | null
        }
        Insert: {
          context?: string
          created_at?: string
          id?: number
          sticker_id?: string | null
          sticker_key: string
          user_id?: string | null
        }
        Update: {
          context?: string
          created_at?: string
          id?: number
          sticker_id?: string | null
          sticker_key?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sticker_usage_events_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      stickers: {
        Row: {
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          emoji: string | null
          file_size: number | null
          file_url: string | null
          full_url: string | null
          height: number | null
          id: string
          image_url: string | null
          is_public: boolean
          keywords: string[]
          kind: Database["public"]["Enums"]["sticker_kind"]
          lottie_url: string | null
          moderation_reason: string | null
          moderation_status: Database["public"]["Enums"]["sticker_moderation_status"]
          name: string | null
          nsfw_checked_at: string | null
          nsfw_labels: Json | null
          nsfw_score: number | null
          pack_id: string
          position: number
          preview_url: string | null
          storage_path: string | null
          thumb_url: string | null
          thumbnail_url: string | null
          type: string | null
          usage_count: number
          use_count: number
          video_url: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          emoji?: string | null
          file_size?: number | null
          file_url?: string | null
          full_url?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          is_public?: boolean
          keywords?: string[]
          kind?: Database["public"]["Enums"]["sticker_kind"]
          lottie_url?: string | null
          moderation_reason?: string | null
          moderation_status?: Database["public"]["Enums"]["sticker_moderation_status"]
          name?: string | null
          nsfw_checked_at?: string | null
          nsfw_labels?: Json | null
          nsfw_score?: number | null
          pack_id: string
          position?: number
          preview_url?: string | null
          storage_path?: string | null
          thumb_url?: string | null
          thumbnail_url?: string | null
          type?: string | null
          usage_count?: number
          use_count?: number
          video_url?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          emoji?: string | null
          file_size?: number | null
          file_url?: string | null
          full_url?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          is_public?: boolean
          keywords?: string[]
          kind?: Database["public"]["Enums"]["sticker_kind"]
          lottie_url?: string | null
          moderation_reason?: string | null
          moderation_status?: Database["public"]["Enums"]["sticker_moderation_status"]
          name?: string | null
          nsfw_checked_at?: string | null
          nsfw_labels?: Json | null
          nsfw_score?: number | null
          pack_id?: string
          position?: number
          preview_url?: string | null
          storage_path?: string | null
          thumb_url?: string | null
          thumbnail_url?: string | null
          type?: string | null
          usage_count?: number
          use_count?: number
          video_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stickers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          background_color: string | null
          caption: string | null
          created_at: string | null
          duration: number | null
          expires_at: string | null
          id: string
          is_active: boolean
          media_id: string | null
          media_type: string | null
          media_url: string
          post_id: string | null
          storage_bucket: string | null
          storage_key: string | null
          text_overlay: string | null
          user_id: string
          views_count: number | null
        }
        Insert: {
          background_color?: string | null
          caption?: string | null
          created_at?: string | null
          duration?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          media_id?: string | null
          media_type?: string | null
          media_url: string
          post_id?: string | null
          storage_bucket?: string | null
          storage_key?: string | null
          text_overlay?: string | null
          user_id: string
          views_count?: number | null
        }
        Update: {
          background_color?: string | null
          caption?: string | null
          created_at?: string | null
          duration?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          media_id?: string | null
          media_type?: string | null
          media_url?: string
          post_id?: string | null
          storage_bucket?: string | null
          storage_key?: string | null
          text_overlay?: string | null
          user_id?: string
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stories_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "post_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_highlight_items: {
        Row: {
          caption: string | null
          created_at: string
          highlight_id: string
          id: string
          media_type: string | null
          media_url: string
          position: number
          story_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          highlight_id: string
          id?: string
          media_type?: string | null
          media_url: string
          position?: number
          story_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          highlight_id?: string
          id?: string
          media_type?: string | null
          media_url?: string
          position?: number
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_highlight_items_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "story_highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_highlight_items_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_highlights: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_highlights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_sticker_responses: {
        Row: {
          created_at: string
          id: string
          numeric_value: number | null
          option_index: number | null
          sticker_id: string
          text_answer: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          numeric_value?: number | null
          option_index?: number | null
          sticker_id: string
          text_answer?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          numeric_value?: number | null
          option_index?: number | null
          sticker_id?: string
          text_answer?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_sticker_responses_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "story_stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      story_stickers: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          end_seconds: number | null
          id: string
          media_id: string | null
          post_id: string
          rotation: number
          scale: number
          start_seconds: number | null
          type: Database["public"]["Enums"]["story_sticker_type"]
          x: number
          y: number
          z: number
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          end_seconds?: number | null
          id?: string
          media_id?: string | null
          post_id: string
          rotation?: number
          scale?: number
          start_seconds?: number | null
          type: Database["public"]["Enums"]["story_sticker_type"]
          x?: number
          y?: number
          z?: number
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          end_seconds?: number | null
          id?: string
          media_id?: string | null
          post_id?: string
          rotation?: number
          scale?: number
          start_seconds?: number | null
          type?: Database["public"]["Enums"]["story_sticker_type"]
          x?: number
          y?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_stickers_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "post_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_stickers_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_id_profiles_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      taxi_live_locations: {
        Row: {
          created_at: string
          driver_id: string
          heading: number | null
          id: string
          is_available: boolean | null
          is_on_trip: boolean | null
          last_updated: string
          latitude: number
          license_plate: string | null
          longitude: number
          speed_kmh: number | null
          vehicle_type: string | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          heading?: number | null
          id?: string
          is_available?: boolean | null
          is_on_trip?: boolean | null
          last_updated?: string
          latitude: number
          license_plate?: string | null
          longitude: number
          speed_kmh?: number | null
          vehicle_type?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          heading?: number | null
          id?: string
          is_available?: boolean | null
          is_on_trip?: boolean | null
          last_updated?: string
          latitude?: number
          license_plate?: string | null
          longitude?: number
          speed_kmh?: number | null
          vehicle_type?: string | null
        }
        Relationships: []
      }
      taxi_providers: {
        Row: {
          base_fare: number | null
          created_at: string
          currency: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          per_km: number | null
          per_min: number | null
          position: number
          slug: string
        }
        Insert: {
          base_fare?: number | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          per_km?: number | null
          per_min?: number | null
          position?: number
          slug: string
        }
        Update: {
          base_fare?: number | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          per_km?: number | null
          per_min?: number | null
          position?: number
          slug?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          reference_id: string | null
          status: string
          type: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          status?: string
          type: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          status?: string
          type?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      typing_indicators: {
        Row: {
          conversation_id: string
          id: string
          started_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          started_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "typing_indicators_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_account_controls: {
        Row: {
          changed_at: string
          changed_by: string | null
          reason: string | null
          status: string
          suspended_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          reason?: string | null
          status?: string
          suspended_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          reason?: string | null
          status?: string
          suspended_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_account_controls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          activity_type: string
          content_category: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          page: string
          user_id: string
        }
        Insert: {
          activity_type: string
          content_category?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          page: string
          user_id: string
        }
        Update: {
          activity_type?: string
          content_category?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          page?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activity_preferences: {
        Row: {
          created_at: string
          daily_limit_minutes: number
          reminder_enabled: boolean
          reminder_threshold_percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_limit_minutes?: number
          reminder_enabled?: boolean
          reminder_threshold_percent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_limit_minutes?: number
          reminder_enabled?: boolean
          reminder_threshold_percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_addresses: {
        Row: {
          address_line: string
          city: string | null
          created_at: string | null
          full_name: string | null
          id: string
          is_default: boolean | null
          label: string
          phone: string | null
          postal_code: string | null
          state: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address_line: string
          city?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_default?: boolean | null
          label: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address_line?: string
          city?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_default?: boolean | null
          label?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string | null
          blocked_user_id: string
          blocker_id: string
          created_at: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          blocked_id?: string | null
          blocked_user_id: string
          blocker_id: string
          created_at?: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          blocked_id?: string | null
          blocked_user_id?: string
          blocker_id?: string
          created_at?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_data_exports: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          manifest: Json
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          manifest?: Json
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          manifest?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_data_exports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_interests: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_media_download_policy: {
        Row: {
          files_mobile: boolean
          files_wifi: boolean
          images_mobile: boolean
          images_wifi: boolean
          updated_at: string
          user_id: string
          videos_mobile: boolean
          videos_wifi: boolean
        }
        Insert: {
          files_mobile?: boolean
          files_wifi?: boolean
          images_mobile?: boolean
          images_wifi?: boolean
          updated_at?: string
          user_id: string
          videos_mobile?: boolean
          videos_wifi?: boolean
        }
        Update: {
          files_mobile?: boolean
          files_wifi?: boolean
          images_mobile?: boolean
          images_wifi?: boolean
          updated_at?: string
          user_id?: string
          videos_mobile?: boolean
          videos_wifi?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_media_download_policy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_media_settings: {
        Row: {
          auto_download_files: boolean
          auto_download_files_mobile: boolean
          auto_download_images: boolean
          auto_download_images_mobile: boolean
          auto_download_roaming: boolean
          auto_download_videos: boolean
          auto_download_videos_mobile: boolean
          image_quality: number
          updated_at: string
          user_id: string
          video_quality: string
        }
        Insert: {
          auto_download_files?: boolean
          auto_download_files_mobile?: boolean
          auto_download_images?: boolean
          auto_download_images_mobile?: boolean
          auto_download_roaming?: boolean
          auto_download_videos?: boolean
          auto_download_videos_mobile?: boolean
          image_quality?: number
          updated_at?: string
          user_id: string
          video_quality?: string
        }
        Update: {
          auto_download_files?: boolean
          auto_download_files_mobile?: boolean
          auto_download_images?: boolean
          auto_download_images_mobile?: boolean
          auto_download_roaming?: boolean
          auto_download_videos?: boolean
          auto_download_videos_mobile?: boolean
          image_quality?: number
          updated_at?: string
          user_id?: string
          video_quality?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_media_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string | null
          history_paused: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          history_paused?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          history_paused?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_privacy_exceptions: {
        Row: {
          created_at: string
          id: string
          rule: string
          target_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rule: string
          target_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rule?: string
          target_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_privacy_exceptions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_privacy_exceptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_recommendation_interests: {
        Row: {
          created_at: string
          id: string
          source: string
          topic: string
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          source?: string
          topic: string
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          source?: string
          topic?: string
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_recommendation_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          identity_id: string
          used_at: string | null
          used_ip: string | null
          user_id: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          identity_id: string
          used_at?: string | null
          used_ip?: string | null
          user_id?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          identity_id?: string
          used_at?: string | null
          used_ip?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_recovery_codes_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "auth_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_security: {
        Row: {
          created_at: string
          id: string
          last_password_change: string | null
          passkey_enabled: boolean | null
          recovery_codes: string[] | null
          security_score: number | null
          two_fa_enabled: boolean | null
          two_fa_method: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_password_change?: string | null
          passkey_enabled?: boolean | null
          recovery_codes?: string[] | null
          security_score?: number | null
          two_fa_enabled?: boolean | null
          two_fa_method?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_password_change?: string | null
          passkey_enabled?: boolean | null
          recovery_codes?: string[] | null
          security_score?: number | null
          two_fa_enabled?: boolean | null
          two_fa_method?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          accept_incoming_calls: boolean
          accept_secret_chats: boolean
          app_name: string | null
          app_version: string | null
          browser_name: string | null
          created_at: string
          device_model: string | null
          device_name: string | null
          device_type: string | null
          id: string
          ip_address: string | null
          is_current: boolean | null
          last_active_at: string | null
          location_city: string | null
          location_country: string | null
          os_name: string | null
          os_version: string | null
          platform: string | null
          user_id: string
        }
        Insert: {
          accept_incoming_calls?: boolean
          accept_secret_chats?: boolean
          app_name?: string | null
          app_version?: string | null
          browser_name?: string | null
          created_at?: string
          device_model?: string | null
          device_name?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active_at?: string | null
          location_city?: string | null
          location_country?: string | null
          os_name?: string | null
          os_version?: string | null
          platform?: string | null
          user_id: string
        }
        Update: {
          accept_incoming_calls?: boolean
          accept_secret_chats?: boolean
          app_name?: string | null
          app_version?: string | null
          browser_name?: string | null
          created_at?: string
          device_model?: string | null
          device_name?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active_at?: string | null
          location_city?: string | null
          location_country?: string | null
          os_name?: string | null
          os_version?: string | null
          platform?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          ai_data_sharing: boolean | null
          ai_model: string | null
          ai_personalization: boolean | null
          app_theme_mode: string
          auto_download_files_mobile: boolean
          auto_download_files_roaming: boolean
          auto_download_files_wifi: boolean
          auto_download_images_mobile: boolean
          auto_download_images_roaming: boolean
          auto_download_images_wifi: boolean
          auto_download_videos_mobile: boolean
          auto_download_videos_roaming: boolean
          auto_download_videos_wifi: boolean
          autoplay_video_messages: boolean | null
          autoplay_voice_messages: boolean | null
          call_permissions: string | null
          chat_background: string | null
          chat_wallpaper_blur: number
          chat_wallpaper_dim: number
          chat_wallpaper_type: string | null
          chat_wallpaper_updated_at: string | null
          chat_wallpaper_value: string | null
          created_at: string
          data_image_quality: number
          dnd_end_time: string | null
          dnd_start_time: string | null
          font_size: string | null
          forwards_visibility: string
          group_invite_permissions: string | null
          id: string
          language: string | null
          last_seen_visibility: string | null
          map_share_location: boolean | null
          map_style: string | null
          marketplace_order_notifications: boolean | null
          msg_auto_download_images: boolean | null
          msg_auto_download_videos: boolean | null
          msg_enter_to_send: boolean | null
          msg_text_size: number | null
          notif_badge_count: boolean
          notif_comments: boolean
          notif_followers: boolean
          notif_likes: boolean
          notif_mentions: boolean
          notif_messages: boolean
          notif_sound: string
          notif_vibration: boolean
          notification_preview: boolean | null
          notification_sounds: boolean | null
          notify_comments: boolean | null
          notify_follows: boolean | null
          notify_likes: boolean | null
          notify_mentions: boolean | null
          phone_visibility: string
          private_account: boolean
          profile_photo_visibility: string
          read_receipts_enabled: boolean | null
          search_language: string | null
          search_region: string | null
          search_safe_mode: string | null
          session_autoterminate_days: number
          show_deleted_messages: boolean
          theme: string | null
          two_factor_enabled: boolean | null
          two_factor_recovery_hint: string | null
          two_factor_recovery_updated_at: string | null
          updated_at: string
          user_id: string
          videos_autoplay: boolean
        }
        Insert: {
          ai_data_sharing?: boolean | null
          ai_model?: string | null
          ai_personalization?: boolean | null
          app_theme_mode?: string
          auto_download_files_mobile?: boolean
          auto_download_files_roaming?: boolean
          auto_download_files_wifi?: boolean
          auto_download_images_mobile?: boolean
          auto_download_images_roaming?: boolean
          auto_download_images_wifi?: boolean
          auto_download_videos_mobile?: boolean
          auto_download_videos_roaming?: boolean
          auto_download_videos_wifi?: boolean
          autoplay_video_messages?: boolean | null
          autoplay_voice_messages?: boolean | null
          call_permissions?: string | null
          chat_background?: string | null
          chat_wallpaper_blur?: number
          chat_wallpaper_dim?: number
          chat_wallpaper_type?: string | null
          chat_wallpaper_updated_at?: string | null
          chat_wallpaper_value?: string | null
          created_at?: string
          data_image_quality?: number
          dnd_end_time?: string | null
          dnd_start_time?: string | null
          font_size?: string | null
          forwards_visibility?: string
          group_invite_permissions?: string | null
          id?: string
          language?: string | null
          last_seen_visibility?: string | null
          map_share_location?: boolean | null
          map_style?: string | null
          marketplace_order_notifications?: boolean | null
          msg_auto_download_images?: boolean | null
          msg_auto_download_videos?: boolean | null
          msg_enter_to_send?: boolean | null
          msg_text_size?: number | null
          notif_badge_count?: boolean
          notif_comments?: boolean
          notif_followers?: boolean
          notif_likes?: boolean
          notif_mentions?: boolean
          notif_messages?: boolean
          notif_sound?: string
          notif_vibration?: boolean
          notification_preview?: boolean | null
          notification_sounds?: boolean | null
          notify_comments?: boolean | null
          notify_follows?: boolean | null
          notify_likes?: boolean | null
          notify_mentions?: boolean | null
          phone_visibility?: string
          private_account?: boolean
          profile_photo_visibility?: string
          read_receipts_enabled?: boolean | null
          search_language?: string | null
          search_region?: string | null
          search_safe_mode?: string | null
          session_autoterminate_days?: number
          show_deleted_messages?: boolean
          theme?: string | null
          two_factor_enabled?: boolean | null
          two_factor_recovery_hint?: string | null
          two_factor_recovery_updated_at?: string | null
          updated_at?: string
          user_id: string
          videos_autoplay?: boolean
        }
        Update: {
          ai_data_sharing?: boolean | null
          ai_model?: string | null
          ai_personalization?: boolean | null
          app_theme_mode?: string
          auto_download_files_mobile?: boolean
          auto_download_files_roaming?: boolean
          auto_download_files_wifi?: boolean
          auto_download_images_mobile?: boolean
          auto_download_images_roaming?: boolean
          auto_download_images_wifi?: boolean
          auto_download_videos_mobile?: boolean
          auto_download_videos_roaming?: boolean
          auto_download_videos_wifi?: boolean
          autoplay_video_messages?: boolean | null
          autoplay_voice_messages?: boolean | null
          call_permissions?: string | null
          chat_background?: string | null
          chat_wallpaper_blur?: number
          chat_wallpaper_dim?: number
          chat_wallpaper_type?: string | null
          chat_wallpaper_updated_at?: string | null
          chat_wallpaper_value?: string | null
          created_at?: string
          data_image_quality?: number
          dnd_end_time?: string | null
          dnd_start_time?: string | null
          font_size?: string | null
          forwards_visibility?: string
          group_invite_permissions?: string | null
          id?: string
          language?: string | null
          last_seen_visibility?: string | null
          map_share_location?: boolean | null
          map_style?: string | null
          marketplace_order_notifications?: boolean | null
          msg_auto_download_images?: boolean | null
          msg_auto_download_videos?: boolean | null
          msg_enter_to_send?: boolean | null
          msg_text_size?: number | null
          notif_badge_count?: boolean
          notif_comments?: boolean
          notif_followers?: boolean
          notif_likes?: boolean
          notif_mentions?: boolean
          notif_messages?: boolean
          notif_sound?: string
          notif_vibration?: boolean
          notification_preview?: boolean | null
          notification_sounds?: boolean | null
          notify_comments?: boolean | null
          notify_follows?: boolean | null
          notify_likes?: boolean | null
          notify_mentions?: boolean | null
          phone_visibility?: string
          private_account?: boolean
          profile_photo_visibility?: string
          read_receipts_enabled?: boolean | null
          search_language?: string | null
          search_region?: string | null
          search_safe_mode?: string | null
          session_autoterminate_days?: number
          show_deleted_messages?: boolean
          theme?: string | null
          two_factor_enabled?: boolean | null
          two_factor_recovery_hint?: string | null
          two_factor_recovery_updated_at?: string | null
          updated_at?: string
          user_id?: string
          videos_autoplay?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sticker_packs: {
        Row: {
          added_at: string
          pack_id: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          pack_id: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          pack_id?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sticker_packs_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stores: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          store_name: string
          tagline: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          store_name: string
          tagline?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          store_name?: string
          tagline?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_totp: {
        Row: {
          confirmed_at: string | null
          created_at: string
          failed_attempts: number
          identity_id: string | null
          last_used_step: number | null
          secret: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          failed_attempts?: number
          identity_id?: string | null
          last_used_step?: number | null
          secret: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          failed_attempts?: number
          identity_id?: string | null
          last_used_step?: number | null
          secret?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_totp_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "auth_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      username_change_history: {
        Row: {
          changed_at: string
          id: string
          new_username: string
          old_username: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          new_username: string
          old_username?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          new_username?: string
          old_username?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "username_change_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      username_rules: {
        Row: {
          allowed_pattern: string
          id: boolean
          max_username_length: number
          min_username_length: number
          reserved_max_short_length: number
        }
        Insert: {
          allowed_pattern?: string
          id?: boolean
          max_username_length?: number
          min_username_length?: number
          reserved_max_short_length?: number
        }
        Update: {
          allowed_pattern?: string
          id?: boolean
          max_username_length?: number
          min_username_length?: number
          reserved_max_short_length?: number
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          additional_info: string | null
          bio_link: string | null
          category: string
          created_at: string
          full_name: string
          id: string
          id_document_url: string | null
          known_as: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_info?: string | null
          bio_link?: string | null
          category: string
          created_at?: string
          full_name: string
          id?: string
          id_document_url?: string | null
          known_as?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_info?: string | null
          bio_link?: string | null
          category?: string
          created_at?: string
          full_name?: string
          id?: string
          id_document_url?: string | null
          known_as?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_calls: {
        Row: {
          call_mode: string
          call_type: string | null
          conversation_id: string | null
          created_at: string | null
          ended_at: string | null
          host_id: string
          id: string
          is_group_call: boolean
          last_heartbeat_at: string | null
          max_participants: number | null
          metadata: Json
          started_at: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          call_mode?: string
          call_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          is_group_call?: boolean
          last_heartbeat_at?: string | null
          max_participants?: number | null
          metadata?: Json
          started_at?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          call_mode?: string
          call_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          is_group_call?: boolean
          last_heartbeat_at?: string | null
          max_participants?: number | null
          metadata?: Json
          started_at?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_jobs: {
        Row: {
          attempts: number
          client_attempts: number
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          kind: Database["public"]["Enums"]["media_job_kind"]
          media_id: string | null
          output_url: string | null
          owner_id: string
          params: Json
          post_id: string | null
          processed_seconds: number | null
          source_url: string
          started_at: string | null
          status: Database["public"]["Enums"]["media_job_status"]
        }
        Insert: {
          attempts?: number
          client_attempts?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["media_job_kind"]
          media_id?: string | null
          output_url?: string | null
          owner_id: string
          params?: Json
          post_id?: string | null
          processed_seconds?: number | null
          source_url: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["media_job_status"]
        }
        Update: {
          attempts?: number
          client_attempts?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["media_job_kind"]
          media_id?: string | null
          output_url?: string | null
          owner_id?: string
          params?: Json
          post_id?: string | null
          processed_seconds?: number | null
          source_url?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["media_job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "video_jobs_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "post_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_watch_segments: {
        Row: {
          bucket: number
          post_id: string
          updated_at: string
          views: number
        }
        Insert: {
          bucket: number
          post_id: string
          updated_at?: string
          views?: number
        }
        Update: {
          bucket?: number
          post_id?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_watch_segments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_watch_sessions: {
        Row: {
          completed: boolean
          created_at: string
          duration_seconds: number | null
          id: string
          max_position_seconds: number | null
          post_id: string
          user_id: string | null
          watched_seconds: number
        }
        Insert: {
          completed?: boolean
          created_at?: string
          duration_seconds?: number | null
          id?: string
          max_position_seconds?: number | null
          post_id: string
          user_id?: string | null
          watched_seconds?: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          duration_seconds?: number | null
          id?: string
          max_position_seconds?: number | null
          post_id?: string
          user_id?: string | null
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_watch_sessions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      view_history: {
        Row: {
          content_id: string
          content_type: string
          id: string
          progress: number | null
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          content_id: string
          content_type: string
          id?: string
          progress?: number | null
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          content_id?: string
          content_type?: string
          id?: string
          progress?: number | null
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "view_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          amount: number
          balance_after: number | null
          context_id: string | null
          context_type: string | null
          counterparty_user_id: string | null
          created_at: string
          currency: string
          description: string | null
          direction: string
          id: string
          kind: string
          metadata: Json
          source_id: string | null
          source_table: string | null
          status: string
          transfer_id: string | null
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          context_id?: string | null
          context_type?: string | null
          counterparty_user_id?: string | null
          created_at?: string
          currency: string
          description?: string | null
          direction: string
          id?: string
          kind: string
          metadata?: Json
          source_id?: string | null
          source_table?: string | null
          status?: string
          transfer_id?: string | null
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          context_id?: string | null
          context_type?: string | null
          counterparty_user_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction?: string
          id?: string
          kind?: string
          metadata?: Json
          source_id?: string | null
          source_table?: string | null
          status?: string
          transfer_id?: string | null
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "wallet_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_payment_intents: {
        Row: {
          amount: number
          created_at: string
          currency: string
          expires_at: string
          id: string
          metadata: Json
          paid_at: string | null
          provider: string
          provider_cancel_time: number | null
          provider_create_time: number | null
          provider_perform_time: number | null
          provider_reason: number | null
          provider_state: number | null
          provider_time: number | null
          provider_transaction_id: string | null
          return_url: string | null
          status: string
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          metadata?: Json
          paid_at?: string | null
          provider: string
          provider_cancel_time?: number | null
          provider_create_time?: number | null
          provider_perform_time?: number | null
          provider_reason?: number | null
          provider_state?: number | null
          provider_time?: number | null
          provider_transaction_id?: string | null
          return_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          metadata?: Json
          paid_at?: string | null
          provider?: string
          provider_cancel_time?: number | null
          provider_create_time?: number | null
          provider_perform_time?: number | null
          provider_reason?: number | null
          provider_state?: number | null
          provider_time?: number | null
          provider_transaction_id?: string | null
          return_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_payment_intents_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_topup_requests: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          method: string
          note: string | null
          payment_id: string | null
          proof_url: string | null
          reference: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          method: string
          note?: string | null
          payment_id?: string | null
          proof_url?: string | null
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string
          note?: string | null
          payment_id?: string | null
          proof_url?: string | null
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_topup_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "marketplace_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transfers: {
        Row: {
          amount: number
          context_id: string | null
          context_type: string
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          note: string | null
          recipient_id: string
          sender_id: string
          status: string
        }
        Insert: {
          amount: number
          context_id?: string | null
          context_type?: string
          created_at?: string
          currency: string
          id?: string
          idempotency_key?: string
          note?: string | null
          recipient_id: string
          sender_id: string
          status?: string
        }
        Update: {
          amount?: number
          context_id?: string | null
          context_type?: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          note?: string | null
          recipient_id?: string
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          account_number: string
          balance: number
          created_at: string
          currency: string
          id: string
          last_activity_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number?: string
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          last_activity_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          last_activity_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      web_crawl_queue: {
        Row: {
          attempts: number
          created_at: string
          depth: number
          discovered_from: string | null
          id: number
          last_error: string | null
          next_attempt_at: string
          priority: number
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          depth?: number
          discovered_from?: string | null
          id?: number
          last_error?: string | null
          next_attempt_at?: string
          priority?: number
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          attempts?: number
          created_at?: string
          depth?: number
          discovered_from?: string | null
          id?: number
          last_error?: string | null
          next_attempt_at?: string
          priority?: number
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      web_search_documents: {
        Row: {
          author: string | null
          canonical_url: string | null
          content_hash: string | null
          content_text: string
          content_type: string | null
          crawl_depth: number
          description: string
          domain: string
          duration_seconds: number | null
          fetched_at: string
          height: number | null
          id: string
          indexed_at: string
          kind: string
          language: string | null
          path: string
          published_at: string | null
          rank_score: number
          search_vector: unknown
          status_code: number | null
          thumbnail_url: string | null
          title: string
          url: string
          width: number | null
        }
        Insert: {
          author?: string | null
          canonical_url?: string | null
          content_hash?: string | null
          content_text?: string
          content_type?: string | null
          crawl_depth?: number
          description?: string
          domain: string
          duration_seconds?: number | null
          fetched_at?: string
          height?: number | null
          id?: string
          indexed_at?: string
          kind?: string
          language?: string | null
          path?: string
          published_at?: string | null
          rank_score?: number
          search_vector?: unknown
          status_code?: number | null
          thumbnail_url?: string | null
          title?: string
          url: string
          width?: number | null
        }
        Update: {
          author?: string | null
          canonical_url?: string | null
          content_hash?: string | null
          content_text?: string
          content_type?: string | null
          crawl_depth?: number
          description?: string
          domain?: string
          duration_seconds?: number | null
          fetched_at?: string
          height?: number | null
          id?: string
          indexed_at?: string
          kind?: string
          language?: string | null
          path?: string
          published_at?: string | null
          rank_score?: number
          search_vector?: unknown
          status_code?: number | null
          thumbnail_url?: string | null
          title?: string
          url?: string
          width?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      admin_user_stats: {
        Row: {
          new_users_24h: number | null
          new_users_7d: number | null
          online_users: number | null
          total_users: number | null
          verified_users: number | null
        }
        Relationships: []
      }
      hashtags_aggregated: {
        Row: {
          last_used_at: string | null
          post_count: number | null
          tag: string | null
        }
        Relationships: []
      }
      hashtags_legacy_view: {
        Row: {
          last_used_at: string | null
          post_count: number | null
          tag: string | null
        }
        Relationships: []
      }
      place_statistics: {
        Row: {
          average_rating: number | null
          check_in_count: number | null
          last_check_in: string | null
          last_review: string | null
          place_id: string | null
          place_name: string | null
          review_count: number | null
        }
        Relationships: []
      }
      popular_product_searches: {
        Row: {
          last_searched_at: string | null
          query: string | null
          search_count: number | null
        }
        Relationships: []
      }
      post_bookmarks: {
        Row: {
          created_at: string | null
          id: string | null
          post_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          post_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          post_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_performance: {
        Row: {
          avg_rating: number | null
          conversion_rate: number | null
          last_sold_at: string | null
          likes_count: number | null
          listed_at: string | null
          price: number | null
          product_id: string | null
          quantity: number | null
          revenue: number | null
          review_count: number | null
          seller_id: string | null
          times_sold: number | null
          title: string | null
          units_sold: number | null
          updated_at: string | null
          views_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_analytics"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_analytics: {
        Row: {
          active_customers_30d: number | null
          active_products: number | null
          avg_order_value: number | null
          avg_rating: number | null
          business_name: string | null
          completed_orders: number | null
          conversion_rate: number | null
          last_order_at: string | null
          last_product_at: string | null
          pending_orders: number | null
          seller_id: string | null
          total_customers: number | null
          total_likes: number | null
          total_orders: number | null
          total_products: number | null
          total_revenue: number | null
          total_reviews: number | null
          total_views: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sellers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_customer_demographics: {
        Row: {
          avg_customer_lifetime_value: number | null
          cities: Json | null
          loyal_customers: number | null
          max_customer_lifetime_value: number | null
          one_time_customers: number | null
          repeat_customers: number | null
          seller_id: string | null
          total_customers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_analytics"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _admin_emit_notification: {
        Args: {
          p_action_url: string
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_severity: string
          p_target_role_key: string
          p_title: string
        }
        Returns: string
      }
      _admin_enforcement_event: {
        Args: {
          p_action_id: string
          p_actor_id: string
          p_detail?: Json
          p_event_type: string
        }
        Returns: undefined
      }
      _admin_enforcement_required_approvals: {
        Args: { p_action_type: string; p_policy_code: string }
        Returns: number
      }
      _rtc_capacity_for_mode: { Args: { p_call_mode: string }; Returns: number }
      _rtc_conversation_type: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      _rtc_default_call_mode: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      _rtc_has_column: {
        Args: { p_column: string; p_table: string }
        Returns: boolean
      }
      _rtc_is_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      activate_story_draft: { Args: { p_story_id: string }; Returns: boolean }
      add_sticker_pack_by_slug: { Args: { p_slug: string }; Returns: string }
      admin_add_entity_note_v1: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_pinned?: boolean
        }
        Returns: string
      }
      admin_analytics_snapshot_v1: { Args: never; Returns: Json }
      admin_audit_event_detail_v1: {
        Args: { p_event_id: string }
        Returns: Json
      }
      admin_bulk_reserve: {
        Args: { p_category: string; p_reason?: string; p_usernames: string[] }
        Returns: {
          inserted: number
          skipped: number
        }[]
      }
      admin_bulk_triage_reports_v1: {
        Args: {
          p_action: string
          p_priority?: string
          p_reason?: string
          p_report_ids: string[]
        }
        Returns: number
      }
      admin_case_detail_v1: { Args: { p_case_id: string }; Returns: Json }
      admin_control_authorized: {
        Args: { p_permission?: string }
        Returns: boolean
      }
      admin_create_case_from_report_v1: {
        Args: {
          p_assigned_to?: string
          p_report_id: string
          p_severity?: string
        }
        Returns: string
      }
      admin_create_incident_v1: {
        Args: {
          p_area?: string
          p_assigned_to?: string
          p_metadata?: Json
          p_severity?: string
          p_summary?: string
          p_title: string
        }
        Returns: string
      }
      admin_decide_case_v1: {
        Args: {
          p_action_hours?: number
          p_action_type?: string
          p_case_id: string
          p_decision: string
          p_policy_code: string
          p_rationale: string
        }
        Returns: Json
      }
      admin_delete_entity_note_v1: {
        Args: { p_note_id: string; p_reason: string }
        Returns: boolean
      }
      admin_delete_mailbox_alias_v3: {
        Args: { p_alias: string; p_reason: string; p_user_id: string }
        Returns: boolean
      }
      admin_enforcement_queue_v1: { Args: { p_limit?: number }; Returns: Json }
      admin_execute_enforcement_v1: {
        Args: { p_action_id: string; p_reason: string }
        Returns: Json
      }
      admin_finalize_user_deletion_v3: {
        Args: { p_error?: string; p_job_id: string; p_success: boolean }
        Returns: undefined
      }
      admin_get_user_details_v3: { Args: { p_user_id: string }; Returns: Json }
      admin_is_protected_user: { Args: { p_user_id: string }; Returns: boolean }
      admin_list_entity_notes_v1: {
        Args: { p_entity_id: string; p_entity_type: string; p_limit?: number }
        Returns: {
          body: string
          created_at: string
          created_by: string
          created_by_name: string
          created_by_username: string
          id: string
          pinned: boolean
          updated_at: string
        }[]
      }
      admin_list_mailbox_aliases_v3: {
        Args: { p_user_id: string }
        Returns: {
          alias: string
        }[]
      }
      admin_list_users_v3: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          account_status: string
          avatar_url: string
          country: string
          created_at: string
          display_name: string
          followers_count: number
          following_count: number
          is_online: boolean
          is_verified: boolean
          last_seen: string
          posts_count: number
          roles: string[]
          status_reason: string
          suspended_until: string
          total_count: number
          user_id: string
          username: string
        }[]
      }
      admin_mark_all_notifications_read_v1: { Args: never; Returns: number }
      admin_mark_notification_read_v1: {
        Args: { p_notification_id: string; p_read?: boolean }
        Returns: boolean
      }
      admin_notification_inbox_v1: {
        Args: { p_limit?: number }
        Returns: {
          action_url: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          is_read: boolean
          kind: string
          severity: string
          title: string
        }[]
      }
      admin_operations_snapshot_v1: { Args: never; Returns: Json }
      admin_prepare_user_deletion_v3: {
        Args: { p_reason: string; p_user_id: string }
        Returns: string
      }
      admin_rbac_matrix_v1: { Args: never; Returns: Json }
      admin_recent_audit_v3: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          reason: string
          target_user_id: string
        }[]
      }
      admin_region_summary_v3: {
        Args: never
        Returns: {
          country: string
          new_30d_count: number
          online_count: number
          posts_count: number
          users_count: number
          verified_count: number
        }[]
      }
      admin_release_username_to_user: {
        Args: { p_target_user_id: string; p_username: string }
        Returns: {
          category: string
          reason: string | null
          released_at: string | null
          released_by: string | null
          released_to: string | null
          reserved_at: string
          reserved_by: string | null
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "reserved_usernames"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_reserve_username: {
        Args: { p_category: string; p_reason?: string; p_username: string }
        Returns: {
          category: string
          reason: string | null
          released_at: string | null
          released_by: string | null
          released_to: string | null
          reserved_at: string
          reserved_by: string | null
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "reserved_usernames"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_revert_enforcement_v1: {
        Args: { p_action_id: string; p_reason: string }
        Returns: Json
      }
      admin_review_appeal_v1: {
        Args: { p_appeal_id: string; p_decision: string; p_note: string }
        Returns: Json
      }
      admin_review_enforcement_v1: {
        Args: { p_action_id: string; p_decision: string; p_note: string }
        Returns: Json
      }
      admin_review_verification_request_v1: {
        Args: { p_decision: string; p_reason?: string; p_request_id: string }
        Returns: Json
      }
      admin_revoke_device_trust_v1: {
        Args: { p_device_id: string; p_reason: string }
        Returns: boolean
      }
      admin_set_feature_flag_v1: {
        Args: {
          p_description?: string
          p_enabled: boolean
          p_key: string
          p_min_version?: string
          p_platforms?: string[]
          p_reason?: string
          p_rollout_percentage?: number
        }
        Returns: Json
      }
      admin_set_role_permission_v1: {
        Args: {
          p_enabled: boolean
          p_permission_key: string
          p_reason: string
          p_role_key: string
        }
        Returns: boolean
      }
      admin_set_user_account_status_v3: {
        Args: {
          p_reason: string
          p_status: string
          p_suspended_until?: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_set_user_verification_v1: {
        Args: { p_reason?: string; p_user_id: string; p_verified: boolean }
        Returns: Json
      }
      admin_system_control_snapshot_v4: { Args: never; Returns: Json }
      admin_system_health_v3: { Args: never; Returns: Json }
      admin_trust_safety_snapshot_v1: {
        Args: { p_limit?: number }
        Returns: Json
      }
      admin_unreserve_username: {
        Args: { p_username: string }
        Returns: boolean
      }
      admin_update_case_v1: {
        Args: {
          p_assigned_admin_id?: string
          p_case_id: string
          p_policy_code?: string
          p_priority?: string
          p_severity?: string
          p_status?: string
          p_summary?: string
        }
        Returns: Json
      }
      admin_update_incident_v1: {
        Args: {
          p_assigned_to?: string
          p_incident_id: string
          p_resolution_note?: string
          p_severity?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_update_moderation_policy_v1: {
        Args: {
          p_active: boolean
          p_code: string
          p_default_action: string
          p_default_duration_hours: number
          p_description: string
          p_reason: string
          p_required_approvals: number
        }
        Returns: Json
      }
      admin_update_user_profile_v3: {
        Args: { p_patch: Json; p_reason: string; p_user_id: string }
        Returns: Json
      }
      admin_user_audit_v3: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          action: string
          actor_id: string
          after_state: Json
          before_state: Json
          created_at: string
          id: string
          metadata: Json
          reason: string
        }[]
      }
      admin_user_role_keys: { Args: { p_user_id: string }; Returns: string[] }
      admin_user_security_snapshot_v1: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_write_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity_id?: string
          p_entity_type?: string
          p_metadata?: Json
          p_reason?: string
          p_target_user_id?: string
        }
        Returns: string
      }
      approve_wallet_topup: {
        Args: { _request_id: string; _review_note?: string }
        Returns: Json
      }
      archive_ad_campaign_v4: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      archive_ad_delivery_v4: { Args: { p_ad_id: string }; Returns: boolean }
      are_contacts: { Args: { a: string; b: string }; Returns: boolean }
      block_user: { Args: { _reason?: string; _target: string }; Returns: Json }
      bot_authenticate: { Args: { p_token: string }; Returns: Json }
      bot_create: {
        Args: {
          p_description?: string
          p_display_name?: string
          p_publisher_id?: string
          p_username: string
        }
        Returns: Json
      }
      bot_dequeue_updates: {
        Args: { p_bot_id: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      bot_normalize_username: { Args: { p_username: string }; Returns: string }
      bot_push_update: {
        Args: { p_payload?: Json; p_type: string; p_username: string }
        Returns: Json
      }
      bot_revoke_token: { Args: { p_bot_id: string }; Returns: Json }
      bot_send_message: {
        Args: {
          p_bot_id: string
          p_kind?: string
          p_payload?: Json
          p_text?: string
          p_user_id: string
        }
        Returns: string
      }
      bot_set_commands: {
        Args: { p_bot_id: string; p_commands: Json }
        Returns: boolean
      }
      bot_set_mini_app: {
        Args: { p_app_id: string; p_bot_id: string; p_url?: string }
        Returns: boolean
      }
      bot_set_webhook: {
        Args: { p_bot_id: string; p_secret?: string; p_url: string }
        Returns: boolean
      }
      bot_token_hash: { Args: { p_token: string }; Returns: string }
      call_heartbeat: { Args: { p_call_id: string }; Returns: boolean }
      can_access_video_call: {
        Args: { p_call_id: string; p_user_id: string }
        Returns: boolean
      }
      can_dm_user: {
        Args: { p_recipient_id: string; p_sender_id: string }
        Returns: boolean
      }
      can_join_conversation: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      can_manage_ad_account: {
        Args: { p_account_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_moderate_live_stream: {
        Args: { p_stream_id: string; p_user_id: string }
        Returns: boolean
      }
      can_owner_add_conversation_participant: {
        Args: { p_conversation_id: string; p_target_user_id: string }
        Returns: boolean
      }
      can_read_conversation: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      can_see_user_location: {
        Args: { requester_user_id: string; target_user_id: string }
        Returns: boolean
      }
      can_send_message_to_conversation: {
        Args: { p_conversation_id: string; p_sender_id: string }
        Returns: boolean
      }
      can_view_call: {
        Args: { p_call_id: string; p_user_id: string }
        Returns: boolean
      }
      can_view_post: { Args: { p_post_id: string }; Returns: boolean }
      can_view_post_media_object: {
        Args: { p_bucket: string; p_key: string }
        Returns: boolean
      }
      can_view_post_music_object: {
        Args: { p_bucket: string; p_key: string }
        Returns: boolean
      }
      can_view_presence: { Args: { target_user_id: string }; Returns: boolean }
      can_view_profile_field: {
        Args: { field_name: string; target_user_id: string }
        Returns: boolean
      }
      can_view_structured_post_compat: {
        Args: { p_post_id: string }
        Returns: boolean
      }
      cancel_wallet_topup: { Args: { _request_id: string }; Returns: Json }
      change_username: {
        Args: { p_username: string }
        Returns: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          country: string | null
          cover_url: string | null
          created_at: string | null
          display_name: string | null
          email_filters: Json
          followers_count: number | null
          following_count: number | null
          id: string
          is_admin: boolean | null
          is_online: boolean | null
          is_verified: boolean | null
          last_seen: string | null
          last_seen_at: string | null
          location: string | null
          notification_preferences: Json
          posts_count: number | null
          preferences: Json | null
          role: string | null
          signatures: Json
          updated_at: string | null
          user_id: string | null
          username: string | null
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_rate_limit: {
        Args: {
          p_key: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      check_username_availability: {
        Args: { p_user_id?: string; p_username: string }
        Returns: Json
      }
      cleanup_auto_delete_messages: { Args: never; Returns: undefined }
      cleanup_expired_call_signals: { Args: never; Returns: number }
      cleanup_expired_stories: { Args: never; Returns: undefined }
      cleanup_old_search_cache: { Args: never; Returns: undefined }
      cleanup_old_search_history: { Args: never; Returns: undefined }
      clear_my_search_history: { Args: never; Returns: Json }
      complete_ad_experiment_v4: {
        Args: { p_experiment_id: string; p_rollout_winner?: boolean }
        Returns: Json
      }
      conversation_stats: {
        Args: { p_conversation_id: string }
        Returns: {
          growth_7d: number
          members: number
          messages: number
          reports: number
          views: number
        }[]
      }
      create_ad_campaign_v4: {
        Args: { p_payload: Json }
        Returns: {
          ad_account_id: string | null
          ad_set_v2_id: string | null
          ad_type: string
          bid_amount: number | null
          billing_type: string
          budget: number
          call_to_action: string | null
          campaign_v2_id: string | null
          clicks_count: number
          created_at: string
          creative_v2_id: string | null
          daily_budget: number | null
          delivery_item_v2_id: string | null
          description: string | null
          destination_url: string | null
          end_date: string | null
          id: string
          impressions_count: number
          media_type: string
          media_url: string
          reach_count: number
          spent: number
          start_date: string | null
          status: string
          target_age_max: number | null
          target_age_min: number | null
          target_countries: string[] | null
          target_gender: string | null
          target_interests: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_ad_experiment_v4: {
        Args: {
          p_campaign_id: string
          p_minimum_sample_size?: number
          p_name: string
          p_primary_metric: string
          p_traffic_percent?: number
          p_variants: Json
        }
        Returns: string
      }
      create_ad_variant_v4: {
        Args: {
          p_campaign_id: string
          p_payload: Json
          p_source_delivery_item_id: string
        }
        Returns: {
          ad_account_id: string | null
          ad_set_v2_id: string | null
          ad_type: string
          bid_amount: number | null
          billing_type: string
          budget: number
          call_to_action: string | null
          campaign_v2_id: string | null
          clicks_count: number
          created_at: string
          creative_v2_id: string | null
          daily_budget: number | null
          delivery_item_v2_id: string | null
          description: string | null
          destination_url: string | null
          end_date: string | null
          id: string
          impressions_count: number
          media_type: string
          media_url: string
          reach_count: number
          spent: number
          start_date: string | null
          status: string
          target_age_max: number | null
          target_age_min: number | null
          target_countries: string[] | null
          target_gender: string | null
          target_interests: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_foundation_ready: { Args: never; Returns: boolean }
      create_message_report: {
        Args: {
          p_conversation_id: string
          p_details?: string
          p_message_id: string
          p_reason: string
        }
        Returns: string
      }
      create_story_draft: { Args: { p_payload: Json }; Returns: Json }
      create_video_call: {
        Args: {
          p_call_type?: string
          p_conversation_id: string
          p_is_video_on?: boolean
        }
        Returns: string
      }
      create_wallet_payment_intent: {
        Args: { _amount: number; _provider: string; _return_url?: string }
        Returns: Json
      }
      current_identity_id: { Args: never; Returns: string }
      deactivate_expired_live_locations: { Args: never; Returns: undefined }
      decline_video_call: { Args: { p_call_id: string }; Returns: undefined }
      delete_story: { Args: { p_story_id: string }; Returns: Json }
      discard_story_draft: { Args: { p_story_id: string }; Returns: boolean }
      effective_conversation_notification_settings: {
        Args: { p_conversation_id: string; p_user_id?: string }
        Returns: {
          mentions_only: boolean
          mute_forever: boolean
          muted_until: string
          preview_enabled: boolean
          sound: string
        }[]
      }
      enqueue_web_url: {
        Args: {
          p_depth?: number
          p_discovered_from?: string
          p_priority?: number
          p_url: string
        }
        Returns: undefined
      }
      ensure_my_activity_preferences: {
        Args: never
        Returns: {
          created_at: string
          daily_limit_minutes: number
          reminder_enabled: boolean
          reminder_threshold_percent: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_activity_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_my_wallet: { Args: never; Returns: Json }
      ensure_personal_sticker_pack: { Args: never; Returns: string }
      expire_stale_video_calls: {
        Args: { p_stale_after?: string }
        Returns: number
      }
      extract_hashtags: { Args: { content: string }; Returns: string[] }
      finalize_primary_signup: {
        Args: {
          p_display_name: string
          p_email: string
          p_phone: string
          p_tos_version: string
          p_user_id: string
          p_username: string
        }
        Returns: Json
      }
      generate_share_code: { Args: never; Returns: string }
      generate_sku: {
        Args: { p_category_id: string; p_seller_id: string }
        Returns: string
      }
      generate_wallet_account_number: { Args: never; Returns: string }
      get_ad_experiment_results_v4: {
        Args: { p_experiment_id: string }
        Returns: Json
      }
      get_admin_age_stats: { Args: never; Returns: Json }
      get_admin_country_stats: { Args: never; Returns: Json }
      get_admin_dau_trend: { Args: never; Returns: Json }
      get_admin_hourly_activity: { Args: never; Returns: Json }
      get_admin_page_stats: { Args: never; Returns: Json }
      get_admin_platform_stats: { Args: never; Returns: Json }
      get_admin_weekly_pattern: { Args: never; Returns: Json }
      get_conversation_live_locations: {
        Args: { conv_id: string }
        Returns: {
          current_latitude: number
          current_longitude: number
          destination_latitude: number
          destination_longitude: number
          destination_name: string
          expires_at: string
          id: string
          last_updated: string
          message_id: string
          sender_avatar: string
          sender_id: string
          sender_name: string
        }[]
      }
      get_conversation_unreads: {
        Args: { p_conversation_ids: string[]; p_user_id: string }
        Returns: {
          conversation_id: string
          last_message_content: string
          mention_count: number
          unread_count: number
        }[]
      }
      get_data_storage_settings: {
        Args: { p_user_id?: string }
        Returns: {
          auto_download_files_mobile: boolean
          auto_download_files_roaming: boolean
          auto_download_files_wifi: boolean
          auto_download_images_mobile: boolean
          auto_download_images_roaming: boolean
          auto_download_images_wifi: boolean
          auto_download_videos_mobile: boolean
          auto_download_videos_roaming: boolean
          auto_download_videos_wifi: boolean
          data_image_quality: number
        }[]
      }
      get_eligible_ads_v2: {
        Args: {
          p_context?: Json
          p_limit?: number
          p_placement: string
          p_session_id?: string
        }
        Returns: {
          ad_account_id: string | null
          ad_set_v2_id: string | null
          ad_type: string
          bid_amount: number | null
          billing_type: string
          budget: number
          call_to_action: string | null
          campaign_v2_id: string | null
          clicks_count: number
          created_at: string
          creative_v2_id: string | null
          daily_budget: number | null
          delivery_item_v2_id: string | null
          description: string | null
          destination_url: string | null
          end_date: string | null
          id: string
          impressions_count: number
          media_type: string
          media_url: string
          reach_count: number
          spent: number
          start_date: string | null
          status: string
          target_age_max: number | null
          target_age_min: number | null
          target_countries: string[] | null
          target_gender: string | null
          target_interests: string[] | null
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_eligible_ads_v4: {
        Args: {
          p_context?: Json
          p_limit?: number
          p_placement: string
          p_session_id?: string
        }
        Returns: {
          ad_account_id: string | null
          ad_set_v2_id: string | null
          ad_type: string
          bid_amount: number | null
          billing_type: string
          budget: number
          call_to_action: string | null
          campaign_v2_id: string | null
          clicks_count: number
          created_at: string
          creative_v2_id: string | null
          daily_budget: number | null
          delivery_item_v2_id: string | null
          description: string | null
          destination_url: string | null
          end_date: string | null
          id: string
          impressions_count: number
          media_type: string
          media_url: string
          reach_count: number
          spent: number
          start_date: string | null
          status: string
          target_age_max: number | null
          target_age_min: number | null
          target_countries: string[] | null
          target_gender: string | null
          target_interests: string[] | null
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_eligible_ads_v5: {
        Args: {
          p_context?: Json
          p_limit?: number
          p_placement: string
          p_session_id?: string
        }
        Returns: {
          ad_account_id: string | null
          ad_set_v2_id: string | null
          ad_type: string
          bid_amount: number | null
          billing_type: string
          budget: number
          call_to_action: string | null
          campaign_v2_id: string | null
          clicks_count: number
          created_at: string
          creative_v2_id: string | null
          daily_budget: number | null
          delivery_item_v2_id: string | null
          description: string | null
          destination_url: string | null
          end_date: string | null
          id: string
          impressions_count: number
          media_type: string
          media_url: string
          reach_count: number
          spent: number
          start_date: string | null
          status: string
          target_age_max: number | null
          target_age_min: number | null
          target_countries: string[] | null
          target_gender: string | null
          target_interests: string[] | null
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_email_for_identifier: {
        Args: { _identifier: string }
        Returns: string
      }
      get_last_messages: {
        Args: { p_conversation_ids: string[] }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          sender_id: string
        }[]
      }
      get_live_stream_viewer_count: {
        Args: { p_stream_id: string }
        Returns: number
      }
      get_message_location: {
        Args: { msg_metadata: Json }
        Returns: {
          latitude: number
          location_name: string
          location_type: string
          longitude: number
        }[]
      }
      get_my_account_control_v3: { Args: never; Returns: Json }
      get_my_ads_workspace_v4: { Args: never; Returns: Json }
      get_my_identity_phone: {
        Args: never
        Returns: {
          phone: string
          phone_verified_at: string
        }[]
      }
      get_nearby_check_ins: {
        Args: {
          lat: number
          limit_count?: number
          lon: number
          radius_km?: number
        }
        Returns: {
          created_at: string
          distance_km: number
          feeling: string
          id: string
          latitude: number
          longitude: number
          note: string
          place_name: string
          user_id: string
        }[]
      }
      get_place_reviews: {
        Args: { limit_count?: number; place_id_param: string }
        Returns: {
          category_ratings: Json
          created_at: string
          helpful_count: number
          id: string
          photo_urls: string[]
          rating: number
          review_text: string
          user_has_voted: boolean
          user_id: string
          visit_date: string
        }[]
      }
      get_post_insights: {
        Args: { p_days?: number; p_post_id: string }
        Returns: Json
      }
      get_product_review_summary: {
        Args: { _product_id: string }
        Returns: {
          average_rating: number
          review_count: number
        }[]
      }
      get_profile_private: {
        Args: { p_profile_id: string }
        Returns: {
          birth_date: string
          country: string
          email_filters: Json
          id: string
          notification_preferences: Json
          preferences: Json
          signatures: Json
        }[]
      }
      get_rls_audit_report: {
        Args: never
        Returns: {
          audit_status: string
          policy_count: number
          rls_enabled: boolean
          rls_forced: boolean
          schema_name: string
          table_name: string
        }[]
      }
      get_seller_response_stats: {
        Args: { _seller_user_id: string }
        Returns: {
          average_response_minutes: number
          conversations_count: number
          is_online: boolean
          last_seen: string
          response_rate: number
        }[]
      }
      get_unique_view_counts: {
        Args: { post_ids: string[] }
        Returns: {
          count: number
          post_id: string
        }[]
      }
      get_video_heatmap: {
        Args: { post_id_param: string }
        Returns: {
          bucket: number
          views: number
        }[]
      }
      get_video_watch_stats: {
        Args: { post_id_param: string }
        Returns: {
          avg_retention: number
          avg_watched_seconds: number
          completion_rate: number
          sessions: number
        }[]
      }
      get_visible_presence: {
        Args: { target_user_id: string }
        Returns: {
          is_online: boolean
          last_seen: string
          user_id: string
        }[]
      }
      grant_admin_role: { Args: { target_user_id: string }; Returns: boolean }
      grant_admin_role_v2: {
        Args: { p_role_key: string; p_target_user_id: string }
        Returns: string
      }
      has_ad_account_access: {
        Args: { p_account_id: string; p_user_id?: string }
        Returns: boolean
      }
      has_admin_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_admin_role: {
        Args: { _role_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_video_call:
        | {
            Args: {
              p_call_id: string
              p_device_info?: Json
              p_is_hand_raised?: boolean
              p_is_muted?: boolean
              p_is_screen_sharing?: boolean
              p_is_video_on?: boolean
            }
            Returns: boolean
          }
        | {
            Args: {
              p_call_id: string
              p_device_info?: Json
              p_is_hand_raised?: boolean
              p_is_muted?: boolean
              p_is_screen_sharing?: boolean
              p_is_video_on?: boolean
            }
            Returns: boolean
          }
      images: {
        Args: { p: Database["public"]["Tables"]["products"]["Row"] }
        Returns: string[]
      }
      increment_post_views: {
        Args: { post_id_param: string }
        Returns: undefined
      }
      increment_product_views: {
        Args: { _product_id: string }
        Returns: undefined
      }
      increment_route_use_count: {
        Args: { route_id: string }
        Returns: undefined
      }
      invite_post_collaborator: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: string
      }
      invite_to_video_call: {
        Args: { p_call_id: string; p_call_type?: string; p_invitee_id: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_staff: { Args: { _user_id: string }; Returns: boolean }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      is_call_participant: {
        Args: { _call_id: string; _user_id: string }
        Returns: boolean
      }
      is_channel_admin: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_channel_member: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_admin:
        | {
            Args: { p_conversation_id: string; p_user_id: string }
            Returns: boolean
          }
        | { Args: { target: string }; Returns: boolean }
      is_conversation_member: { Args: { target: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_restricted: {
        Args: { p_conversation_id: string; p_kind?: string; p_user_id: string }
        Returns: boolean
      }
      is_my_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_post_poll_expired: { Args: { p_post_id: string }; Returns: boolean }
      is_reserved_username: { Args: { p_username: string }; Returns: boolean }
      is_sticker_moderator: { Args: never; Returns: boolean }
      is_user_admin: { Args: { user_id: string }; Returns: boolean }
      is_username_available: {
        Args: { p_current_user_id?: string; p_username: string }
        Returns: boolean
      }
      join_channel_by_invite: { Args: { _code: string }; Returns: string }
      join_video_call: {
        Args: { p_call_id: string; p_is_video_on?: boolean }
        Returns: undefined
      }
      join_video_call_guarded: {
        Args: { p_call_id: string; p_is_video_on?: boolean }
        Returns: Json
      }
      leave_post_collaboration: {
        Args: { p_collaboration_id: string }
        Returns: boolean
      }
      leave_video_call: { Args: { p_call_id: string }; Returns: Json }
      log_admin_action:
        | {
            Args: {
              action_details?: Json
              action_type: string
              target_user_id?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_action: string
              p_conversation_id: string
              p_details?: Json
              p_target_user_id?: string
            }
            Returns: string
          }
      log_sticker_usage: {
        Args: {
          p_context?: string
          p_sticker_id?: string
          p_sticker_key: string
        }
        Returns: undefined
      }
      manage_platform_feedback: {
        Args: {
          p_assigned_to?: string
          p_feedback_id: string
          p_priority?: string
          p_resolution_note?: string
          p_set_assignment?: boolean
          p_status?: string
        }
        Returns: {
          assigned_to: string | null
          attachments: string[]
          category: string
          contact_allowed: boolean
          created_at: string
          description: string
          diagnostics: Json
          id: string
          last_activity_at: string
          last_response_by: string | null
          priority: string
          rating: number | null
          reference_code: string
          resolution_note: string | null
          source_route: string | null
          source_url: string | null
          staff_last_viewed_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          user_last_viewed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "platform_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_platform_feedback_viewed: {
        Args: { p_feedback_id: string }
        Returns: boolean
      }
      mark_video_call_missed: {
        Args: { p_call_id: string }
        Returns: undefined
      }
      marketplace_add_shipment_event: {
        Args: {
          _country_code?: string
          _description?: string
          _event_code: string
          _location?: string
          _occurred_at?: string
          _shipment_id: string
          _status: string
          _title: string
        }
        Returns: Json
      }
      marketplace_create_shipment: {
        Args: {
          _carrier_name?: string
          _destination_country?: string
          _estimated_delivery_at?: string
          _incoterm?: string
          _order_id: string
          _origin_country?: string
          _service_level?: string
          _tracking_number?: string
          _transport_mode?: string
        }
        Returns: Json
      }
      marketplace_generate_handoff_code: { Args: never; Returns: string }
      marketplace_generate_order_number: { Args: never; Returns: string }
      marketplace_generate_receipt_number: { Args: never; Returns: string }
      marketplace_quote_shipping: {
        Args: {
          _destination_country_code: string
          _incoterm?: string
          _service_level?: string
        }
        Returns: Json
      }
      marketplace_update_order_status: {
        Args: { _order_id: string; _reason?: string; _status: string }
        Returns: Json
      }
      marketplace_upsert_customs_declaration: {
        Args: {
          _currency?: string
          _declared_value?: number
          _destination_country?: string
          _duty_amount?: number
          _fees_amount?: number
          _hs_code?: string
          _incoterm?: string
          _invoice_number?: string
          _notes?: string
          _origin_country?: string
          _shipment_id: string
          _tax_amount?: number
        }
        Returns: Json
      }
      marketplace_verify_order_handoff: {
        Args: { _code: string }
        Returns: Json
      }
      mini_app_api_authenticate: {
        Args: { p_client_id: string; p_secret: string }
        Returns: Json
      }
      mini_app_api_stats: { Args: { p_app_id: string }; Returns: Json }
      mini_app_can_manage: { Args: { p_app_id: string }; Returns: boolean }
      mini_app_credential_create: {
        Args: { p_app_id: string; p_environment?: string; p_label?: string }
        Returns: Json
      }
      mini_app_credential_revoke: {
        Args: { p_credential_id: string }
        Returns: boolean
      }
      mini_app_credential_rotate: {
        Args: { p_credential_id: string }
        Returns: Json
      }
      mini_app_credential_set_webhook: {
        Args: { p_credential_id: string; p_secret?: string; p_url: string }
        Returns: boolean
      }
      mini_app_credentials_list: { Args: { p_app_id: string }; Returns: Json }
      mini_app_dequeue_updates: {
        Args: { p_app_id: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      mini_app_detail: { Args: { p_handle_or_id: string }; Returns: Json }
      mini_app_handle_available: { Args: { p_handle: string }; Returns: Json }
      mini_app_is_service_role: { Args: never; Returns: boolean }
      mini_app_moderation_queue: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: {
          app_id: string
          app_type: string
          icon_url: string
          name: string
          open_reports: number
          publisher_handle: string
          publisher_id: string
          publisher_name: string
          publisher_verification: string
          slug: string
          status: string
          submitted_at: string
          url: string
        }[]
      }
      mini_app_notify_user: {
        Args: {
          p_action_url?: string
          p_app_id: string
          p_body?: string
          p_payload?: Json
          p_title?: string
          p_user_id: string
        }
        Returns: string
      }
      mini_app_payment_cancel: { Args: { p_payment_id: string }; Returns: Json }
      mini_app_payment_confirm: {
        Args: { p_idempotency_key: string; p_payment_id: string }
        Returns: Json
      }
      mini_app_payment_create: {
        Args: {
          p_amount: number
          p_app_id: string
          p_currency?: string
          p_description?: string
        }
        Returns: string
      }
      mini_app_payment_set_status: {
        Args: {
          p_external_id?: string
          p_payload?: Json
          p_payment_id: string
          p_provider?: string
          p_status: string
        }
        Returns: undefined
      }
      mini_app_publisher_add_domain: {
        Args: { p_domain: string; p_publisher_id: string }
        Returns: {
          domain_id: string
          verification_token: string
        }[]
      }
      mini_app_publisher_create: {
        Args: { p_handle: string; p_name: string; p_type?: string }
        Returns: string
      }
      mini_app_publisher_domain_result: {
        Args: { p_domain_id: string; p_error?: string; p_verified: boolean }
        Returns: undefined
      }
      mini_app_push_update: {
        Args: { p_app_id: string; p_payload?: Json; p_type: string }
        Returns: Json
      }
      mini_app_rate: {
        Args: { p_app_id: string; p_comment?: string; p_rating: number }
        Returns: undefined
      }
      mini_app_report: {
        Args: { p_app_id: string; p_details?: string; p_reason: string }
        Returns: undefined
      }
      mini_app_report_frame_block: {
        Args: { p_app_id: string }
        Returns: boolean
      }
      mini_app_secret_hash: { Args: { p_secret: string }; Returns: string }
      mini_app_set_frame_result: {
        Args: { p_app_id: string; p_blocked: boolean; p_error?: string }
        Returns: undefined
      }
      mini_app_set_install: {
        Args: { p_app_id: string; p_installed: boolean; p_pinned?: boolean }
        Returns: undefined
      }
      mini_app_set_status: {
        Args: { p_app_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      mini_app_sync_rating: { Args: { p_app_id: string }; Returns: undefined }
      mini_app_track_event: {
        Args: {
          p_app_id: string
          p_duration_ms?: number
          p_error_code?: string
          p_event: string
          p_platform?: string
          p_session_id?: string
        }
        Returns: undefined
      }
      mini_apps_feed: {
        Args: {
          p_app_type?: string
          p_category?: string
          p_limit?: number
          p_locale?: string
          p_offset?: number
          p_price_model?: string
          p_query?: string
          p_section?: string
          p_sort?: string
          p_verified_only?: boolean
        }
        Returns: {
          app_id: string
          app_type: string
          author_avatar_url: string
          author_display_name: string
          author_username: string
          category: string
          created_at: string
          deep_link: string
          description: string
          display_mode: string
          frame_blocked: boolean
          handle: string
          icon_url: string
          is_installed: boolean
          is_pinned: boolean
          name: string
          opens_30d: number
          owner_id: string
          permissions: Json
          price_model: string
          privacy_url: string
          publisher_handle: string
          publisher_id: string
          publisher_name: string
          publisher_type: string
          publisher_verification: string
          rating: number
          rating_count: number
          score: number
          screenshots: Json
          short_description: string
          support_url: string
          total_count: number
          updated_at: string
          url: string
          users_count: number
        }[]
      }
      my_active_live_locations: {
        Args: never
        Returns: {
          live_until: string
          post_id: string
        }[]
      }
      my_contact_suggestions: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          is_following: boolean
          last_seen_at: string
          mutual_count: number
          user_id: string
          username: string
        }[]
      }
      my_search_insights_v2: {
        Args: { p_days?: number; p_limit?: number; p_query_contains?: string }
        Returns: Json
      }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
      normalize_search_activity_query: {
        Args: { p_query: string }
        Returns: string
      }
      owns_post: { Args: { p_post_id: string }; Returns: boolean }
      owns_structured_post_compat: {
        Args: { p_post_id: string }
        Returns: boolean
      }
      payme_wallet_cancel_transaction: {
        Args: { _payme_id: string; _reason: number }
        Returns: Json
      }
      payme_wallet_check_intent: {
        Args: { _amount_tiyin: number; _intent_id: string }
        Returns: Json
      }
      payme_wallet_check_transaction: {
        Args: { _payme_id: string }
        Returns: Json
      }
      payme_wallet_create_transaction: {
        Args: {
          _amount_tiyin: number
          _intent_id: string
          _payme_id: string
          _payme_time: number
        }
        Returns: Json
      }
      payme_wallet_perform_transaction: {
        Args: { _payme_id: string }
        Returns: Json
      }
      pending_sticker_moderation: {
        Args: { p_limit?: number }
        Returns: {
          full_url: string
          nsfw_labels: Json
          nsfw_score: number
          owner_id: string
          pack_id: string
          pack_name: string
          preview_url: string
          report_count: number
          sticker_id: string
          submitted_at: string
        }[]
      }
      place_rating_summary: {
        Args: { p_place_key: string }
        Returns: {
          average_rating: number
          review_count: number
        }[]
      }
      poll_slider_summary: {
        Args: { p_poll_id: string }
        Returns: {
          average_value: number
          max_voted: number
          median_value: number
          min_voted: number
          vote_count: number
        }[]
      }
      popular_stickers: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          emoji: string | null
          file_size: number | null
          file_url: string | null
          full_url: string | null
          height: number | null
          id: string
          image_url: string | null
          is_public: boolean
          keywords: string[]
          kind: Database["public"]["Enums"]["sticker_kind"]
          lottie_url: string | null
          moderation_reason: string | null
          moderation_status: Database["public"]["Enums"]["sticker_moderation_status"]
          name: string | null
          nsfw_checked_at: string | null
          nsfw_labels: Json | null
          nsfw_score: number | null
          pack_id: string
          position: number
          preview_url: string | null
          storage_path: string | null
          thumb_url: string | null
          thumbnail_url: string | null
          type: string | null
          usage_count: number
          use_count: number
          video_url: string | null
          width: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "stickers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      process_marketplace_international_order: {
        Args: {
          _destination_country_code: string
          _incoterm?: string
          _notes?: string
          _payment_method: string
          _service_level?: string
          _shipping_address: Json
        }
        Returns: Json
      }
      process_marketplace_order: {
        Args: {
          _notes?: string
          _payment_method: string
          _shipping_address: Json
        }
        Returns: Json
      }
      prune_ad_delivery_raw_v3: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      prune_auth_devices: { Args: never; Returns: undefined }
      prune_auth_ephemeral: { Args: never; Returns: undefined }
      prune_function_usage: { Args: never; Returns: undefined }
      publish_due_scheduled_posts: {
        Args: { p_limit?: number }
        Returns: {
          author_id: string
          post_id: string
          published_time: string
        }[]
      }
      publish_post_draft: { Args: { p_payload: Json }; Returns: string }
      publish_story_draft: { Args: { p_payload: Json }; Returns: Json }
      reap_stale_calls: { Args: { p_stale_seconds?: number }; Returns: Json }
      recalculate_video_recommendation_rank: {
        Args: { post_id_param: string }
        Returns: undefined
      }
      record_ad_conversion_for_user_v4: {
        Args: {
          p_currency?: string
          p_event_id?: string
          p_event_name: string
          p_metadata?: Json
          p_source_url?: string
          p_user_id: string
          p_value?: number
        }
        Returns: string
      }
      record_ad_conversion_v2: {
        Args: {
          p_currency?: string
          p_event_id?: string
          p_event_name: string
          p_metadata?: Json
          p_source_url?: string
          p_value?: number
        }
        Returns: string
      }
      record_ad_delivery_event_v2: {
        Args: {
          p_ad_id: string
          p_device_type?: string
          p_event_key?: string
          p_event_type: string
          p_metadata?: Json
          p_placement: string
          p_score?: number
          p_session_id?: string
          p_slot_key?: string
        }
        Returns: boolean
      }
      record_ad_delivery_event_v4: {
        Args: {
          p_ad_id: string
          p_device_type?: string
          p_event_key?: string
          p_event_type: string
          p_metadata?: Json
          p_placement: string
          p_score?: number
          p_session_id?: string
          p_slot_key?: string
        }
        Returns: boolean
      }
      record_auth_event: {
        Args: {
          p_event_type: string
          p_identity_id?: string
          p_ip?: string
          p_metadata?: Json
          p_outcome?: string
          p_reason?: string
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: undefined
      }
      record_call_quality: {
        Args: {
          p_bitrate_kbps?: number
          p_call_id: string
          p_jitter_ms?: number
          p_metadata?: Json
          p_packets_lost?: number
          p_peer_id?: string
          p_quality?: string
          p_rtt_ms?: number
        }
        Returns: undefined
      }
      record_video_watch: {
        Args: {
          buckets_param?: number[]
          completed_param?: boolean
          duration_seconds_param?: number
          max_position_seconds_param?: number
          post_id_param: string
          watched_seconds_param?: number
        }
        Returns: undefined
      }
      refresh_ad_quality_v3: {
        Args: { p_ad_id: string }
        Returns: {
          ad_id: string
          conversion_rate_30d: number
          ctr_30d: number
          hide_rate_30d: number
          quality_score: number
          report_rate_30d: number
          sample_impressions_30d: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ad_quality_state_v3"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_call_metered_ice_servers: { Args: never; Returns: boolean }
      refresh_hashtags_aggregated: { Args: never; Returns: undefined }
      refresh_mini_app_stats: { Args: never; Returns: undefined }
      refresh_place_statistics: { Args: never; Returns: undefined }
      refresh_popular_searches: { Args: never; Returns: undefined }
      refresh_product_images_cache: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      refund_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      reject_wallet_topup: {
        Args: { _reason?: string; _request_id: string }
        Returns: Json
      }
      release_escrow: {
        Args: { p_escrow_id: string; p_order_id: string }
        Returns: Json
      }
      remove_post_collaborator: {
        Args: { p_collaboration_id: string }
        Returns: string
      }
      reply_platform_feedback: {
        Args: { p_body: string; p_feedback_id: string; p_internal?: boolean }
        Returns: {
          author_role: string
          author_user_id: string | null
          body: string
          created_at: string
          feedback_id: string
          id: string
          is_internal: boolean
        }
        SetofOptions: {
          from: "*"
          to: "platform_feedback_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_content: {
        Args: {
          _details?: string
          _reason: string
          _target_conversation_id: string
          _target_message_id: string
          _target_user_id: string
        }
        Returns: Json
      }
      report_sticker: {
        Args: { p_reason: string; p_sticker_id: string }
        Returns: undefined
      }
      request_public_sticker_pack: {
        Args: { p_pack_id: string }
        Returns: Database["public"]["Enums"]["sticker_moderation_status"]
      }
      request_wallet_topup: {
        Args: {
          _amount: number
          _method: string
          _note?: string
          _proof_url?: string
          _reference?: string
        }
        Returns: Json
      }
      resolve_login_identity: {
        Args: { _identifier: string }
        Returns: {
          identity_id: string
          login_email: string
          migration_status: string
        }[]
      }
      respond_collaboration_invite: {
        Args: { p_collaboration_id: string; p_response: string }
        Returns: Json
      }
      respond_post_collaboration: {
        Args: { p_accept: boolean; p_collaboration_id: string }
        Returns: string
      }
      respond_story_sticker: {
        Args: {
          p_numeric_value?: number
          p_option_index?: number
          p_sticker_id: string
          p_text_answer?: string
        }
        Returns: string
      }
      respond_to_message_request: {
        Args: { _accept: boolean; _conversation_id: string }
        Returns: Json
      }
      review_ad_v2: {
        Args: {
          p_ad_id: string
          p_decision: string
          p_notes?: string
          p_policy_labels?: string[]
          p_reason_code?: string
        }
        Returns: {
          ad_account_id: string | null
          ad_set_v2_id: string | null
          ad_type: string
          bid_amount: number | null
          billing_type: string
          budget: number
          call_to_action: string | null
          campaign_v2_id: string | null
          clicks_count: number
          created_at: string
          creative_v2_id: string | null
          daily_budget: number | null
          delivery_item_v2_id: string | null
          description: string | null
          destination_url: string | null
          end_date: string | null
          id: string
          impressions_count: number
          media_type: string
          media_url: string
          reach_count: number
          spent: number
          start_date: string | null
          status: string
          target_age_max: number | null
          target_age_min: number | null
          target_countries: string[] | null
          target_gender: string | null
          target_interests: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_sticker: {
        Args: { p_approve: boolean; p_reason?: string; p_sticker_id: string }
        Returns: Database["public"]["Enums"]["sticker_moderation_status"]
      }
      revoke_admin_role: { Args: { target_user_id: string }; Returns: boolean }
      revoke_admin_role_v2: {
        Args: { p_role_key: string; p_target_user_id: string }
        Returns: boolean
      }
      revoke_auth_device: {
        Args: { _device_id: string; _reason?: string }
        Returns: string
      }
      revoke_user_sessions: { Args: { p_user_id: string }; Returns: number }
      rtc_maintenance: { Args: never; Returns: Json }
      score_ad_event_risk_v4: {
        Args: {
          p_ad_id: string
          p_device_type?: string
          p_event_type: string
          p_metadata?: Json
          p_placement: string
          p_session_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      search_conversation_hashtag: {
        Args: { p_conversation_id: string; p_tag: string }
        Returns: {
          created_at: string
          message_id: string
        }[]
      }
      search_hashtags: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          id: string
          posts_count: number
          tag: string
        }[]
      }
      search_music_tracks: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          album: string | null
          artist: string | null
          attribution: string | null
          audio_url: string
          bpm: number | null
          cover_url: string | null
          created_at: string
          duration_seconds: number | null
          external_id: string | null
          genre: string | null
          id: string
          ingested_at: string | null
          is_commercial_ok: boolean | null
          is_public: boolean
          language: string | null
          license: string | null
          license_url: string | null
          owner_id: string | null
          popularity: number
          source: Database["public"]["Enums"]["music_source"]
          storage_bucket: string | null
          storage_key: string | null
          title: string
          uses_count: number
          waveform: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "music_tracks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_stickers: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          emoji: string
          full_url: string
          id: string
          kind: Database["public"]["Enums"]["sticker_kind"]
          name: string
          pack_id: string
          pack_name: string
          preview_url: string
        }[]
      }
      search_tags: {
        Args: { search_term: string }
        Returns: {
          last_used_at: string
          post_count: number
          tag: string
        }[]
      }
      search_visible_messages: {
        Args: { p_media_type?: string; p_query: string; p_user_id: string }
        Returns: {
          author_signature: string | null
          auto_delete_at: string | null
          call_id: string | null
          client_message_id: string | null
          comment_count: number
          content: string | null
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          duration_ms: number | null
          edited_at: string | null
          effect_id: string | null
          forwarded_from_message_id: string | null
          forwarded_from_name: string | null
          forwards_count: number
          height: number | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          is_silent: boolean
          live_location_expires_at: string | null
          live_location_stopped_at: string | null
          location_payload: Json | null
          media_file_name: string | null
          media_path: string | null
          media_size_bytes: number | null
          media_type: string | null
          media_url: string | null
          metadata: Json
          mime_type: string | null
          original_content: string | null
          original_post_id: string | null
          reply_to_id: string | null
          sender_id: string | null
          shared_post_id: string | null
          size_bytes: number | null
          story_id: string | null
          thumb_path: string | null
          topic_id: string | null
          updated_at: string | null
          view_count: number
          views_count: number
          waveform: Json | null
          width: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_web_index: {
        Args: {
          p_category?: string
          p_limit?: number
          p_locale?: string
          p_offset?: number
          p_query: string
        }
        Returns: {
          author: string
          display_url: string
          duration_seconds: number
          height: number
          id: string
          published_at: string
          score: number
          snippet: string
          source: string
          thumbnail_url: string
          title: string
          type: string
          url: string
          width: number
        }[]
      }
      select_ad_experiment_variant_v4: {
        Args: {
          p_experiment_id: string
          p_session_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      send_marketplace_notification: {
        Args: {
          p_action_url?: string
          p_body: string
          p_data?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      seo_public_entity: {
        Args: { p_kind: string; p_value: string }
        Returns: Json
      }
      seo_public_sitemap: {
        Args: { p_kind: string; p_limit?: number; p_offset?: number }
        Returns: {
          lastmod: string
          url_path: string
        }[]
      }
      set_ad_delivery_status_v4: {
        Args: { p_ad_id: string; p_status: string }
        Returns: {
          ad_account_id: string | null
          ad_set_v2_id: string | null
          ad_type: string
          bid_amount: number | null
          billing_type: string
          budget: number
          call_to_action: string | null
          campaign_v2_id: string | null
          clicks_count: number
          created_at: string
          creative_v2_id: string | null
          daily_budget: number | null
          delivery_item_v2_id: string | null
          description: string | null
          destination_url: string | null
          end_date: string | null
          id: string
          impressions_count: number
          media_type: string
          media_url: string
          reach_count: number
          spent: number
          start_date: string | null
          status: string
          target_age_max: number | null
          target_age_min: number | null
          target_countries: string[] | null
          target_gender: string | null
          target_interests: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_ad_experiment_status_v4: {
        Args: { p_experiment_id: string; p_status: string }
        Returns: {
          ad_account_id: string
          campaign_id: string
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          metadata: Json
          minimum_sample_size: number
          name: string
          primary_metric: string
          starts_at: string | null
          status: string
          traffic_percent: number
          updated_at: string
          winner_variant_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ad_experiments_v4"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_current_profile_photo: {
        Args: { p_photo_id: string; p_photo_url: string; p_user_id: string }
        Returns: undefined
      }
      set_main_profile_photo: {
        Args: { p_photo_id: string }
        Returns: undefined
      }
      signup_bootstrap_state: {
        Args: { p_user_id: string }
        Returns: {
          account_ok: boolean
          identity_ok: boolean
          profile_ok: boolean
          wallet_ok: boolean
        }[]
      }
      signup_conflict_code: {
        Args: { p_email: string; p_phone: string; p_username: string }
        Returns: string
      }
      signup_preflight: {
        Args: {
          p_email: string
          p_phone: string
          p_user_id?: string
          p_username: string
        }
        Returns: Json
      }
      sticker_upload_quota_used: {
        Args: { p_user_id?: string }
        Returns: number
      }
      stop_live_location_sharing: {
        Args: { live_loc_id: string }
        Returns: undefined
      }
      story_sticker_results: { Args: { p_sticker_id: string }; Returns: Json }
      submit_ad_feedback_v2: {
        Args: {
          p_ad_id: string
          p_feedback_type: string
          p_metadata?: Json
          p_placement: string
        }
        Returns: string
      }
      submit_platform_feedback: {
        Args: {
          p_attachments?: string[]
          p_category: string
          p_contact_allowed?: boolean
          p_description: string
          p_diagnostics?: Json
          p_rating?: number
          p_source_route?: string
          p_source_url?: string
          p_title: string
        }
        Returns: {
          assigned_to: string | null
          attachments: string[]
          category: string
          contact_allowed: boolean
          created_at: string
          description: string
          diagnostics: Json
          id: string
          last_activity_at: string
          last_response_by: string | null
          priority: string
          rating: number | null
          reference_code: string
          resolution_note: string | null
          source_route: string | null
          source_url: string | null
          staff_last_viewed_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          user_last_viewed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "platform_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_my_contact_hashes: {
        Args: { p_email_hashes?: string[]; p_phone_hashes?: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          is_following: boolean
          matched_by: string
          mutual_count: number
          user_id: string
          username: string
        }[]
      }
      terminate_old_user_sessions: { Args: never; Returns: number }
      top_sticker_recents: {
        Args: { p_limit?: number }
        Returns: {
          full_url: string | null
          kind: Database["public"]["Enums"]["sticker_kind"]
          preview_url: string | null
          sticker_id: string | null
          sticker_key: string
          use_count: number
          used_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sticker_recents"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      touch_auth_device: {
        Args: {
          _device_hash: string
          _identity_id: string
          _ip?: string
          _label?: string
          _slot_no: number
          _user_agent?: string
          _user_id: string
        }
        Returns: string
      }
      touch_sticker_recent: {
        Args: {
          p_full_url?: string
          p_kind?: Database["public"]["Enums"]["sticker_kind"]
          p_preview_url?: string
          p_sticker_id?: string
          p_sticker_key: string
        }
        Returns: undefined
      }
      touch_sticker_usage: {
        Args: { p_file_url: string; p_kind?: string; p_sticker_id?: string }
        Returns: undefined
      }
      track_place_visit: {
        Args: {
          p_address?: string
          p_category?: string
          p_device_id?: string
          p_dwell_seconds?: number
          p_latitude: number
          p_longitude: number
          p_name?: string
          p_source?: string
        }
        Returns: string
      }
      track_post_analytics_session: {
        Args: {
          p_completed?: boolean
          p_device_type?: string
          p_dwell_ms?: number
          p_engaged?: boolean
          p_max_position_ms?: number
          p_media_duration_ms?: number
          p_post_id: string
          p_profile_clicked?: boolean
          p_session_id: string
          p_source?: string
          p_watch_ms?: number
        }
        Returns: undefined
      }
      trending_hashtags: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          id: string
          posts_count: number
          recent_count: number
          tag: string
        }[]
      }
      trending_public_posts: {
        Args: { p_limit?: number }
        Returns: {
          bookmarks_count: number | null
          channel_id: string | null
          comments_count: number | null
          content: string | null
          content_search: unknown
          content_type: string
          created_at: string | null
          edit_state: Json | null
          effects_used: string[] | null
          formatted_content: Json | null
          has_poll: boolean
          hashtags: string[] | null
          id: string
          is_hidden: boolean | null
          is_pinned: boolean | null
          likes_count: number | null
          location: string | null
          location_address: string | null
          location_geohash: string | null
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          maturity_rating: string | null
          media_type: string | null
          media_urls: string[] | null
          mentioned_users: string[] | null
          moderation_status: string | null
          poll_data: Json | null
          post_kind: string
          published_at: string | null
          reposts_count: number
          scheduled_at: string | null
          shares_count: number | null
          source_avatar_url: string | null
          source_conversation_id: string | null
          source_id: string | null
          source_message_id: string | null
          source_title: string | null
          source_type: string | null
          status: string
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          video_duration: number | null
          views_count: number
          visibility: string
        }[]
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      trending_stickers: {
        Args: { p_limit?: number; p_window_hours?: number }
        Returns: {
          full_url: string
          kind: Database["public"]["Enums"]["sticker_kind"]
          preview_url: string
          recent_uses: number
          sticker_id: string
          sticker_key: string
          total_uses: number
        }[]
      }
      unblock_user: { Args: { _target: string }; Returns: Json }
      update_ad_campaign_v4: {
        Args: { p_campaign_id: string; p_patch: Json }
        Returns: {
          ad_account_id: string
          attribution_click_days: number
          attribution_view_days: number
          buying_type: string
          created_at: string
          created_by: string
          daily_budget: number | null
          end_at: string | null
          id: string
          lifetime_budget: number | null
          metadata: Json
          name: string
          objective: string
          optimization_goal: string | null
          special_ad_category: string | null
          start_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ad_campaigns_v2"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_live_location_position: {
        Args: {
          live_loc_id: string
          new_accuracy?: number
          new_battery?: number
          new_heading?: number
          new_lat: number
          new_lon: number
          new_speed?: number
        }
        Returns: undefined
      }
      update_my_activity_preferences: {
        Args: {
          p_daily_limit_minutes?: number
          p_reminder_enabled?: boolean
          p_reminder_threshold_percent?: number
        }
        Returns: {
          created_at: string
          daily_limit_minutes: number
          reminder_enabled: boolean
          reminder_threshold_percent: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_activity_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_identity_phone: {
        Args: { p_phone: string }
        Returns: {
          phone: string
          phone_verified_at: string
        }[]
      }
      update_my_profile_details: {
        Args: {
          p_bio: string
          p_birth_date: string
          p_country: string
          p_display_name: string
          p_location: string
          p_phone: string
          p_username: string
          p_website: string
        }
        Returns: Json
      }
      video_job_quota_used: { Args: { p_user_id: string }; Returns: number }
      wallet_lookup_recipient: { Args: { _identifier: string }; Returns: Json }
      wallet_payment: {
        Args: {
          p_amount: number
          p_buyer_id: string
          p_currency?: string
          p_escrow_days?: number
          p_order_id: string
        }
        Returns: Json
      }
      wallet_transfer: {
        Args: {
          _amount: number
          _context_id?: string
          _context_type?: string
          _idempotency_key?: string
          _note?: string
          _recipient: string
        }
        Returns: Json
      }
      wallet_transfer_to_conversation: {
        Args: {
          _amount: number
          _conversation_id: string
          _idempotency_key?: string
          _note?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      media_job_kind:
        | "transcode"
        | "hls"
        | "thumbnail"
        | "audio_mux"
        | "nsfw_scan"
      media_job_status: "queued" | "processing" | "done" | "failed" | "canceled"
      media_kind: "image" | "video" | "audio" | "document" | "archive" | "other"
      music_source:
        | "platform"
        | "device"
        | "jamendo"
        | "audius"
        | "fma"
        | "ccmixter"
        | "pixabay"
      poll_type: "standard" | "quiz" | "image" | "slider" | "rating"
      post_location_mode: "place" | "live"
      sticker_kind: "animated_emoji" | "image" | "gif" | "lottie" | "video"
      sticker_moderation_status: "pending" | "approved" | "rejected"
      sticker_pack_source: "builtin" | "platform" | "giphy" | "user"
      story_sticker_type:
        | "poll"
        | "question"
        | "quiz"
        | "slider"
        | "location"
        | "music"
        | "mention"
        | "hashtag"
        | "link"
        | "countdown"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      media_job_kind: [
        "transcode",
        "hls",
        "thumbnail",
        "audio_mux",
        "nsfw_scan",
      ],
      media_job_status: ["queued", "processing", "done", "failed", "canceled"],
      media_kind: ["image", "video", "audio", "document", "archive", "other"],
      music_source: [
        "platform",
        "device",
        "jamendo",
        "audius",
        "fma",
        "ccmixter",
        "pixabay",
      ],
      poll_type: ["standard", "quiz", "image", "slider", "rating"],
      post_location_mode: ["place", "live"],
      sticker_kind: ["animated_emoji", "image", "gif", "lottie", "video"],
      sticker_moderation_status: ["pending", "approved", "rejected"],
      sticker_pack_source: ["builtin", "platform", "giphy", "user"],
      story_sticker_type: [
        "poll",
        "question",
        "quiz",
        "slider",
        "location",
        "music",
        "mention",
        "hashtag",
        "link",
        "countdown",
      ],
    },
  },
} as const
