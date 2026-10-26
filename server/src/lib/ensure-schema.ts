import { pool } from '../db';
import { logger } from './logger';

/**
 * Additive schema changes the code depends on. Migrations are not applied on
 * deploy, and Drizzle selects every column it knows about — so a column added
 * to schema.ts but missing in the database would break every read of that
 * table. Applying them here, before the server accepts requests, keeps code and
 * database in step. Each statement is idempotent and mirrors a file in
 * supabase/migrations.
 */
const STATEMENTS = [
  // 20261021000001_payment_invoice_number.sql
  'ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS invoice_number text',
  'ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS invoice_ref text',
  `CREATE UNIQUE INDEX IF NOT EXISTS payments_org_invoice_number_uq
     ON public.payments (org_id, invoice_number) WHERE invoice_number IS NOT NULL`,

  // 20261027000001_si_number_and_pending_work.sql
  'ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS si_number text',
  'ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS si_assigned_at timestamptz',
  `CREATE UNIQUE INDEX IF NOT EXISTS enquiries_org_si_number_uq
     ON public.enquiries (org_id, si_number) WHERE si_number IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS public.pending_work (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
     title      text NOT NULL,
     status     text NOT NULL DEFAULT 'open',
     created_by uuid,
     done_by    uuid,
     done_at    timestamptz,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  'CREATE INDEX IF NOT EXISTS pending_work_org_status_idx ON public.pending_work (org_id, status, created_at DESC)',
  'ALTER TABLE public.pending_work ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.pending_work FORCE ROW LEVEL SECURITY',
  'DROP POLICY IF EXISTS org_isolation ON public.pending_work',
  `CREATE POLICY org_isolation ON public.pending_work
     USING (org_id = current_setting('app.current_org_id', true)::uuid)
     WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid)`,
  'GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_work TO app_tenant',
];

export async function ensureSchema(): Promise<void> {
  let client;
  try {
    client = await pool.connect();
    // Don't stall startup queued behind a long transaction holding the table.
    await client.query("SET lock_timeout = '5s'");
    for (const sql of STATEMENTS) {
      try {
        await client.query(sql);
      } catch (err) {
        logger.error({ err, sql }, 'ensure-schema: statement failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'ensure-schema: could not connect');
  } finally {
    if (client) {
      await client.query('RESET lock_timeout').catch(() => undefined);
      client.release();
    }
  }
}
