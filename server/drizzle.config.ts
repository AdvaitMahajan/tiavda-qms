import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit is used here only for `db:studio` (browsing) and, later, for the
// org_id multi-tenancy migration. The live schema already exists in Supabase —
// we do NOT auto-push DDL from this repo.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
