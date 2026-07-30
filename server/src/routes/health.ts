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

/**
 * Readiness — used by Railway's deploy health check.
 *
 * Best-effort DB ping, but ALWAYS 200 so a rolling deploy can cut over even when
 * the outgoing container still holds the (Supabase-capped, 15) connection pool:
 * a hard-fail here would deadlock — the new container can't get a connection
 * until the old one is torn down, and the old one isn't torn down until the new
 * one is healthy. We report db: up | degraded so the status is still visible.
 */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    let dbUp = false;
    try {
      await Promise.race([
        db.execute(sql`select 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('db ping timeout')), 2500)),
      ]);
      dbUp = true;
    } catch {
      dbUp = false;
    }
    res.json({ status: 'ready', db: dbUp ? 'up' : 'degraded', time: new Date().toISOString() });
  }),
);
