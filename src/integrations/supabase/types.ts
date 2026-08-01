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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
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
      ads: {
        Row: {
          ad_type: string
          bid_amount: number | null
          billing_type: string
          budget: number
          call_to_action: string | null
          clicks_count: number
          created_at: string
          daily_budget: number | null
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
          ad_type?: string
          bid_amount?: number | null
          billing_type?: string
          budget?: number
          call_to_action?: string | null
          clicks_count?: number
          created_at?: string
          daily_budget?: number | null
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
          ad_type?: string
          bid_amount?: number | null
          billing_type?: string
          budget?: number
          call_to_action?: string | null
          clicks_count?: number
          created_at?: string
          daily_budget?: number | null
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
      ai_conversations: {
        Row: {
          context: string | null
          created_at: string
          id: string
          messages: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string
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
            foreignKeyName: "call_history_callee_id_fkey"
            columns: ["callee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_history_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          quantity: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
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
      conversations: {
        Row: {
          admin_permissions: Json
          avatar_url: string | null
          created_at: string | null
          description: string | null
          id: string
          invite_code: string | null
          is_encrypted: boolean | null
          is_public: boolean | null
          last_message_at: string | null
          linked_group_id: string | null
          name: string | null
          owner_id: string | null
          slow_mode_seconds: number
          stats_enabled: boolean
          subscriber_count: number | null
          subscribers_count: number | null
          type: string | null
          username: string | null
        }
        Insert: {
          admin_permissions?: Json
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          invite_code?: string | null
          is_encrypted?: boolean | null
          is_public?: boolean | null
          last_message_at?: string | null
          linked_group_id?: string | null
          name?: string | null
          owner_id?: string | null
          slow_mode_seconds?: number
          stats_enabled?: boolean
          subscriber_count?: number | null
          subscribers_count?: number | null
          type?: string | null
          username?: string | null
        }
        Update: {
          admin_permissions?: Json
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          invite_code?: string | null
          is_encrypted?: boolean | null
          is_public?: boolean | null
          last_message_at?: string | null
          linked_group_id?: string | null
          name?: string | null
          owner_id?: string | null
          slow_mode_seconds?: number
          stats_enabled?: boolean
          subscriber_count?: number | null
          subscribers_count?: number | null
          type?: string | null
          username?: string | null
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
          message_id: string | null
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
          message_id?: string | null
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
          message_id?: string | null
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
      mailbox_aliases: {
        Row: {
          alias: string
          user_id: string
        }
        Insert: {
          alias: string
          user_id: string
        }
        Update: {
          alias?: string
          user_id?: string
        }
        Relationships: []
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
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
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
          {
            foreignKeyName: "message_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          client_message_id: string | null
          comment_count: number | null
          content: string | null
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          duration_ms: number | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          forwarded_from_name: string | null
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
          updated_at: string | null
          view_count: number
          waveform: Json | null
          width: number | null
        }
        Insert: {
          client_message_id?: string | null
          comment_count?: number | null
          content?: string | null
          conversation_id: string
          created_at?: string | null
          deleted_at?: string | null
          duration_ms?: number | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          forwarded_from_name?: string | null
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
          updated_at?: string | null
          view_count?: number
          waveform?: Json | null
          width?: number | null
        }
        Update: {
          client_message_id?: string | null
          comment_count?: number | null
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          deleted_at?: string | null
          duration_ms?: number | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          forwarded_from_name?: string | null
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
          updated_at?: string | null
          view_count?: number
          waveform?: Json | null
          width?: number | null
        }
        Relationships: [
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
        ]
      }
      mini_apps: {
        Row: {
          category: string
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          is_approved: boolean
          name: string
          rating: number
          updated_at: string
          url: string
          user_id: string
          users_count: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_approved?: boolean
          name: string
          rating?: number
          updated_at?: string
          url: string
          user_id: string
          users_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_approved?: boolean
          name?: string
          rating?: number
          updated_at?: string
          url?: string
          user_id?: string
          users_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "mini_apps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price: number
          product_id: string
          quantity: number
          title: string
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price: number
          product_id: string
          quantity?: number
          title: string
          total: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price?: number
          product_id?: string
          quantity?: number
          title?: string
          total?: number
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
            foreignKeyName: "order_status_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          cancellation_reason: string | null
          cancelled_at: string | null
          carrier: string | null
          confirmed_by_buyer_at: string | null
          created_at: string
          currency: string | null
          delivered_at: string | null
          failure_reason: string | null
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          receipt_number: string | null
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
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          confirmed_by_buyer_at?: string | null
          created_at?: string
          currency?: string | null
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          notes?: string | null
          order_number: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          receipt_number?: string | null
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
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          confirmed_by_buyer_at?: string | null
          created_at?: string
          currency?: string | null
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          receipt_number?: string | null
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
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "pinned_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string | null
          option_id: string
          post_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          option_id: string
          post_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          option_id?: string
          post_id?: string
          updated_at?: string | null
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
          hashtag: string
          post_id: string
        }
        Insert: {
          created_at?: string
          hashtag: string
          post_id: string
        }
        Update: {
          created_at?: string
          hashtag?: string
          post_id?: string
        }
        Relationships: [
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
          effects_used: string[]
          hashtags: string[]
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
          reposts_count: number
          shares_count: number | null
          source_avatar_url: string | null
          source_conversation_id: string | null
          source_id: string | null
          source_message_id: string | null
          source_title: string | null
          source_type: string | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          video_duration: number | null
          views_count: number
          visibility: string | null
        }
        Insert: {
          bookmarks_count?: number | null
          channel_id?: string | null
          comments_count?: number | null
          content?: string | null
          content_search?: unknown
          content_type?: string
          created_at?: string | null
          effects_used?: string[]
          hashtags?: string[]
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
          reposts_count?: number
          shares_count?: number | null
          source_avatar_url?: string | null
          source_conversation_id?: string | null
          source_id?: string | null
          source_message_id?: string | null
          source_title?: string | null
          source_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
          video_duration?: number | null
          views_count?: number
          visibility?: string | null
        }
        Update: {
          bookmarks_count?: number | null
          channel_id?: string | null
          comments_count?: number | null
          content?: string | null
          content_search?: unknown
          content_type?: string
          created_at?: string | null
          effects_used?: string[]
          hashtags?: string[]
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
          reposts_count?: number
          shares_count?: number | null
          source_avatar_url?: string | null
          source_conversation_id?: string | null
          source_id?: string | null
          source_message_id?: string | null
          source_title?: string | null
          source_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
          video_duration?: number | null
          views_count?: number
          visibility?: string | null
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
          id: string
          position: number | null
          product_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number | null
          product_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number | null
          product_id?: string
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
          {
            foreignKeyName: "product_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "product_reports_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "product_reviews_user_id_fkey"
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
      products: {
        Row: {
          category_id: string | null
          compare_at_price: number | null
          condition: string | null
          created_at: string
          currency: string | null
          description: string | null
          id: string
          is_featured: boolean | null
          is_negotiable: boolean | null
          last_restocked_at: string | null
          likes_count: number | null
          location: string | null
          low_stock_threshold: number | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          moderation_status: string | null
          price: number
          quantity: number | null
          search_vector: unknown
          seller_id: string
          shipping_available: boolean | null
          shipping_price: number | null
          sku: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string
          variants: Json | null
          views_count: number | null
        }
        Insert: {
          category_id?: string | null
          compare_at_price?: number | null
          condition?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_negotiable?: boolean | null
          last_restocked_at?: string | null
          likes_count?: number | null
          location?: string | null
          low_stock_threshold?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string | null
          price: number
          quantity?: number | null
          search_vector?: unknown
          seller_id: string
          shipping_available?: boolean | null
          shipping_price?: number | null
          sku?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          variants?: Json | null
          views_count?: number | null
        }
        Update: {
          category_id?: string | null
          compare_at_price?: number | null
          condition?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_negotiable?: boolean | null
          last_restocked_at?: string | null
          likes_count?: number | null
          location?: string | null
          low_stock_threshold?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string | null
          price?: number
          quantity?: number | null
          search_vector?: unknown
          seller_id?: string
          shipping_available?: boolean | null
          shipping_price?: number | null
          sku?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          variants?: Json | null
          views_count?: number | null
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
            foreignKeyName: "products_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          country: string | null
          cover_url: string | null
          created_at: string | null
          display_name: string | null
          email_filters: Json | null
          followers_count: number | null
          following_count: number | null
          id: string
          is_admin: boolean
          is_online: boolean | null
          is_verified: boolean | null
          last_seen: string | null
          location: string | null
          notification_preferences: Json | null
          posts_count: number | null
          preferences: Json | null
          role: string | null
          signatures: Json | null
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
          email_filters?: Json | null
          followers_count?: number | null
          following_count?: number | null
          id: string
          is_admin?: boolean
          is_online?: boolean | null
          is_verified?: boolean | null
          last_seen?: string | null
          location?: string | null
          notification_preferences?: Json | null
          posts_count?: number | null
          preferences?: Json | null
          role?: string | null
          signatures?: Json | null
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
          email_filters?: Json | null
          followers_count?: number | null
          following_count?: number | null
          id?: string
          is_admin?: boolean
          is_online?: boolean | null
          is_verified?: boolean | null
          last_seen?: string | null
          location?: string | null
          notification_preferences?: Json | null
          posts_count?: number | null
          preferences?: Json | null
          role?: string | null
          signatures?: Json | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
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
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
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
        Relationships: [
          {
            foreignKeyName: "reserved_usernames_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserved_usernames_released_to_fkey"
            columns: ["released_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserved_usernames_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string
          icon: string | null
          id: string
          is_favorite: boolean | null
          latitude: number
          list_id: string | null
          longitude: number
          name: string
          notes: string | null
          updated_at: string
          user_id: string
          visited_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_favorite?: boolean | null
          latitude: number
          list_id?: string | null
          longitude: number
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
          visited_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_favorite?: boolean | null
          latitude?: number
          list_id?: string | null
          longitude?: number
          name?: string
          notes?: string | null
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
            foreignKeyName: "seller_verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      sticker_packs: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          is_public: boolean
          owner_id: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          owner_id?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          owner_id?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticker_packs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stickers: {
        Row: {
          created_at: string
          emoji: string | null
          id: string
          image_url: string
          keywords: string[]
          pack_id: string
          position: number
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          id?: string
          image_url: string
          keywords?: string[]
          pack_id: string
          position?: number
        }
        Update: {
          created_at?: string
          emoji?: string | null
          id?: string
          image_url?: string
          keywords?: string[]
          pack_id?: string
          position?: number
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
          is_active: boolean | null
          media_type: string | null
          media_url: string
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
          is_active?: boolean | null
          media_type?: string | null
          media_url: string
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
          is_active?: boolean | null
          media_type?: string | null
          media_url?: string
          text_overlay?: string | null
          user_id?: string
          views_count?: number | null
        }
        Relationships: [
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
          blocked_user_id: string
          blocker_id: string
          created_at: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          blocked_user_id: string
          blocker_id: string
          created_at?: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
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
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          user_id: string
        }
        Insert: {
          added_at?: string
          pack_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          pack_id?: string
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
          {
            foreignKeyName: "user_sticker_packs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          call_type: string | null
          conversation_id: string | null
          created_at: string | null
          ended_at: string | null
          host_id: string
          id: string
          max_participants: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          call_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          max_participants?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          call_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          max_participants?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_calls_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
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
    }
    Views: {
      hashtags: {
        Row: {
          last_used_at: string | null
          post_count: number | null
          tag: string | null
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
      popular_product_searches: {
        Row: {
          last_searched_at: string | null
          query: string | null
          search_count: number | null
        }
        Relationships: []
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
      admin_bulk_reserve: {
        Args: { p_category: string; p_reason?: string; p_usernames: string[] }
        Returns: {
          inserted: number
          skipped: number
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
      admin_unreserve_username: {
        Args: { p_username: string }
        Returns: boolean
      }
      are_contacts: { Args: { a: string; b: string }; Returns: boolean }
      block_user: { Args: { _reason?: string; _target: string }; Returns: Json }
      can_dm_user: {
        Args: { p_recipient_id: string; p_sender_id: string }
        Returns: boolean
      }
      can_join_conversation: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      can_moderate_live_stream: {
        Args: { p_stream_id: string; p_user_id: string }
        Returns: boolean
      }
      can_read_conversation: {
        Args: { p_conversation_id: string; p_user_id: string }
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
      can_view_presence: { Args: { target_user_id: string }; Returns: boolean }
      can_view_profile_field: {
        Args: { field_name: string; target_user_id: string }
        Returns: boolean
      }
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
          email_filters: Json | null
          followers_count: number | null
          following_count: number | null
          id: string
          is_admin: boolean
          is_online: boolean | null
          is_verified: boolean | null
          last_seen: string | null
          location: string | null
          notification_preferences: Json | null
          posts_count: number | null
          preferences: Json | null
          role: string | null
          signatures: Json | null
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
      cleanup_expired_stories: { Args: never; Returns: undefined }
      cleanup_old_search_cache: { Args: never; Returns: undefined }
      cleanup_old_search_history: { Args: never; Returns: undefined }
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
      create_message_report: {
        Args: {
          p_conversation_id: string
          p_details?: string
          p_message_id: string
          p_reason: string
        }
        Returns: string
      }
      create_video_call: {
        Args: {
          p_call_type?: string
          p_conversation_id: string
          p_is_video_on?: boolean
        }
        Returns: string
      }
      decline_video_call: { Args: { p_call_id: string }; Returns: undefined }
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
      extract_hashtags: { Args: { content: string }; Returns: string[] }
      generate_share_code: { Args: never; Returns: string }
      generate_sku: {
        Args: { p_category_id: string; p_seller_id: string }
        Returns: string
      }
      get_admin_age_stats: { Args: never; Returns: Json }
      get_admin_country_stats: { Args: never; Returns: Json }
      get_admin_dau_trend: { Args: never; Returns: Json }
      get_admin_hourly_activity: { Args: never; Returns: Json }
      get_admin_page_stats: { Args: never; Returns: Json }
      get_admin_platform_stats: { Args: never; Returns: Json }
      get_admin_weekly_pattern: { Args: never; Returns: Json }
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
      get_email_for_identifier: {
        Args: { _identifier: string }
        Returns: string
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
      get_unique_view_counts: {
        Args: { post_ids: string[] }
        Returns: {
          count: number
          post_id: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_inbound_email: {
        Args: {
          p_body_html: string
          p_body_text: string
          p_from_email: string
          p_from_name: string
          p_message_id: string
          p_secret: string
          p_subject: string
          p_to: string
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
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
      is_conversation_admin: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_restricted: {
        Args: { p_conversation_id: string; p_kind?: string; p_user_id: string }
        Returns: boolean
      }
      is_post_poll_expired: { Args: { p_post_id: string }; Returns: boolean }
      is_reserved_username: { Args: { p_username: string }; Returns: boolean }
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
      process_marketplace_order: {
        Args: {
          _notes?: string
          _payment_method: string
          _shipping_address: Json
        }
        Returns: Json
      }
      refresh_hashtags_aggregated: { Args: never; Returns: undefined }
      refresh_popular_searches: { Args: never; Returns: undefined }
      refund_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      release_escrow: {
        Args: { p_escrow_id: string; p_order_id: string }
        Returns: Json
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
      respond_to_message_request: {
        Args: { _accept: boolean; _conversation_id: string }
        Returns: Json
      }
      revoke_admin_role: { Args: { target_user_id: string }; Returns: boolean }
      search_conversation_hashtag: {
        Args: { p_conversation_id: string; p_tag: string }
        Returns: {
          created_at: string
          message_id: string
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
          client_message_id: string | null
          comment_count: number | null
          content: string | null
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          duration_ms: number | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          forwarded_from_name: string | null
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
          updated_at: string | null
          view_count: number
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
      set_current_profile_photo: {
        Args: { p_photo_id: string; p_photo_url: string; p_user_id: string }
        Returns: undefined
      }
      terminate_old_user_sessions: { Args: never; Returns: number }
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
          effects_used: string[]
          hashtags: string[]
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
          reposts_count: number
          shares_count: number | null
          source_avatar_url: string | null
          source_conversation_id: string | null
          source_id: string | null
          source_message_id: string | null
          source_title: string | null
          source_type: string | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          video_duration: number | null
          views_count: number
          visibility: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      unblock_user: { Args: { _target: string }; Returns: Json }
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
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
    },
  },
} as const
