// Fresh start: removes every client and enquiry (all orgs) plus the rows that
// only exist because of them — quotations, payments, follow-ups, site visits,
// mobilisation, job completion, intake links, notifications, activity log, …
// Users, organizations, settings, rate matrix, team directory and integrations
// are untouched.
//
// Lead (GG-YYYY-NNNN), quotation (GGQ-YYYY-NNNNN) and invoice (GG-INV-YYYY-NNN)
// numbers are computed as max(existing)+1, so once the rows are gone each series
// restarts at 1 by itself — there is no sequence to reset.
//
// What gets cleared is worked out from the live database's foreign keys, not a
// hard-coded list, so a table added later cannot be silently left behind.
//
//   cd server
//   node scripts/reset-clients-enquiries.mjs                 # dry run: show what would be deleted
//   node scripts/reset-clients-enquiries.mjs --backup-only   # just write the backup
//   node scripts/reset-clients-enquiries.mjs --confirm       # backup, then delete
//
// The backup (every row of every affected table, as JSON) is written to
// ~/tiavda-qms-backups/<timestamp>/ BEFORE anything is deleted; the delete does
// not run unless the backup succeeded.
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const ROOTS = ['clients', 'enquiries'];
// Never cleared, even if a foreign key would pull them in — those references
// get nulled/cascaded by Postgres instead. Listed so a surprise shows up loudly.
const PROTECTED = new Set([
  'organizations', 'profiles', 'app_settings', 'team_members', 'org_integrations',
  'rate_matrix', 'rate_matrix_cities', 'rate_matrix_rows', 'rate_matrix_cells',
  'cron_runs', 'drive_backup_runs',
]);

const confirm = process.argv.includes('--confirm');
const backupOnly = process.argv.includes('--backup-only');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('❌ DATABASE_URL not set in server/.env');
  process.exit(1);
}
const EXPECTED_REF = 'yikgnboolunszxtrmbfz';
if (!url.includes(EXPECTED_REF)) {
  console.error(`❌ Refusing to run: DATABASE_URL does not point at the QMS project (${EXPECTED_REF}).`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  // Every public table that (directly or through a chain) references a root.
  const { rows: fks } = await client.query(`
    SELECT con.conrelid::regclass::text  AS child,
           con.confrelid::regclass::text AS parent
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.connamespace = 'public'::regnamespace`);
  const strip = (t) => t.replace(/^public\./, '').replace(/"/g, '');
  const affected = new Set(ROOTS);
  let grew = true;
  while (grew) {
    grew = false;
    for (const { child, parent } of fks) {
      const c = strip(child), p = strip(parent);
      if (affected.has(p) && !affected.has(c)) { affected.add(c); grew = true; }
    }
  }
  const blocked = [...affected].filter((t) => PROTECTED.has(t));
  if (blocked.length) {
    console.error(`❌ Protected tables reference clients/enquiries via a foreign key: ${blocked.join(', ')}`);
    console.error('   Stopping — TRUNCATE ... CASCADE would wipe them. Needs a manual look.');
    process.exit(1);
  }
  const tables = [...affected].sort();

  // Tables that mention a client/enquiry WITHOUT a foreign key: they would keep
  // dangling ids. Reported so nothing is missed silently.
  const { rows: loose } = await client.query(`
    SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('client_id', 'enquiry_id', 'quotation_id', 'payment_id')
    ORDER BY table_name`);
  const unlinked = loose.map((r) => r.table_name).filter((t) => !affected.has(t));

  console.log('\nTables to clear (all organizations):');
  const counts = {};
  for (const t of tables) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM public."${t}"`);
    counts[t] = rows[0].n;
    console.log(`  ${t.padEnd(28)} ${String(rows[0].n).padStart(7)} rows`);
  }
  if (unlinked.length) {
    console.log('\n⚠️  Tables with client/enquiry ids but NO foreign key (left as-is, would hold stale ids):');
    for (const t of unlinked) console.log(`  ${t}`);
  }

  if (!confirm && !backupOnly) {
    console.log('\nDry run — nothing written or deleted. Re-run with --confirm to back up and delete.');
    process.exit(0);
  }

  // ── Backup ────────────────────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(homedir(), 'tiavda-qms-backups', stamp);
  mkdirSync(dir, { recursive: true });
  for (const t of [...tables, ...unlinked]) {
    const { rows } = await client.query(`SELECT * FROM public."${t}"`);
    writeFileSync(join(dir, `${t}.json`), JSON.stringify(rows, null, 1));
  }
  writeFileSync(join(dir, 'MANIFEST.json'), JSON.stringify({
    taken_at: new Date().toISOString(), reason: 'before reset-clients-enquiries', cleared: counts, unlinked,
  }, null, 1));
  console.log(`\n💾 Backup written: ${dir}`);

  if (backupOnly) process.exit(0);

  // ── Delete ────────────────────────────────────────────────────────────────
  await client.query('BEGIN');
  await client.query(`TRUNCATE ${tables.map((t) => `public."${t}"`).join(', ')} RESTRICT`);
  await client.query('COMMIT');
  console.log(`🧹 Cleared ${tables.length} tables. Lead, quotation and invoice numbers restart at 1.`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error('❌ Failed — nothing was deleted:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
