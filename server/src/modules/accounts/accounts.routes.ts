import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { clients, enquiries, payments } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireFeature } from '../../middleware/roles';
import { asyncHandler } from '../../lib/http';

export const accountsRouter = Router();
accountsRouter.use(authenticate, requireFeature('payments'));

// Full payments ledger with nested enquiry + client (shape matches the original
// Supabase nested select used by the Accounts page).
accountsRouter.get(
  '/payments',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        payment: payments,
        ref_number: enquiries.ref_number,
        site_city: enquiries.site_city,
        deleted_at: enquiries.deleted_at,
        client_name: clients.name,
        company: clients.company,
      })
      .from(payments)
      .leftJoin(enquiries, eq(payments.enquiry_id, enquiries.id))
      .leftJoin(clients, eq(enquiries.client_id, clients.id))
      .orderBy(desc(payments.created_at));

    const shaped = rows.map((r) => ({
      ...r.payment,
      enquiries: {
        ref_number: r.ref_number,
        site_city: r.site_city,
        deleted_at: r.deleted_at,
        clients: { name: r.client_name, company: r.company },
      },
    }));
    res.json(shaped);
  }),
);
