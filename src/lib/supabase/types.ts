export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          display_name?: string | null
          avatar_url?: string | null
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          slug: string
          description: string | null
          website: string | null
          logo_url: string | null
          brand_voice: Json
          target_audiences: Json
          competitors: Json
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          slug: string
          description?: string | null
          website?: string | null
          logo_url?: string | null
          brand_voice?: Json
          target_audiences?: Json
          competitors?: Json
          settings?: Json
        }
        Update: {
          name?: string
          slug?: string
          description?: string | null
          website?: string | null
          logo_url?: string | null
          brand_voice?: Json
          target_audiences?: Json
          competitors?: Json
          settings?: Json
        }
      }
      campaigns: {
        Row: {
          id: string
          user_id: string
          project_id: string
          name: string
          description: string | null
          status: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
          channels: string[]
          budget_planned: number | null
          budget_currency: string
          start_date: string | null
          end_date: string | null
          kpis: Json
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id: string
          name: string
          description?: string | null
          status?: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
          channels?: string[]
          budget_planned?: number | null
          budget_currency?: string
          start_date?: string | null
          end_date?: string | null
          kpis?: Json
          metadata?: Json
        }
        Update: {
          name?: string
          description?: string | null
          status?: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
          channels?: string[]
          budget_planned?: number | null
          budget_currency?: string
          start_date?: string | null
          end_date?: string | null
          kpis?: Json
          metadata?: Json
        }
      }
      campaign_metrics: {
        Row: {
          id: string
          campaign_id: string
          user_id: string
          date: string
          channel: string
          impressions: number
          clicks: number
          conversions: number
          spend: number
          revenue: number
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          user_id: string
          date: string
          channel: string
          impressions?: number
          clicks?: number
          conversions?: number
          spend?: number
          revenue?: number
          metadata?: Json
        }
        Update: {
          date?: string
          channel?: string
          impressions?: number
          clicks?: number
          conversions?: number
          spend?: number
          revenue?: number
          metadata?: Json
        }
      }
      ad_briefs: {
        Row: {
          id: string
          user_id: string
          project_id: string
          campaign_id: string | null
          platform: 'meta' | 'google' | 'linkedin' | 'tiktok'
          audience_segment: string
          product_offer: string
          campaign_goal: 'awareness' | 'conversion' | 'engagement'
          tone: string | null
          competitor_context: string[]
          subject_focus: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id: string
          campaign_id?: string | null
          platform: 'meta' | 'google' | 'linkedin' | 'tiktok'
          audience_segment: string
          product_offer: string
          campaign_goal: 'awareness' | 'conversion' | 'engagement'
          tone?: string | null
          competitor_context?: string[]
          subject_focus?: string | null
          metadata?: Json
        }
        Update: {
          platform?: 'meta' | 'google' | 'linkedin' | 'tiktok'
          audience_segment?: string
          product_offer?: string
          campaign_goal?: 'awareness' | 'conversion' | 'engagement'
          tone?: string | null
          competitor_context?: string[]
          subject_focus?: string | null
          metadata?: Json
        }
      }
      ad_copies: {
        Row: {
          id: string
          user_id: string
          brief_id: string
          iteration_number: number
          primary_text: string | null
          headline: string | null
          description: string | null
          cta_button: string | null
          status: string
          evaluation_scores: Json
          weighted_average: number | null
          compliance: Json | null
          refinement_feedback: string | null
          is_best: boolean
          early_stopped: boolean
          early_stop_reason: string | null
          approved_at: string | null
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          brief_id: string
          iteration_number: number
          primary_text?: string | null
          headline?: string | null
          description?: string | null
          cta_button?: string | null
          status?: string
          evaluation_scores?: Json
          weighted_average?: number | null
          compliance?: Json | null
          refinement_feedback?: string | null
          is_best?: boolean
          early_stopped?: boolean
          early_stop_reason?: string | null
        }
        Update: {
          primary_text?: string | null
          headline?: string | null
          description?: string | null
          cta_button?: string | null
          status?: string
          evaluation_scores?: Json
          weighted_average?: number | null
          compliance?: Json | null
          refinement_feedback?: string | null
          is_best?: boolean
          early_stopped?: boolean
          early_stop_reason?: string | null
          approved_at?: string | null
          rejection_reason?: string | null
        }
      }
      ad_insights: {
        Row: {
          id: string
          user_id: string
          project_id: string
          audience_segment: string | null
          campaign_goal: string | null
          dimension: string | null
          insight_type: string
          insight_text: string
          evidence: Json
          sample_count: number
          avg_score_impact: number | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id: string
          audience_segment?: string | null
          campaign_goal?: string | null
          dimension?: string | null
          insight_type: string
          insight_text: string
          evidence?: Json
          sample_count?: number
          avg_score_impact?: number | null
          active?: boolean
        }
        Update: {
          insight_type?: string
          insight_text?: string
          evidence?: Json
          sample_count?: number
          avg_score_impact?: number | null
          active?: boolean
        }
      }
      ai_cost_ledger: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          module: string
          step_name: string | null
          model: string | null
          input_tokens: number
          output_tokens: number
          latency_ms: number | null
          cost_usd: number | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id?: string | null
          module: string
          step_name?: string | null
          model?: string | null
          input_tokens?: number
          output_tokens?: number
          latency_ms?: number | null
          cost_usd?: number | null
          metadata?: Json
        }
        Update: never
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
