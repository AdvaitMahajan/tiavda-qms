// One-off migration runner: applies every supabase/migrations/*.sql file in order
// to the database in server/.env DATABASE_URL.
//
// The repo's migrations have drift — the consolidated full_schema.sql overlaps
// with several later dated migrations (e.g. both create the same RLS policies).
// To reconcile that safely, this runner executes each statement individually and
// SKIPS "already exists / duplicate" errors (the object was already created by an
// earlier file), while still applying the genuinely new statements. Any other
// error stops the run with context. Safe to run on a fresh project and to re-run.
//
//   cd server && node scripts/run-migrations.mjs
import dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('❌ DATABASE_URL not set in server/.env');
  process.exit(1);
}

const EXPECTED_REF = 'yikgnboolunszxtrmbfz';
if (!url.includes(EXPECTED_REF)) {
  console.error(`❌ Refusing to run: DATABASE_URL does not point at the new project (${EXPECTED_REF}).`);
  process.exit(1);
}

// Postgres error codes that mean "this object already exists" — safe to skip.
const DUPLICATE_CODES = new Set([
  '42P07', // duplicate_table / relation (table, index, view)
  '42710', // duplicate_object (policy, trigger, type, etc.)
  '42P06', // duplicate_schema
  '42701', // duplicate_column
  '42P04', // duplicate_database
  '42723', // duplicate_function
  '42P16', // invalid_table_definition (e.g. multiple primary keys on re-add) — treat as already-set
]);

// Split SQL into statements, respecting line/block comments, single-quoted
// strings, and dollar-quoted bodies ($$...$$ / $tag$...$tag$).
function splitStatements(sql) {
  const stmts = [];
  let cur = '';
  let i = 0;
  const n = sql.length;
  let inSingle = false;
  let inLine = false;
  let inBlock = false;
  let dollar = null;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (inLine) {
      cur += c;
      if (c === '\n') inLine = false;
      i++;
      continue;
    }
    if (inBlock) {
      cur += c;
      if (c === '*' && next === '/') {
        cur += next;
        i += 2;
        inBlock = false;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
      cur += c;
      if (c === "'") {
        if (next === "'") {
          cur += next;
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i++;
      continue;
    }
    if (dollar) {
      if (c === '$' && sql.slice(i).startsWith(dollar)) {
        cur += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '-' && next === '-') {
      inLine = true;
      cur += c;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      cur += c;
      i++;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      cur += c;
      i++;
      continue;
    }
    if (c === '$') {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (m) {
        dollar = m[0];
        cur += dollar;
        i += dollar.length;
        continue;
      }
    }
    if (c === ';') {
      const t = cur.trim();
      if (t) stmts.push(t);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  const tail = cur.trim();
  if (tail) stmts.push(tail);
  return stmts;
}

const migrationsDir = join(__dirname, '..', '..', 'supabase', 'migrations');
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

console.log(`Target: ${url.replace(/:[^:@/]+@/, ':****@')}`);
console.log(`Found ${files.length} migration files.\n`);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  let totalApplied = 0;
  let totalSkipped = 0;
  for (const f of files) {
    const statements = splitStatements(readFileSync(join(migrationsDir, f), 'utf8'));
    let applied = 0;
    let skipped = 0;
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        applied++;
      } catch (err) {
        if (DUPLICATE_CODES.has(err.code) || /already exists/i.test(err.message)) {
          skipped++;
          continue;
        }
        console.log('FAILED');
        console.error(`\n❌ ${f}\n   ${err.message}`);
        console.error(`   statement: ${stmt.slice(0, 160).replace(/\s+/g, ' ')}…`);
        process.exit(1);
      }
    }
    totalApplied += applied;
    totalSkipped += skipped;
    console.log(`→ ${f}  (applied ${applied}, skipped ${skipped})`);
  }
  console.log(`\n✅ Done. Applied ${totalApplied} statements, skipped ${totalSkipped} already-existing.`);
} catch (err) {
  console.error(`\n❌ Connection error: ${err.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
