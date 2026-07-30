-- =============================================================================
-- Reminder response tracking (change request #4).
--
-- Some notifications (reminders an admin/system sends to a user) require the
-- user to acknowledge and optionally post a status update, so the admin can see
-- who has responded. Paired with a Reply-To header on the reminder emails so
-- email replies thread back to the admin.
-- =============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS requires_ack    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS ack_note        text;

COMMENT ON COLUMN public.notifications.requires_ack IS
  'When true, the recipient must acknowledge this reminder (optionally with a status note).';
