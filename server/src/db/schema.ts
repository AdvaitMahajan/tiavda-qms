/**
 * Drizzle schema — a faithful mirror of the LIVE Supabase database
 * (generated from src/integrations/supabase/types.ts, including all migration
 * drift). Used as a typed query builder only; we do NOT generate or push DDL
 * from here. The DB owns its triggers (ref/quotation number generation,
 * updated_at, status-transition validation) and RPCs.
 *
 * Parity note: JS property names are intentionally snake_case to match the DB
 * columns exactly. This means query results and accepted payloads are identical
 * in shape to what the frontend already gets from Supabase (snake_case keys,
 * JSONB values untouched) — so no case conversion is needed and nothing breaks.
 *
 * Tenancy (Phase 2): every business table carries a NOT NULL `org_id`. The API
 * runs each authenticated request with `app.current_org_id` set on a dedicated
 * pooled connection, and Postgres RLS (org_isolation policies, FORCE) filters by
 * it — so reads/updates/deletes are scoped by the DB itself; inserts must stamp
 * org_id (NOT NULL enforces this at the type level here).
 */
import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
  customType,
} from 'drizzle-orm/pg-core';

/** numeric/decimal returned as a JS number (parity with PostgREST JSON output). */
const numericNumber = customType<{
  data: number;
  driverData: string;
  config: { precision?: number; scale?: number };
}>({
  dataType(config) {
    return config?.precision ? `numeric(${config.precision}, ${config.scale ?? 0})` : 'numeric';
  },
  fromDriver(value) {
    return value === null ? (value as unknown as number) : Number(value);
  },
  toDriver(value) {
    return value === null ? (value as unknown as string) : String(value);
  },
});

/** Postgres INET type (stored/read as text). */
const inet = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'inet';
  },
});

// ─── Enums ───────────────────────────────────────────────────────────────────
export const comm_channel = pgEnum('comm_channel', ['email', 'whatsapp', 'in_app']);
export const comm_direction = pgEnum('comm_direction', ['outbound', 'inbound']);
export const followup_outcome = pgEnum('followup_outcome', [
  'pending',
  'reached',
  'no_response',
  'callback_requested',
  'closed',
]);
export const lead_status = pgEnum('lead_status', [
  'new',
  'intake_pending',
  'pending',
  'sent',
  'follow_up',
  'negotiation',
  'approved',
  'payment_received',
  'mobilization_scheduled',
  'job_active',
  'confirmed',
  'lost',
  'inactive',
  'completed',
]);
export const payment_status = pgEnum('payment_status', [
  'pending_request',
  'request_sent',
  'received',
  'partial',
  'refunded',
]);
export const quotation_status = pgEnum('quotation_status', [
  'draft',
  'approved',
  'sent',
  'accepted',
  'rejected',
  'superseded',
]);
export const soil_type = pgEnum('soil_type', ['soil', 'rock', 'mixed']);
export const structure_type = pgEnum('structure_type', [
  'residential',
  'commercial',
  'industrial',
  'infrastructure',
  'other',
]);
export const user_role = pgEnum('user_role', ['super_admin', 'admin', 'mobilization_lead', 'viewer']);

// ─── profiles ──────────────────────────────────────────────────────────────
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  // Nullable: a pure platform admin may belong to no business org.
  org_id: uuid('org_id'),
  is_platform_admin: boolean('is_platform_admin').notNull().default(false),
  email: text('email').notNull(),
  full_name: text('full_name'),
  phone: text('phone'),
  role: user_role('role').notNull().default('viewer'),
  is_active: boolean('is_active').notNull().default(true),
  invited_by: uuid('invited_by'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── clients ─────────────────────────────────────────────────────────────────
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  name: text('name').notNull(),
  company: text('company'),
  phone: text('phone').notNull(),
  email: text('email'),
  city: text('city').notNull(),
  state: text('state'),
  pincode: text('pincode'),
  whatsapp_number: text('whatsapp_number'),
  lead_source: text('lead_source'),
  source: text('source'),
  service_type_interest: text('service_type_interest'),
  requirement_notes: text('requirement_notes'),
  notes: text('notes'),
  email_bounced: boolean('email_bounced').default(false),
  whatsapp_invalid: boolean('whatsapp_invalid').default(false),
  deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── intake_tokens ───────────────────────────────────────────────────────────
export const intake_tokens = pgTable('intake_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  token: text('token').notNull().unique(),
  client_id: uuid('client_id'),
  enquiry_id: uuid('enquiry_id'),
  created_by: uuid('created_by').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  status: text('status').default('active'),
  used_at: timestamp('used_at', { withTimezone: true, mode: 'string' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── intake_submissions ──────────────────────────────────────────────────────
export const intake_submissions = pgTable('intake_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  token_id: uuid('token_id').notNull(),
  client_id: uuid('client_id'),
  site_address: text('site_address').notNull(),
  site_city: text('site_city').notNull(),
  site_state: text('site_state'),
  site_pincode: text('site_pincode'),
  structure_type: structure_type('structure_type').notNull(),
  num_floors: integer('num_floors'),
  basement_floors: integer('basement_floors'),
  num_bores: integer('num_bores').notNull(),
  expected_depth_m: numericNumber('expected_depth_m'),
  soil_type_hint: soil_type('soil_type_hint'),
  remarks: text('remarks'),
  attachments: jsonb('attachments'),
  ip_address: inet('ip_address'),
  user_agent: text('user_agent'),
  submitted_at: timestamp('submitted_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── enquiries ───────────────────────────────────────────────────────────────
export const enquiries = pgTable('enquiries', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Trigger-generated (generate_ref_number). default('') marks it optional for
  // inserts so Drizzle omits it and the BEFORE-INSERT trigger fills it.
  ref_number: text('ref_number').notNull().unique().default(''),
  org_id: uuid('org_id').notNull(),
  client_id: uuid('client_id').notNull(),
  submission_id: uuid('submission_id'),
  assigned_to: uuid('assigned_to'),
  service_type: text('service_type').notNull().default('soil_investigation'),
  status: lead_status('status').notNull().default('new'),
  site_city: text('site_city').notNull(),
  site_address: text('site_address'),
  structure_type: structure_type('structure_type'),
  soil_type_hint: soil_type('soil_type_hint'),
  num_bores: integer('num_bores'),
  expected_depth_m: numericNumber('expected_depth_m'),
  enquiry_date: date('enquiry_date').notNull().defaultNow(),
  next_follow_up: timestamp('next_follow_up', { withTimezone: true, mode: 'string' }),
  confirmed_date: timestamp('confirmed_date', { withTimezone: true, mode: 'string' }),
  lost_date: timestamp('lost_date', { withTimezone: true, mode: 'string' }),
  lost_reason: text('lost_reason'),
  lead_source: text('lead_source'),
  remarks: text('remarks'),
  consultancy_data: jsonb('consultancy_data'),
  site_visit_required: boolean('site_visit_required'),
  // Extended site-survey fields (added by later migrations)
  contact_person: text('contact_person'),
  gst_number: text('gst_number'),
  google_maps_url: text('google_maps_url'),
  latitude: numericNumber('latitude'),
  longitude: numericNumber('longitude'),
  distance_km: numericNumber('distance_km'),
  architect_name: text('architect_name'),
  architect_phone: text('architect_phone'),
  architect_address: text('architect_address'),
  rcc_consultant_name: text('rcc_consultant_name'),
  rcc_consultant_phone: text('rcc_consultant_phone'),
  rcc_consultant_address: text('rcc_consultant_address'),
  num_podiums: integer('num_podiums'),
  height_of_basements: numericNumber('height_of_basements'),
  soil_fraction: numericNumber('soil_fraction'),
  water_available: boolean('water_available'),
  water_quantity: text('water_quantity'),
  electricity_available: boolean('electricity_available'),
  security_available: boolean('security_available'),
  plot_fenced: text('plot_fenced'),
  site_access: text('site_access'),
  site_access_types: jsonb('site_access_types'),
  permissions_obtained: boolean('permissions_obtained'),
  // Labour accommodation: space on site, and (only when space exists) confirmed permission.
  labour_accommodation_available: boolean('labour_accommodation_available'),
  labour_accommodation_permission: boolean('labour_accommodation_permission'),
  safety_required: boolean('safety_required'),
  safety_requirements: text('safety_requirements'),
  demobilization_consent: boolean('demobilization_consent'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
});

// ─── quotations ──────────────────────────────────────────────────────────────
export const quotations = pgTable('quotations', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull(),
  variant: text('variant').notNull(),
  variant_label: text('variant_label'),
  variant_notes: text('variant_notes'),
  version: integer('version').notNull().default(1),
  // Trigger-generated (generate_quotation_number) — optional on insert.
  quotation_number: text('quotation_number').notNull().default(''),
  template_type: text('template_type').notNull().default('original_si'),
  service_type: text('service_type').notNull().default('soil_investigation'),
  status: quotation_status('status').notNull().default('draft'),
  is_lump_sum: boolean('is_lump_sum').notNull().default(false),
  num_bores: integer('num_bores'),
  depth_per_bore_m: numericNumber('depth_per_bore_m'),
  soil_type: soil_type('soil_type'),
  rate_matrix_id: uuid('rate_matrix_id'),
  line_items: jsonb('line_items').notNull().default(sql`'[]'::jsonb`),
  subtotal: numericNumber('subtotal', { precision: 12, scale: 2 }).notNull(),
  discount_type: text('discount_type'),
  discount_value: numericNumber('discount_value'),
  discount_amount: numericNumber('discount_amount'),
  gst_rate: numericNumber('gst_rate'),
  gst_type: text('gst_type'),
  gst_amount: numericNumber('gst_amount', { precision: 12, scale: 2 }).notNull(),
  total_amount: numericNumber('total_amount', { precision: 12, scale: 2 }).notNull(),
  mobilisation_cost: numericNumber('mobilisation_cost'),
  drilling_cost: numericNumber('drilling_cost'),
  reporting_cost: numericNumber('reporting_cost'),
  travel_cost: numericNumber('travel_cost'),
  pdf_url: text('pdf_url'),
  pdf_status: text('pdf_status'),
  approved_at: timestamp('approved_at', { withTimezone: true, mode: 'string' }),
  approved_by: uuid('approved_by'),
  sent_at: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
  generated_at: timestamp('generated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── communication_log ───────────────────────────────────────────────────────
export const communication_log = pgTable('communication_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull(),
  client_id: uuid('client_id').notNull(),
  channel: comm_channel('channel').notNull(),
  direction: comm_direction('direction').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  attachments: jsonb('attachments'),
  template_id: text('template_id'),
  external_msg_id: text('external_msg_id'),
  sent_by: uuid('sent_by'),
  status: text('status'),
  error_detail: jsonb('error_detail'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── follow_ups ──────────────────────────────────────────────────────────────
export const follow_ups = pgTable('follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull(),
  assigned_to: uuid('assigned_to'),
  scheduled_date: date('scheduled_date').notNull(),
  scheduled_time: text('scheduled_time'),
  notes: text('notes'),
  outcome: followup_outcome('outcome').notNull().default('pending'),
  outcome_notes: text('outcome_notes'),
  is_conditional: boolean('is_conditional').notNull().default(false),
  auto_scheduled: boolean('auto_scheduled').default(false),
  reminder_sent: boolean('reminder_sent').default(false),
  completed_at: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  completed_by: uuid('completed_by'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── payments ────────────────────────────────────────────────────────────────
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull(),
  quotation_id: uuid('quotation_id'),
  payment_type: text('payment_type').notNull(),
  amount_requested: numericNumber('amount_requested', { precision: 12, scale: 2 }).notNull(),
  amount_received: numericNumber('amount_received', { precision: 12, scale: 2 }),
  status: payment_status('status').notNull().default('pending_request'),
  payment_method: text('payment_method'),
  transaction_ref: text('transaction_ref'),
  receipt_url: text('receipt_url'),
  due_date: date('due_date'),
  request_sent_at: timestamp('request_sent_at', { withTimezone: true, mode: 'string' }),
  received_at: timestamp('received_at', { withTimezone: true, mode: 'string' }),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── mobilisation ────────────────────────────────────────────────────────────
export const mobilisation = pgTable('mobilisation', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull().unique(),
  team_lead_id: uuid('team_lead_id'),
  team_description: text('team_description'),
  mobilisation_date: date('mobilisation_date').notNull(),
  mobilisation_time: text('mobilisation_time'),
  site_contact_name: text('site_contact_name'),
  site_contact_phone: text('site_contact_phone'),
  equipment_notes: text('equipment_notes'),
  notes: text('notes'),
  drive_folder_id: text('drive_folder_id'),
  drive_folder_url: text('drive_folder_url'),
  drive_folder_status: text('drive_folder_status'),
  client_confirmed: boolean('client_confirmed').notNull().default(false),
  client_confirmed_at: timestamp('client_confirmed_at', { withTimezone: true, mode: 'string' }),
  admin_override: boolean('admin_override').notNull().default(false),
  admin_override_at: timestamp('admin_override_at', { withTimezone: true, mode: 'string' }),
  admin_override_by: uuid('admin_override_by'),
  notification_sent: boolean('notification_sent').default(false),
  notification_sent_at: timestamp('notification_sent_at', { withTimezone: true, mode: 'string' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── mob_confirmation_tokens ─────────────────────────────────────────────────
export const mob_confirmation_tokens = pgTable('mob_confirmation_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  mobilisation_id: uuid('mobilisation_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull(),
  client_id: uuid('client_id'),
  token: text('token').notNull(),
  status: text('status').notNull().default('pending'),
  expires_at: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  confirmed_at: timestamp('confirmed_at', { withTimezone: true, mode: 'string' }),
  alternate_date: date('alternate_date'),
  alternate_notes: text('alternate_notes'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── job_completion ──────────────────────────────────────────────────────────
export const job_completion = pgTable('job_completion', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull().unique(),
  mobilisation_id: uuid('mobilisation_id'),
  site_completion_date: date('site_completion_date'),
  site_completed_actual: timestamp('site_completed_actual', { withTimezone: true, mode: 'string' }),
  site_done: boolean('site_done').default(false),
  site_completion_notes: text('site_completion_notes'),
  report_delivery_date: date('report_delivery_date'),
  report_delivered_actual: timestamp('report_delivered_actual', { withTimezone: true, mode: 'string' }),
  report_done: boolean('report_done').default(false),
  report_delivery_notes: text('report_delivery_notes'),
  report_file_url: text('report_file_url'),
  final_bill_date: date('final_bill_date'),
  final_bill_raised_actual: timestamp('final_bill_raised_actual', { withTimezone: true, mode: 'string' }),
  final_bill_done: boolean('final_bill_done').default(false),
  final_bill_amount: numericNumber('final_bill_amount', { precision: 12, scale: 2 }),
  final_bill_notes: text('final_bill_notes'),
  final_bill_url: text('final_bill_url'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── job_reminders ───────────────────────────────────────────────────────────
export const job_reminders = pgTable('job_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  job_id: uuid('job_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull(),
  reminder_type: text('reminder_type').notNull(),
  target_date: date('target_date').notNull(),
  days_before: integer('days_before').notNull(),
  scheduled_for: timestamp('scheduled_for', { withTimezone: true, mode: 'string' }).notNull(),
  sent: boolean('sent').default(false),
  sent_at: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
  channels: text('channels').array(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── notifications ───────────────────────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  user_id: uuid('user_id').notNull(),
  enquiry_id: uuid('enquiry_id'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  read: boolean('read').default(false),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── enquiry_events ──────────────────────────────────────────────────────────
export const enquiry_events = pgTable('enquiry_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull(),
  event_type: text('event_type').notNull(),
  from_status: lead_status('from_status'),
  to_status: lead_status('to_status'),
  triggered_by: uuid('triggered_by'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── app_settings ────────────────────────────────────────────────────────────
export const app_settings = pgTable('app_settings', {
  // PK is composite (org_id, key) in the DB; Drizzle just needs to know the cols.
  org_id: uuid('org_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

// ─── rate_matrix ─────────────────────────────────────────────────────────────
export const rate_matrix = pgTable('rate_matrix', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  city: text('city').notNull(),
  state: text('state'),
  structure_type: structure_type('structure_type').notNull(),
  soil_type: soil_type('soil_type').notNull(),
  rate_per_bore: numericNumber('rate_per_bore', { precision: 12, scale: 2 }).notNull(),
  rate_per_metre_soil: numericNumber('rate_per_metre_soil', { precision: 12, scale: 2 }).notNull(),
  rate_per_metre_rock: numericNumber('rate_per_metre_rock', { precision: 12, scale: 2 }).notNull(),
  rate_reporting: numericNumber('rate_reporting', { precision: 12, scale: 2 }).notNull(),
  rate_travel_per_km: numericNumber('rate_travel_per_km', { precision: 12, scale: 2 }),
  minimum_charge: numericNumber('minimum_charge', { precision: 12, scale: 2 }),
  is_active: boolean('is_active').default(true),
  effective_from: date('effective_from').notNull().defaultNow(),
  effective_to: date('effective_to'),
  created_by: uuid('created_by').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── site_visits ─────────────────────────────────────────────────────────────
export const site_visits = pgTable('site_visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  enquiry_id: uuid('enquiry_id').notNull(),
  visit_date: date('visit_date').notNull(),
  geologist_id: uuid('geologist_id'),
  status: text('status').notNull().default('scheduled'),
  feasibility: text('feasibility'),
  water_confirmed: boolean('water_confirmed').default(false),
  access_confirmed: boolean('access_confirmed').default(false),
  security_confirmed: boolean('security_confirmed').default(false),
  fencing_confirmed: boolean('fencing_confirmed').default(false),
  observations: jsonb('observations'),
  cost_factors: jsonb('cost_factors'),
  recommendations: text('recommendations'),
  photos: text('photos').array(),
  // Trigger-generated (generate_site_visit_token) — optional on insert.
  token: text('token').notNull().unique().default(''),
  notification_sent: boolean('notification_sent').notNull().default(false),
  notification_sent_at: timestamp('notification_sent_at', { withTimezone: true, mode: 'string' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── city rate matrix (columns = cities, rows = activities, cells = values) ──
export const rate_matrix_cities = pgTable('rate_matrix_cities', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  city: text('city').notNull(),
  state: text('state'),
  is_active: boolean('is_active').notNull().default(true),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const rate_matrix_rows = pgTable('rate_matrix_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  label: text('label').notNull(),
  /** Engine rate key to override; null => custom line item appended by the builder. */
  rate_key: text('rate_key'),
  /** How qty is derived: lump_sum | per_bore | soil_meters | rock_meters | spt | uds … */
  basis: text('basis').notNull().default('lump_sum'),
  unit: text('unit'),
  applies_to: text('applies_to').notNull().default('both'), // si | boq | both
  is_active: boolean('is_active').notNull().default(true),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const rate_matrix_cells = pgTable('rate_matrix_cells', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  row_id: uuid('row_id').notNull(),
  city_id: uuid('city_id').notNull(),
  /** null = not configured ("TBD") — the builder leaves it unpriced and warns. */
  value: numericNumber('value', { precision: 12, scale: 2 }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── organizations (tenants) ─────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  status: text('status').notNull().default('active'), // active | suspended
  plan: text('plan'),
  features: jsonb('features').notNull().default(sql`'{}'::jsonb`), // { quotations, payments, site_visits, comms }
  limits: jsonb('limits').notNull().default(sql`'{}'::jsonb`), // { max_users }
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ─── org_integrations (per-org provider credentials, encrypted) ──────────────
export const org_integrations = pgTable('org_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  provider: text('provider').notNull(), // 'email' | 'whatsapp' | 'drive'
  config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
  secret_ciphertext: text('secret_ciphertext'),
  is_active: boolean('is_active').notNull().default(true),
  updated_by: uuid('updated_by'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
