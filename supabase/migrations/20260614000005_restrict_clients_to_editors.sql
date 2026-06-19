-- =============================================================================
-- H11: Scope the mobilization lead away from client-master editing.
-- Client records are owned by admin/sales; the mobilization flow only READS
-- clients (and select stays open), so restricting writes to editors does not
-- break mobilization scheduling. Viewers were already blocked.
-- =============================================================================

DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- DELETE already restricted to is_editor() in the role-based RLS migration; left as-is.
-- SELECT stays open to authenticated (mobilization lead needs to read client contact).
