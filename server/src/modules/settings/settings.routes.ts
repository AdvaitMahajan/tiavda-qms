import { Router } from 'express';
import { z } from 'zod';
import { inArray, sql } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { app_settings } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireEditor } from '../../middleware/roles';
import { asyncHandler } from '../../lib/http';
import { badRequest } from '../../lib/errors';

const upsertSchema = z.object({
  // { entries: { key: value, ... } } — values coerced to string (app_settings.value is text).
  entries: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export const settingsRouter = Router();
settingsRouter.use(authenticate);

// GET /settings           -> all settings as [{ key, value }]
// GET /settings?keys=a,b  -> only the requested keys (parity with .in('key', [...]))
settingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const keysParam = typeof req.query.keys === 'string' ? req.query.keys : '';
    const keys = keysParam.split(',').map((k) => k.trim()).filter(Boolean);
    const rows = keys.length
      ? await db
          .select({ key: app_settings.key, value: app_settings.value })
          .from(app_settings)
          .where(inArray(app_settings.key, keys))
      : await db.select({ key: app_settings.key, value: app_settings.value }).from(app_settings);
    res.json(rows);
  }),
);

// Bulk upsert (parity with .upsert({ key, value }, { onConflict: 'key' })).
settingsRouter.patch(
  '/',
  requireEditor,
  asyncHandler(async (req, res) => {
    const { entries } = upsertSchema.parse(req.body);
    const org_id = requireOrgId();
    const rows = Object.entries(entries).map(([key, value]) => ({ org_id, key, value: String(value) }));
    if (rows.length === 0) throw badRequest('No settings provided');
    const result = await db
      .insert(app_settings)
      .values(rows)
      .onConflictDoUpdate({
        target: [app_settings.org_id, app_settings.key],
        set: { value: sql`excluded.value`, updated_at: sql`now()` },
      })
      .returning();
    res.json(result);
  }),
);
