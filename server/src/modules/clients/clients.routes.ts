import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireEditor, requireNotViewer } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { badRequest, notFound } from '../../lib/errors';
import { supabaseAdmin } from '../../lib/supabase';
import { clientsRepo } from './clients.repo';
import { createClientSchema, listClientsQuery, updateClientSchema } from './clients.schema';

/**
 * Clients API. Role gates mirror the database RLS exactly:
 *   SELECT  — any authenticated user
 *   INSERT  — is_not_viewer  (clients_insert)
 *   UPDATE  — is_not_viewer  (clients_update)
 *   DELETE  — is_editor      (clients_delete) — soft delete via deleted_at
 */
export const clientsRouter = Router();
clientsRouter.use(authenticate);

clientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listClientsQuery.parse(req.query);
    res.json(await clientsRepo.list(q));
  }),
);

clientsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await clientsRepo.getById(getParam(req, 'id'));
    if (!row) throw notFound('Client not found');
    res.json(row);
  }),
);

clientsRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = createClientSchema.parse(req.body);
    const row = await clientsRepo.create(body);
    res.status(201).json(row);
  }),
);

clientsRouter.patch(
  '/:id',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = updateClientSchema.parse(req.body);
    const row = await clientsRepo.update(getParam(req, 'id'), body);
    if (!row) throw notFound('Client not found');
    res.json(row);
  }),
);

clientsRouter.delete(
  '/:id',
  requireEditor,
  asyncHandler(async (req, res) => {
    const row = await clientsRepo.softDelete(getParam(req, 'id'));
    if (!row) throw notFound('Client not found');
    res.json({ success: true });
  }),
);

// Flag a contact channel invalid after a failed send (mirrors the
// flag_contact_channel_invalid RPC; scoped so mob-leads can call it too).
clientsRouter.post(
  '/:id/flag-channel',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const { channel } = z.object({ channel: z.enum(['whatsapp', 'email']) }).parse(req.body);
    const { error } = await supabaseAdmin.rpc('flag_contact_channel_invalid', {
      p_client_id: getParam(req, 'id'),
      p_channel: channel,
    });
    if (error) throw badRequest(error.message);
    res.json({ success: true });
  }),
);
