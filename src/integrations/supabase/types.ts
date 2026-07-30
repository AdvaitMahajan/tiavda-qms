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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          lead_source: string | null
          name: string
          notes: string | null
          phone: string
          pincode: string | null
          requirement_notes: string | null
          service_type_interest: string | null
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
          lead_source?: string | null
          name: string
          notes?: string | null
          phone: string
          pincode?: string | null
          requirement_notes?: string | null
          service_type_interest?: string | null
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
          lead_source?: string | null
          name?: string
          notes?: string | null
          phone?: string
          pincode?: string | null
          requirement_notes?: string | null
          service_type_interest?: string | null
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
          architect_address: string | null
          architect_name: string | null
          architect_phone: string | null
          assigned_to: string | null
          client_id: string
          confirmed_date: string | null
          contact_person: string | null
          demobilization_consent: boolean | null
          distance_km: number | null
          electricity_available: boolean | null
          google_maps_url: string | null
          gst_number: string | null
          height_of_basements: number | null
          latitude: number | null
          longitude: number | null
          num_podiums: number | null
          permissions_obtained: boolean | null
          plot_fenced: string | null
          rcc_consultant_address: string | null
          rcc_consultant_name: string | null
          rcc_consultant_phone: string | null
          safety_required: boolean | null
          safety_requirements: string | null
          security_available: boolean | null
          site_access: string | null
          site_access_types: Json | null
          soil_fraction: number | null
          water_available: boolean | null
          water_quantity: string | null
          consultancy_data: Json | null
          created_at: string
          deleted_at: string | null
          enquiry_date: string
          expected_depth_m: number | null
          id: string
          lead_source: string | null
          lost_date: string | null
          lost_reason: string | null
          next_follow_up: string | null
          num_bores: number | null
          ref_number: string
          remarks: string | null
          service_type: string
          site_address: string | null
          site_city: string
          site_visit_required: boolean | null
          soil_type_hint: Database["public"]["Enums"]["soil_type"] | null
          status: Database["public"]["Enums"]["lead_status"]
          structure_type: Database["public"]["Enums"]["structure_type"] | null
          submission_id: string | null
          updated_at: string
        }
        Insert: {
          architect_address?: string | null
          architect_name?: string | null
          architect_phone?: string | null
          assigned_to?: string | null
          client_id: string
          confirmed_date?: string | null
          contact_person?: string | null
          demobilization_consent?: boolean | null
          distance_km?: number | null
          electricity_available?: boolean | null
          google_maps_url?: string | null
          gst_number?: string | null
          height_of_basements?: number | null
          latitude?: number | null
          longitude?: number | null
          num_podiums?: number | null
          permissions_obtained?: boolean | null
          plot_fenced?: string | null
          rcc_consultant_address?: string | null
          rcc_consultant_name?: string | null
          rcc_consultant_phone?: string | null
          safety_required?: boolean | null
          safety_requirements?: string | null
          security_available?: boolean | null
          site_access?: string | null
          site_access_types?: Json | null
          soil_fraction?: number | null
          water_available?: boolean | null
          water_quantity?: string | null
          consultancy_data?: Json | null
          created_at?: string
          deleted_at?: string | null
          enquiry_date?: string
          expected_depth_m?: number | null
          id?: string
          lead_source?: string | null
          lost_date?: string | null
          lost_reason?: string | null
          next_follow_up?: string | null
          num_bores?: number | null
          ref_number?: string
          remarks?: string | null
          service_type?: string
          site_address?: string | null
          site_city: string
          site_visit_required?: boolean | null
          soil_type_hint?: Database["public"]["Enums"]["soil_type"] | null
          status?: Database["public"]["Enums"]["lead_status"]
          structure_type?: Database["public"]["Enums"]["structure_type"] | null
          submission_id?: string | null
          updated_at?: string
        }
        Update: {
          architect_address?: string | null
          architect_name?: string | null
          architect_phone?: string | null
          assigned_to?: string | null
          client_id?: string
          confirmed_date?: string | null
          contact_person?: string | null
          demobilization_consent?: boolean | null
          distance_km?: number | null
          electricity_available?: boolean | null
          google_maps_url?: string | null
          gst_number?: string | null
          height_of_basements?: number | null
          latitude?: number | null
          longitude?: number | null
          num_podiums?: number | null
          permissions_obtained?: boolean | null
          plot_fenced?: string | null
          rcc_consultant_address?: string | null
          rcc_consultant_name?: string | null
          rcc_consultant_phone?: string | null
          safety_required?: boolean | null
          safety_requirements?: string | null
          security_available?: boolean | null
          site_access?: string | null
          site_access_types?: Json | null
          soil_fraction?: number | null
          water_available?: boolean | null
          water_quantity?: string | null
          consultancy_data?: Json | null
          created_at?: string
          deleted_at?: string | null
          enquiry_date?: string
          expected_depth_m?: number | null
          id?: string
          lead_source?: string | null
          lost_date?: string | null
          lost_reason?: string | null
          next_follow_up?: string | null
          num_bores?: number | null
          ref_number?: string
          remarks?: string | null
          service_type?: string
          site_address?: string | null
          site_city?: string
          site_visit_required?: boolean | null
          soil_type_hint?: Database["public"]["Enums"]["soil_type"] | null
          status?: Database["public"]["Enums"]["lead_status"]
          structure_type?: Database["public"]["Enums"]["structure_type"] | null
          submission_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiries_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          is_conditional: boolean
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
          is_conditional?: boolean
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
          is_conditional?: boolean
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
            foreignKeyName: "follow_ups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          enquiry_id: string | null
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
          enquiry_id?: string | null
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
          enquiry_id?: string | null
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
          field_work_completion_date: string | null
          field_work_completed_actual: string | null
          field_work_done: boolean
          field_work_notes: string | null
          samples_submitted: boolean
          samples_submitted_at: string | null
          samples_submitted_by: string | null
          lab_assignee_id: string | null
          lab_due_date: string | null
          lab_processing_done: boolean
          lab_completed_at: string | null
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
      mob_confirmation_tokens: {
        Row: {
          alternate_date: string | null
          alternate_notes: string | null
          client_id: string | null
          confirmed_at: string | null
          created_at: string
          enquiry_id: string
          expires_at: string
          id: string
          mobilisation_id: string
          status: string
          token: string
        }
        Insert: {
          alternate_date?: string | null
          alternate_notes?: string | null
          client_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          enquiry_id: string
          expires_at: string
          id?: string
          mobilisation_id: string
          status?: string
          token: string
        }
        Update: {
          alternate_date?: string | null
          alternate_notes?: string | null
          client_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          enquiry_id?: string
          expires_at?: string
          id?: string
          mobilisation_id?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "mob_confirmation_tokens_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mob_confirmation_tokens_mobilisation_id_fkey"
            columns: ["mobilisation_id"]
            isOneToOne: false
            referencedRelation: "mobilisation"
            referencedColumns: ["id"]
          },
        ]
      }
      mobilisation: {
        Row: {
          admin_override: boolean
          admin_override_at: string | null
          admin_override_by: string | null
          client_confirmed: boolean
          client_confirmed_at: string | null
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
          team_lead_id: string | null
          team_lead_status: string
          team_lead_responded_at: string | null
          team_lead_proposed_date: string | null
          team_lead_note: string | null
          updated_at: string
        }
        Insert: {
          admin_override?: boolean
          admin_override_at?: string | null
          admin_override_by?: string | null
          client_confirmed?: boolean
          client_confirmed_at?: string | null
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
          team_lead_id?: string | null
          team_lead_status?: string
          team_lead_responded_at?: string | null
          team_lead_proposed_date?: string | null
          team_lead_note?: string | null
          updated_at?: string
        }
        Update: {
          admin_override?: boolean
          admin_override_at?: string | null
          admin_override_by?: string | null
          client_confirmed?: boolean
          client_confirmed_at?: string | null
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
          team_lead_id?: string | null
          team_lead_status?: string
          team_lead_responded_at?: string | null
          team_lead_proposed_date?: string | null
          team_lead_note?: string | null
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
          {
            foreignKeyName: "mobilisation_team_lead_id_fkey"
            columns: ["team_lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          ack_note: string | null
          acknowledged_at: string | null
          body: string
          created_at: string
          enquiry_id: string | null
          id: string
          link: string | null
          read: boolean | null
          requires_ack: boolean
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
          due_date: string | null
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
          due_date?: string | null
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
          due_date?: string | null
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
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          invited_by?: string | null
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          depth_per_bore_m: number | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          drilling_cost: number | null
          enquiry_id: string
          generated_at: string
          gst_amount: number
          gst_rate: number | null
          gst_type: string | null
          id: string
          is_lump_sum: boolean
          line_items: Json
          mobilisation_cost: number | null
          num_bores: number | null
          pdf_status: string | null
          pdf_url: string | null
          rate_matrix_id: string | null
          reporting_cost: number | null
          sent_at: string | null
          service_type: string
          soil_type: Database["public"]["Enums"]["soil_type"] | null
          status: Database["public"]["Enums"]["quotation_status"]
          subtotal: number
          template_type: string
          total_amount: number
          travel_cost: number | null
          quotation_number: string
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
          depth_per_bore_m?: number | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          drilling_cost?: number | null
          enquiry_id: string
          generated_at?: string
          gst_amount: number
          gst_rate?: number | null
          gst_type?: string | null
          id?: string
          is_lump_sum?: boolean
          line_items?: Json
          mobilisation_cost?: number | null
          num_bores?: number | null
          pdf_status?: string | null
          pdf_url?: string | null
          quotation_number?: string
          rate_matrix_id?: string | null
          reporting_cost?: number | null
          sent_at?: string | null
          service_type?: string
          soil_type?: Database["public"]["Enums"]["soil_type"] | null
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal: number
          template_type?: string
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
          depth_per_bore_m?: number | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          drilling_cost?: number | null
          enquiry_id?: string
          generated_at?: string
          gst_amount?: number
          gst_rate?: number | null
          gst_type?: string | null
          id?: string
          is_lump_sum?: boolean
          line_items?: Json
          mobilisation_cost?: number | null
          num_bores?: number | null
          pdf_status?: string | null
          pdf_url?: string | null
          quotation_number?: string
          rate_matrix_id?: string | null
          reporting_cost?: number | null
          sent_at?: string | null
          service_type?: string
          soil_type?: Database["public"]["Enums"]["soil_type"] | null
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          template_type?: string
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
      site_visits: {
        Row: {
          id: string
          enquiry_id: string
          visit_date: string
          geologist_id: string | null
          status: string
          feasibility: string | null
          water_confirmed: boolean | null
          access_confirmed: boolean | null
          security_confirmed: boolean | null
          fencing_confirmed: boolean | null
          observations: Json | null
          cost_factors: Json | null
          recommendations: string | null
          photos: string[]
          token: string
          notification_sent: boolean
          notification_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          enquiry_id: string
          visit_date: string
          geologist_id?: string | null
          status?: string
          feasibility?: string | null
          water_confirmed?: boolean | null
          access_confirmed?: boolean | null
          security_confirmed?: boolean | null
          fencing_confirmed?: boolean | null
          observations?: Json | null
          cost_factors?: Json | null
          recommendations?: string | null
          photos?: string[]
          token?: string
          notification_sent?: boolean
          notification_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          enquiry_id?: string
          visit_date?: string
          geologist_id?: string | null
          status?: string
          feasibility?: string | null
          water_confirmed?: boolean | null
          access_confirmed?: boolean | null
          security_confirmed?: boolean | null
          fencing_confirmed?: boolean | null
          observations?: Json | null
          cost_factors?: Json | null
          recommendations?: string | null
          photos?: string[]
          token?: string
          notification_sent?: boolean
          notification_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_geologist_id_fkey"
            columns: ["geologist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      attach_intake_files: {
        Args: {
          p_attachments: Json
          p_submission_id: string
        }
        Returns: undefined
      }
      confirm_mobilisation: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
      flag_contact_channel_invalid: {
        Args: {
          p_channel: string
          p_client_id: string
        }
        Returns: undefined
      }
      get_site_visit: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
      submit_site_visit: {
        Args: {
          p_access: boolean
          p_cost_factors: Json
          p_feasibility: string
          p_fencing: boolean
          p_observations: string
          p_recommendations: string
          p_security: boolean
          p_token: string
          p_water: boolean
        }
        Returns: Json
      }
      get_mob_confirmation: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
      notify_admin_intake: {
        Args: {
          p_city: string
          p_client_name: string
          p_enquiry_id: string
          p_ref_number: string
        }
        Returns: undefined
      }
      propose_alternate_mobilisation: {
        Args: {
          p_date: string
          p_notes: string
          p_token: string
        }
        Returns: Json
      }
      submit_intake_form: {
        Args: {
          p_basement_floors: number
          p_expected_depth_m: number
          p_extended?: Json
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
        | "intake_pending"
        | "pending"
        | "sent"
        | "follow_up"
        | "negotiation"
        | "approved"
        | "payment_received"
        | "mobilization_scheduled"
        | "job_active"
        | "confirmed"
        | "lost"
        | "inactive"
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
      user_role: "super_admin" | "admin" | "mobilization_lead" | "execution_head" | "execution" | "planning" | "reporting" | "accounts" | "lab" | "viewer"
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
  graphql_public: {
    Enums: {},
  },
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
        "intake_pending",
        "pending",
        "sent",
        "follow_up",
        "negotiation",
        "approved",
        "payment_received",
        "mobilization_scheduled",
        "job_active",
        "confirmed",
        "lost",
        "inactive",
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
      user_role: ["super_admin", "admin", "mobilization_lead", "execution_head", "execution", "planning", "reporting", "accounts", "lab", "viewer"],
    },
  },
} as const
