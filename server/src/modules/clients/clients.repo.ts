import { and, asc, desc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { clients } from '../../db/schema';
import type { CreateClientInput, UpdateClientInput, ListClientsQuery } from './clients.schema';

/**
 * Data access for clients. Kept thin and pure — all auth/role enforcement lives
 * in the route layer. This is the seam where org_id scoping will be added for
 * multi-tenancy (an `eq(clients.org_id, ctx.orgId)` in every condition list).
 */
export const clientsRepo = {
  list(q: ListClientsQuery) {
    const conds: SQL[] = [];
    if (!q.include_deleted) conds.push(isNull(clients.deleted_at));
    if (q.phone) conds.push(eq(clients.phone, q.phone));
    if (q.search) {
      const s = `%${q.search}%`;
      const match = or(
        ilike(clients.name, s),
        ilike(clients.phone, s),
        ilike(clients.company, s),
        ilike(clients.city, s),
      );
      if (match) conds.push(match);
    }
    const orderBy = q.order === 'name' ? asc(clients.name) : desc(clients.created_at);
    return db
      .select()
      .from(clients)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(orderBy);
  },

  async getById(id: string) {
    const rows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async create(values: CreateClientInput) {
    const rows = await db.insert(clients).values(values).returning();
    return rows[0];
  },

  async update(id: string, values: UpdateClientInput) {
    // updated_at is maintained by the DB trigger (set_updated_at).
    const rows = await db.update(clients).set(values).where(eq(clients.id, id)).returning();
    return rows[0] ?? null;
  },

  async softDelete(id: string) {
    const rows = await db
      .update(clients)
      .set({ deleted_at: new Date().toISOString() })
      .where(eq(clients.id, id))
      .returning();
    return rows[0] ?? null;
  },
};
