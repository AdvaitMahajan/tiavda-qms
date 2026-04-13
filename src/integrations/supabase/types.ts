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
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          city: string
          company: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          email_bounced: boolean | null
          id: string
          name: string
          notes: string | null
          phone: string
          pincode: string | null
          source: string | null
          state: string | null
          updated_at: string
          whatsapp_invalid: boolean | null
          whatsapp_number: string | null
        }
        Insert: {
          city: string
          company?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_bounced?: boolean | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          pincode?: string | null
          source?: string | null
          state?: string | null
          updated_at?: string
          whatsapp_invalid?: boolean | null
          whatsapp_number?: string | null
        }
        Update: {
          city?: string
          company?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_bounced?: boolean | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          pincode?: string | null
          source?: string | null
          state?: string | null
          updated_at?: string
          whatsapp_invalid?: boolean | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      communication_log: {
        Row: {
          attachments: Json | null
          body: string
          channel: Database["public"]["Enums"]["comm_channel"]
          client_id: string
          created_at: string
          direction: Database["public"]["Enums"]["comm_direction"]
          enquiry_id: string
          error_detail: Json | null
          external_msg_id: string | null
          id: string
          sent_by: string | null
          status: string | null
          subject: string | null
          template_id: string | null
        }
        Insert: {
          attachments?: Json | null
          body: string
          channel: Database["public"]["Enums"]["comm_channel"]
          client_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["comm_direction"]
          enquiry_id: string
          error_detail?: Json | null
          external_msg_id?: string | null
          id?: string
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          attachments?: Json | null
          body?: string
          channel?: Database["public"]["Enums"]["comm_channel"]
          client_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["comm_direction"]
          enquiry_id?: string
          error_detail?: Json | null
          external_msg_id?: string | null
          id?: string
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiries: {
        Row: {
          assigned_to: string | null
          client_id: string
          confirmed_date: string | null
          created_at: string
          deleted_at: string | null
          enquiry_date: string
          expected_depth_m: number | null
          id: string
          lost_date: string | null
          lost_reason: string | null
          next_follow_up: string | null
          num_bores: number
          ref_number: string
          remarks: string | null
          site_address: string
          site_city: string
          soil_type_hint: Database["public"]["Enums"]["soil_type"] | null
          status: Database["public"]["Enums"]["lead_status"]
          structure_type: Database["public"]["Enums"]["structure_type"]
          submission_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          confirmed_date?: string | null
          created_at?: string
          deleted_at?: string | null
          enquiry_date?: string
          expected_depth_m?: number | null
          id?: string
          lost_date?: string | null
          lost_reason?: string | null
          next_follow_up?: string | null
          num_bores: number
          ref_number?: string
          remarks?: string | null
          site_address: string
          site_city: string
          soil_type_hint?: Database["public"]["Enums"]["soil_type"] | null
          status?: Database["public"]["Enums"]["lead_status"]
          structure_type: Database["public"]["Enums"]["structure_type"]
          submission_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          confirmed_date?: string | null
          created_at?: string
          deleted_at?: string | null
          enquiry_date?: string
          expected_depth_m?: number | null
          id?: string
          lost_date?: string | null
          lost_reason?: string | null
          next_follow_up?: string | null
          num_bores?: number
          ref_number?: string
          remarks?: string | null
          site_address?: string
          site_city?: string
          soil_type_hint?: Database["public"]["Enums"]["soil_type"] | null
          status?: Database["public"]["Enums"]["lead_status"]
          structure_type?: Database["public"]["Enums"]["structure_type"]
          submission_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_events: {
        Row: {
          created_at: string
          enquiry_id: string
          event_type: string
          from_status: Database["public"]["Enums"]["lead_status"] | null
          id: string
          metadata: Json | null
          to_status: Database["public"]["Enums"]["lead_status"] | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          enquiry_id: string
          event_type: string
          from_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          metadata?: Json | null
          to_status?: Database["public"]["Enums"]["lead_status"] | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          enquiry_id?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          metadata?: Json | null
          to_status?: Database["public"]["Enums"]["lead_status"] | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_events_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          assigned_to: string | null
          auto_scheduled: boolean | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          enquiry_id: string
          id: string
          notes: string | null
          outcome: Database["public"]["Enums"]["followup_outcome"]
          outcome_notes: string | null
          reminder_sent: boolean | null
          scheduled_date: string
          scheduled_time: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_scheduled?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          enquiry_id: string
          id?: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["followup_outcome"]
          outcome_notes?: string | null
          reminder_sent?: boolean | null
          scheduled_date: string
          scheduled_time?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_scheduled?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          enquiry_id?: string
          id?: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["followup_outcome"]
          outcome_notes?: string | null
          reminder_sent?: boolean | null
          scheduled_date?: string
          scheduled_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_submissions: {
        Row: {
          attachments: Json | null
          basement_floors: number | null
          client_id: string | null
          expected_depth_m: number | null
          id: string
          ip_address: unknown
          num_bores: number
          num_floors: number | null
          remarks: string | null
          site_address: string
          site_city: string
          site_pincode: string | null
          site_state: string | null
          soil_type_hint: Database["public"]["Enums"]["soil_type"] | null
          structure_type: Database["public"]["Enums"]["structure_type"]
          submitted_at: string
          token_id: string
          user_agent: string | null
        }
        Insert: {
          attachments?: Json | null
          basement_floors?: number | null
          client_id?: string | null
          expected_depth_m?: number | null
          id?: string
          ip_address?: unknown
          num_bores: number
          num_floors?: number | null
          remarks?: string | null
          site_address: string
          site_city: string
          site_pincode?: string | null
          site_state?: string | null
          soil_type_hint?: Database["public"]["Enums"]["soil_type"] | null
          structure_type: Database["public"]["Enums"]["structure_type"]
          submitted_at?: string
          token_id: string
          user_agent?: string | null
        }
        Update: {
          attachments?: Json | null
          basement_floors?: number | null
          client_id?: string | null
          expected_depth_m?: number | null
          id?: string
          ip_address?: unknown
          num_bores?: number
          num_floors?: number | null
          remarks?: string | null
          site_address?: string
          site_city?: string
          site_pincode?: string | null
          site_state?: string | null
          soil_type_hint?: Database["public"]["Enums"]["soil_type"] | null
          structure_type?: Database["public"]["Enums"]["structure_type"]
          submitted_at?: string
          token_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "intake_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_tokens: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          status: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          status?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          status?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      job_completion: {
        Row: {
          created_at: string
          enquiry_id: string
          final_bill_amount: number | null
          final_bill_date: string | null
          final_bill_done: boolean | null
          final_bill_notes: string | null
          final_bill_raised_actual: string | null
          final_bill_url: string | null
          id: string
          mobilisation_id: string | null
          report_delivered_actual: string | null
          report_delivery_date: string | null
          report_delivery_notes: string | null
          report_done: boolean | null
          report_file_url: string | null
          site_completed_actual: string | null
          site_completion_date: string | null
          site_completion_notes: string | null
          site_done: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enquiry_id: string
          final_bill_amount?: number | null
          final_bill_date?: string | null
          final_bill_done?: boolean | null
          final_bill_notes?: string | null
          final_bill_raised_actual?: string | null
          final_bill_url?: string | null
          id?: string
          mobilisation_id?: string | null
          report_delivered_actual?: string | null
          report_delivery_date?: string | null
          report_delivery_notes?: string | null
          report_done?: boolean | null
          report_file_url?: string | null
          site_completed_actual?: string | null
          site_completion_date?: string | null
          site_completion_notes?: string | null
          site_done?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enquiry_id?: string
          final_bill_amount?: number | null
          final_bill_date?: string | null
          final_bill_done?: boolean | null
          final_bill_notes?: string | null
          final_bill_raised_actual?: string | null
          final_bill_url?: string | null
          id?: string
          mobilisation_id?: string | null
          report_delivered_actual?: string | null
          report_delivery_date?: string | null
          report_delivery_notes?: string | null
          report_done?: boolean | null
          report_file_url?: string | null
          site_completed_actual?: string | null
          site_completion_date?: string | null
          site_completion_notes?: string | null
          site_done?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_completion_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: true
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_completion_mobilisation_id_fkey"
            columns: ["mobilisation_id"]
            isOneToOne: false
            referencedRelation: "mobilisation"
            referencedColumns: ["id"]
          },
        ]
      }
      job_reminders: {
        Row: {
          channels: string[] | null
          created_at: string
          days_before: number
          enquiry_id: string
          id: string
          job_id: string
          reminder_type: string
          scheduled_for: string
          sent: boolean | null
          sent_at: string | null
          target_date: string
        }
        Insert: {
          channels?: string[] | null
          created_at?: string
          days_before: number
          enquiry_id: string
          id?: string
          job_id: string
          reminder_type: string
          scheduled_for: string
          sent?: boolean | null
          sent_at?: string | null
          target_date: string
        }
        Update: {
          channels?: string[] | null
          created_at?: string
          days_before?: number
          enquiry_id?: string
          id?: string
          job_id?: string
          reminder_type?: string
          scheduled_for?: string
          sent?: boolean | null
          sent_at?: string | null
          target_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_reminders_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reminders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_completion"
            referencedColumns: ["id"]
          },
        ]
      }
      mobilisation: {
        Row: {
          created_at: string
          drive_folder_id: string | null
          drive_folder_status: string | null
          drive_folder_url: string | null
          enquiry_id: string
          equipment_notes: string | null
          id: string
          mobilisation_date: string
          mobilisation_time: string | null
          notes: string | null
          notification_sent: boolean | null
          notification_sent_at: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          team_description: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_status?: string | null
          drive_folder_url?: string | null
          enquiry_id: string
          equipment_notes?: string | null
          id?: string
          mobilisation_date: string
          mobilisation_time?: string | null
          notes?: string | null
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          team_description?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_status?: string | null
          drive_folder_url?: string | null
          enquiry_id?: string
          equipment_notes?: string | null
          id?: string
          mobilisation_date?: string
          mobilisation_time?: string | null
          notes?: string | null
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          team_description?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobilisation_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: true
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          enquiry_id: string | null
          id: string
          link: string | null
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          enquiry_id?: string | null
          id?: string
          link?: string | null
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          enquiry_id?: string | null
          id?: string
          link?: string | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_received: number | null
          amount_requested: number
          created_at: string
          enquiry_id: string
          id: string
          notes: string | null
          payment_method: string | null
          payment_type: string
          quotation_id: string | null
          receipt_url: string | null
          received_at: string | null
          request_sent_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          transaction_ref: string | null
          updated_at: string
        }
        Insert: {
          amount_received?: number | null
          amount_requested: number
          created_at?: string
          enquiry_id: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_type: string
          quotation_id?: string | null
          receipt_url?: string | null
          received_at?: string | null
          request_sent_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_ref?: string | null
          updated_at?: string
        }
        Update: {
          amount_received?: number | null
          amount_requested?: number
          created_at?: string
          enquiry_id?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_type?: string
          quotation_id?: string | null
          receipt_url?: string | null
          received_at?: string | null
          request_sent_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          depth_per_bore_m: number
          drilling_cost: number
          enquiry_id: string
          generated_at: string
          gst_amount: number
          gst_rate: number | null
          gst_type: string | null
          id: string
          line_items: Json
          mobilisation_cost: number
          num_bores: number
          pdf_status: string | null
          pdf_url: string | null
          rate_matrix_id: string | null
          reporting_cost: number
          sent_at: string | null
          soil_type: Database["public"]["Enums"]["soil_type"]
          status: Database["public"]["Enums"]["quotation_status"]
          subtotal: number
          total_amount: number
          travel_cost: number | null
          updated_at: string
          variant: string
          variant_label: string | null
          variant_notes: string | null
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          depth_per_bore_m: number
          drilling_cost: number
          enquiry_id: string
          generated_at?: string
          gst_amount: number
          gst_rate?: number | null
          gst_type?: string | null
          id?: string
          line_items?: Json
          mobilisation_cost: number
          num_bores: number
          pdf_status?: string | null
          pdf_url?: string | null
          rate_matrix_id?: string | null
          reporting_cost: number
          sent_at?: string | null
          soil_type: Database["public"]["Enums"]["soil_type"]
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal: number
          total_amount: number
          travel_cost?: number | null
          updated_at?: string
          variant: string
          variant_label?: string | null
          variant_notes?: string | null
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          depth_per_bore_m?: number
          drilling_cost?: number
          enquiry_id?: string
          generated_at?: string
          gst_amount?: number
          gst_rate?: number | null
          gst_type?: string | null
          id?: string
          line_items?: Json
          mobilisation_cost?: number
          num_bores?: number
          pdf_status?: string | null
          pdf_url?: string | null
          rate_matrix_id?: string | null
          reporting_cost?: number
          sent_at?: string | null
          soil_type?: Database["public"]["Enums"]["soil_type"]
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          total_amount?: number
          travel_cost?: number | null
          updated_at?: string
          variant?: string
          variant_label?: string | null
          variant_notes?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_rate_matrix_id_fkey"
            columns: ["rate_matrix_id"]
            isOneToOne: false
            referencedRelation: "rate_matrix"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_matrix: {
        Row: {
          city: string
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean | null
          minimum_charge: number | null
          rate_per_bore: number
          rate_per_metre_rock: number
          rate_per_metre_soil: number
          rate_reporting: number
          rate_travel_per_km: number | null
          soil_type: Database["public"]["Enums"]["soil_type"]
          state: string | null
          structure_type: Database["public"]["Enums"]["structure_type"]
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          created_by: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          minimum_charge?: number | null
          rate_per_bore: number
          rate_per_metre_rock: number
          rate_per_metre_soil: number
          rate_reporting: number
          rate_travel_per_km?: number | null
          soil_type: Database["public"]["Enums"]["soil_type"]
          state?: string | null
          structure_type: Database["public"]["Enums"]["structure_type"]
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          minimum_charge?: number | null
          rate_per_bore?: number
          rate_per_metre_rock?: number
          rate_per_metre_soil?: number
          rate_reporting?: number
          rate_travel_per_km?: number | null
          soil_type?: Database["public"]["Enums"]["soil_type"]
          state?: string | null
          structure_type?: Database["public"]["Enums"]["structure_type"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      submit_intake_form: {
        Args: {
          p_basement_floors: number
          p_expected_depth_m: number
          p_num_bores: number
          p_num_floors: number
          p_remarks: string
          p_site_address: string
          p_site_city: string
          p_site_pincode: string
          p_site_state: string
          p_soil_type_hint: Database["public"]["Enums"]["soil_type"]
          p_structure_type: Database["public"]["Enums"]["structure_type"]
          p_token: string
        }
        Returns: Json
      }
    }
    Enums: {
      comm_channel: "email" | "whatsapp" | "in_app"
      comm_direction: "outbound" | "inbound"
      followup_outcome:
        | "pending"
        | "reached"
        | "no_response"
        | "callback_requested"
        | "closed"
      lead_status:
        | "new"
        | "pending"
        | "sent"
        | "follow_up"
        | "approved"
        | "confirmed"
        | "lost"
        | "completed"
      payment_status:
        | "pending_request"
        | "request_sent"
        | "received"
        | "partial"
        | "refunded"
      quotation_status:
        | "draft"
        | "approved"
        | "sent"
        | "accepted"
        | "rejected"
        | "superseded"
      soil_type: "soil" | "rock" | "mixed"
      structure_type:
        | "residential"
        | "commercial"
        | "industrial"
        | "infrastructure"
        | "other"
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
      comm_channel: ["email", "whatsapp", "in_app"],
      comm_direction: ["outbound", "inbound"],
      followup_outcome: [
        "pending",
        "reached",
        "no_response",
        "callback_requested",
        "closed",
      ],
      lead_status: [
        "new",
        "pending",
        "sent",
        "follow_up",
        "approved",
        "confirmed",
        "lost",
        "completed",
      ],
      payment_status: [
        "pending_request",
        "request_sent",
        "received",
        "partial",
        "refunded",
      ],
      quotation_status: [
        "draft",
        "approved",
        "sent",
        "accepted",
        "rejected",
        "superseded",
      ],
      soil_type: ["soil", "rock", "mixed"],
      structure_type: [
        "residential",
        "commercial",
        "industrial",
        "infrastructure",
        "other",
      ],
    },
  },
} as const
