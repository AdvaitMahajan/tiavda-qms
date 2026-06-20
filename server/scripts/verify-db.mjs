import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const tables = await client.query(
  `select table_name from information_schema.tables where table_schema='public' order by table_name`,
);
const enums = await client.query(
  `select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e' order by 1`,
);
const funcs = await client.query(
  `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and proname in ('submit_intake_form','get_site_visit','submit_site_visit','get_mob_confirmation','confirm_mobilisation','propose_alternate_mobilisation','attach_intake_files','flag_contact_channel_invalid','notify_admin_intake','generate_ref_number') order by 1`,
);
const buckets = await client.query(`select id from storage.buckets order by id`);
const policies = await client.query(`select count(*)::int c from pg_policies where schemaname='public'`);

console.log(`Tables (${tables.rowCount}): ${tables.rows.map((r) => r.table_name).join(', ')}`);
console.log(`\nEnums (${enums.rowCount}): ${enums.rows.map((r) => r.typname).join(', ')}`);
console.log(`\nKey functions/RPCs (${funcs.rowCount}/10): ${funcs.rows.map((r) => r.proname).join(', ')}`);
console.log(`\nStorage buckets (${buckets.rowCount}): ${buckets.rows.map((r) => r.id).join(', ')}`);
console.log(`\nRLS policies on public: ${policies.rows[0].c}`);

await client.end();
