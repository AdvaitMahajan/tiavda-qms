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
