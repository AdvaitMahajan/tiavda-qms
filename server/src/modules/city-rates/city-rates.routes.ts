import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, ilike } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { rate_matrix_cities, rate_matrix_rows, rate_matrix_cells } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireQuoting, requireFeature } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

/**
 * City Rate Matrix — the editable grid (rows = activities, columns = cities).
 *
 * Read is open to any authenticated user in the org (the Quotation Builder needs
 * it); edits require an editor. Gated by the `quotations` feature, like the rest
 * of the pricing config.
 */
export const cityRatesRouter = Router();
cityRatesRouter.use(authenticate, requireFeature('quotations'));

const BASIS = z.enum(['lump_sum', 'per_bore', 'soil_meters', 'rock_meters', 'spt', 'uds', 'per_metre_total']);
const APPLIES = z.enum(['si', 'boq', 'both']);

// ── Whole grid (cities + rows + cells) ──
cityRatesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const orgId = requireOrgId();
    const [cities, rows, cells] = await Promise.all([
      db.select().from(rate_matrix_cities).where(eq(rate_matrix_cities.org_id, orgId)).orderBy(asc(rate_matrix_cities.sort_order)),
      db.select().from(rate_matrix_rows).where(eq(rate_matrix_rows.org_id, orgId)).orderBy(asc(rate_matrix_rows.sort_order)),
      db.select().from(rate_matrix_cells).where(eq(rate_matrix_cells.org_id, orgId)),
    ]);
    res.json({ cities, rows, cells });
  }),
);

/**
 * Resolve the effective matrix for a city — used by the Quotation Builder.
 * Match order: exact city (case-insensitive) → the city's state → none.
 * Returns rate overrides (for known rate_keys) + custom rows (no rate_key),
 * and flags rows with no configured value so the UI can warn instead of
 * silently pricing at zero.
 */
cityRatesRouter.get(
  '/resolve',
  asyncHandler(async (req, res) => {
    const orgId = requireOrgId();
    const city = String(req.query.city ?? '').trim();
    const state = String(req.query.state ?? '').trim();

    const rows = await db
      .select()
      .from(rate_matrix_rows)
      .where(and(eq(rate_matrix_rows.org_id, orgId), eq(rate_matrix_rows.is_active, true)))
      .orderBy(asc(rate_matrix_rows.sort_order));
    if (rows.length === 0) {
      res.json({ matched: 'none', city: null, overrides: {}, bases: {}, customRows: [], unpriced: [] });
      return;
    }

    // rate_key -> basis, so the builder knows how to multiply a matrix-managed
    // rate (e.g. mobilisation as a lump sum vs per bore) without re-reading rows.
    const bases = Object.fromEntries(rows.filter((r) => r.rate_key).map((r) => [r.rate_key as string, r.basis]));

    // 1) exact city
    let matchedCity = city
      ? (await db
          .select()
          .from(rate_matrix_cities)
          .where(and(eq(rate_matrix_cities.org_id, orgId), ilike(rate_matrix_cities.city, city)))
          .limit(1))[0]
      : undefined;
    let matched: 'city' | 'state' | 'none' = matchedCity ? 'city' : 'none';

    // 2) fall back to any city configured for the same state
    if (!matchedCity && state) {
      matchedCity = (
        await db
          .select()
          .from(rate_matrix_cities)
          .where(and(eq(rate_matrix_cities.org_id, orgId), ilike(rate_matrix_cities.state, state)))
          .orderBy(asc(rate_matrix_cities.sort_order))
          .limit(1)
      )[0];
      if (matchedCity) matched = 'state';
    }

    if (!matchedCity) {
      // No configuration for this location: every matrix row is unpriced ("TBD").
      res.json({
        matched: 'none',
        city: null,
        overrides: Object.fromEntries(rows.filter((r) => r.rate_key).map((r) => [r.rate_key as string, 0])),
        bases,
        customRows: [],
        unpriced: rows.map((r) => r.label),
      });
      return;
    }

    const cells = await db
      .select()
      .from(rate_matrix_cells)
      .where(and(eq(rate_matrix_cells.org_id, orgId), eq(rate_matrix_cells.city_id, matchedCity.id)));
    const valueByRow = new Map(cells.map((c) => [c.row_id, c.value]));

    const overrides: Record<string, number> = {};
    const customRows: Array<{ label: string; basis: string; unit: string | null; rate: number; applies_to: string }> = [];
    const unpriced: string[] = [];

    for (const row of rows) {
      const raw = valueByRow.get(row.id);
      const value = raw === null || raw === undefined ? null : Number(raw);
      if (value === null) unpriced.push(row.label);
      if (row.rate_key) {
        // Matrix-managed rows are authoritative: unconfigured => 0 (forces manual entry).
        overrides[row.rate_key] = value ?? 0;
      } else {
        customRows.push({ label: row.label, basis: row.basis, unit: row.unit, rate: value ?? 0, applies_to: row.applies_to });
      }
    }

    res.json({ matched, city: matchedCity.city, state: matchedCity.state, overrides, bases, customRows, unpriced });
  }),
);

// ── Cities (columns) ──
cityRatesRouter.post(
  '/cities',
  requireQuoting,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ city: z.string().min(1), state: z.string().nullish(), sort_order: z.number().int().optional() })
      .parse(req.body);
    const rows = await db
      .insert(rate_matrix_cities)
      .values({ ...body, org_id: requireOrgId() })
      .returning();
    res.status(201).json(rows[0]);
  }),
);

cityRatesRouter.patch(
  '/cities/:id',
  requireQuoting,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        city: z.string().min(1).optional(),
        state: z.string().nullable().optional(),
        is_active: z.boolean().optional(),
        sort_order: z.number().int().optional(),
      })
      .parse(req.body);
    const rows = await db.update(rate_matrix_cities).set(body).where(eq(rate_matrix_cities.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('City not found');
    res.json(rows[0]);
  }),
);

cityRatesRouter.delete(
  '/cities/:id',
  requireQuoting,
  asyncHandler(async (req, res) => {
    await db.delete(rate_matrix_cities).where(eq(rate_matrix_cities.id, getParam(req, 'id')));
    res.json({ success: true });
  }),
);

// ── Rows (activities) ──
cityRatesRouter.post(
  '/rows',
  requireQuoting,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        label: z.string().min(1),
        rate_key: z.string().nullish(),
        basis: BASIS.default('lump_sum'),
        unit: z.string().nullish(),
        applies_to: APPLIES.default('both'),
        sort_order: z.number().int().optional(),
      })
      .parse(req.body);
    const rows = await db
      .insert(rate_matrix_rows)
      .values({ ...body, org_id: requireOrgId() })
      .returning();
    res.status(201).json(rows[0]);
  }),
);

cityRatesRouter.patch(
  '/rows/:id',
  requireQuoting,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        label: z.string().min(1).optional(),
        rate_key: z.string().nullable().optional(),
        basis: BASIS.optional(),
        unit: z.string().nullable().optional(),
        applies_to: APPLIES.optional(),
        is_active: z.boolean().optional(),
        sort_order: z.number().int().optional(),
      })
      .parse(req.body);
    const rows = await db.update(rate_matrix_rows).set(body).where(eq(rate_matrix_rows.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Row not found');
    res.json(rows[0]);
  }),
);

cityRatesRouter.delete(
  '/rows/:id',
  requireQuoting,
  asyncHandler(async (req, res) => {
    await db.delete(rate_matrix_rows).where(eq(rate_matrix_rows.id, getParam(req, 'id')));
    res.json({ success: true });
  }),
);

// ── Cell (row x city value); value null clears it back to "TBD" ──
cityRatesRouter.put(
  '/cells',
  requireQuoting,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ row_id: z.string().uuid(), city_id: z.string().uuid(), value: z.number().nullable() })
      .parse(req.body);
    const orgId = requireOrgId();
    const rows = await db
      .insert(rate_matrix_cells)
      .values({ ...body, org_id: orgId })
      .onConflictDoUpdate({
        target: [rate_matrix_cells.org_id, rate_matrix_cells.row_id, rate_matrix_cells.city_id],
        set: { value: body.value, updated_at: new Date().toISOString() },
      })
      .returning();
    res.json(rows[0]);
  }),
);
