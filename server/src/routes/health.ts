import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { asyncHandler } from '../lib/http';

export const healthRouter = Router();

/** Liveness — process is up. */
healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  }),
);

/** Readiness — DB is reachable. Used by Railway health checks. */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    await db.execute(sql`select 1`);
    res.json({ status: 'ready', db: 'up', time: new Date().toISOString() });
  }),
);
