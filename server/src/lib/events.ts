import { db, requireOrgId } from '../db';
import { enquiry_events } from '../db/schema';

type EnquiryEventInsert = typeof enquiry_events.$inferInsert;

/**
 * Append a row to the enquiry audit log. Used by every business action that
 * changes enquiry state (status transitions, approvals, payments, job stages).
 * Accepts an optional transaction so it participates in atomic operations.
 */
export async function logEnquiryEvent(
  values: Omit<EnquiryEventInsert, 'org_id'>,
  tx: Pick<typeof db, 'insert'> = db,
): Promise<void> {
  await tx.insert(enquiry_events).values({ ...values, org_id: requireOrgId() });
}
