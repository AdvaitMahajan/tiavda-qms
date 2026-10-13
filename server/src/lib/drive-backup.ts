import { pool } from '../db';
import { logger } from './logger';
import { supabaseAdmin } from './supabase';
import { uploadToDriveAtPath } from '../integrations/drive';
import { resolveDriveCreds } from './org-integrations';

/**
 * Nightly copy of the whole system into Google Drive.
 *
 * The per-job folders hold documents, which is useful for finding a job's
 * paperwork — but they would not bring the system back. Clients, enquiries,
 * quotations, payments and the rest live only in Postgres, so a real backup has
 * to carry the data as well as the files.
 *
 * Written as JSON per table rather than a pg_dump: the API image has no
 * postgres client binaries, and a JSON row set restores through a plain insert
 * loop. It captures data, not schema — the migrations in the repo are the
 * schema, so the pair is enough to rebuild.
 */

const STORAGE_BUCKETS = [
  'quotation-pdfs',
  'receipts',
  'reports',
  'site-visit-photos',
  'intake-uploads',
] as const;

/** Tables carrying business data. Supabase's own schemas are not ours to back up. */
async function listTables(): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

/** Every object in a bucket, walking the folder tree Supabase exposes. */
async function listObjects(bucket: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return out;
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A row with no id is a folder placeholder, not a file.
    if (entry.id === null || entry.id === undefined) out.push(...(await listObjects(bucket, path)));
    else out.push(path);
  }
  return out;
}

export interface BackupResult {
  date: string;
  tables: number;
  rows: number;
  files: number;
  failures: string[];
  skipped?: string;
}

export async function runDriveBackup(orgId: string): Promise<BackupResult> {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const result: BackupResult = { date, tables: 0, rows: 0, files: 0, failures: [] };

  const creds = await resolveDriveCreds(orgId);
  if (!creds.oauth_refresh_token && !creds.service_account_b64) {
    result.skipped = 'Google Drive is not connected for this organization';
    return result;
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const tables = await listTables();
  const manifest: Record<string, number> = {};
  for (const table of tables) {
    try {
      // Table names come from information_schema, not user input; quoted anyway.
      const { rows } = await pool.query(`SELECT * FROM public."${table}"`);
      manifest[table] = rows.length;
      result.rows += rows.length;
      const up = await uploadToDriveAtPath({
        orgId,
        folders: ['_Backups', date, 'database'],
        file_name: `${table}.json`,
        mime_type: 'application/json',
        bytes: Buffer.from(JSON.stringify(rows, null, 1), 'utf8'),
      });
      if (up.success) result.tables += 1;
      else result.failures.push(`table ${table}: ${up.error}`);
    } catch (e) {
      result.failures.push(`table ${table}: ${(e as Error).message}`);
    }
  }

  // ── Files ─────────────────────────────────────────────────────────────────
  for (const bucket of STORAGE_BUCKETS) {
    let paths: string[] = [];
    try { paths = await listObjects(bucket); }
    catch (e) { result.failures.push(`bucket ${bucket}: ${(e as Error).message}`); continue; }

    for (const path of paths) {
      try {
        const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
        if (error || !data) { result.failures.push(`${bucket}/${path}: download failed`); continue; }
        // Keep the storage path as folders so a restore knows where each file went.
        const parts = path.split('/');
        const name = parts.pop() as string;
        const up = await uploadToDriveAtPath({
          orgId,
          folders: ['_Backups', date, 'files', bucket, ...parts],
          file_name: name,
          mime_type: data.type || 'application/octet-stream',
          bytes: Buffer.from(await data.arrayBuffer()),
        });
        if (up.success) result.files += 1;
        else result.failures.push(`${bucket}/${path}: ${up.error}`);
      } catch (e) {
        result.failures.push(`${bucket}/${path}: ${(e as Error).message}`);
      }
    }
  }

  // ── Manifest: what this backup contains, and how to read it ───────────────
  await uploadToDriveAtPath({
    orgId,
    folders: ['_Backups', date],
    file_name: 'MANIFEST.json',
    mime_type: 'application/json',
    bytes: Buffer.from(JSON.stringify({
      taken_at: new Date().toISOString(),
      date_ist: date,
      note: 'database/<table>.json holds every row of that table. files/<bucket>/... mirrors Supabase Storage. Schema comes from the repo migrations, not from here.',
      row_counts: manifest,
      files: result.files,
      failures: result.failures,
    }, null, 1), 'utf8'),
  }).catch(() => undefined);

  logger.info({ ...result, failures: result.failures.length }, 'drive backup finished');
  return result;
}
