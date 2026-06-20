import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { intake_tokens } from '../../db/schema';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireNotViewer } from '../../middleware/roles';
import { asyncHandler } from '../../lib/http';
import { badRequest } from '../../lib/errors';

export const intakeTokensRouter = Router();
intakeTokensRouter.use(authenticate);

// GET /intake-tokens?client_id=&enquiry_id=&status=  → latest matching token (or null)
intakeTokensRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        client_id: z.string().uuid().optional(),
        enquiry_id: z.string().uuid().optional(),
        status: z.string().optional(),
      })
      .parse(req.query);
    const conds: SQL[] = [];
    if (q.client_id) conds.push(eq(intake_tokens.client_id, q.client_id));
    if (q.enquiry_id) conds.push(eq(intake_tokens.enquiry_id, q.enquiry_id));
    if (q.status) conds.push(eq(intake_tokens.status, q.status));
    const rows = await db
      .select()
      .from(intake_tokens)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(intake_tokens.created_at))
      .limit(1);
    res.json(rows[0] ?? null);
  }),
);

// POST /intake-tokens  → generate a token + expire prior active ones
// (enquiry-scoped if enquiry_id given, else client-level with null enquiry —
// mirrors the old createIntakeToken util).
intakeTokensRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const b = z
      .object({
        client_id: z.string().uuid(),
        enquiry_id: z.string().uuid().nullish(),
        expires_days: z.number().int().positive().max(60).default(7),
      })
      .parse(req.body);

    const token = randomBytes(24).toString('base64url'); // 32 url-safe chars
    const expiresAt = new Date(Date.now() + b.expires_days * 86_400_000).toISOString();

    const result = await db.transaction(async (tx) => {
      if (b.enquiry_id) {
        await tx
          .update(intake_tokens)
          .set({ status: 'expired' })
          .where(and(eq(intake_tokens.status, 'active'), eq(intake_tokens.enquiry_id, b.enquiry_id)));
      } else {
        await tx
          .update(intake_tokens)
          .set({ status: 'expired' })
          .where(
            and(
              eq(intake_tokens.status, 'active'),
              eq(intake_tokens.client_id, b.client_id),
              isNull(intake_tokens.enquiry_id),
            ),
          );
      }
      const inserted = await tx
        .insert(intake_tokens)
        .values({
          token,
          client_id: b.client_id,
          enquiry_id: b.enquiry_id ?? null,
          created_by: auth.userId,
          expires_at: expiresAt,
          org_id: requireOrgId(),
        })
        .returning();
      return inserted[0];
    });

    if (!result) throw badRequest('Failed to create intake token');
    res.status(201).json(result);
  }),
);
