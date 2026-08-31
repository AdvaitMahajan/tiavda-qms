-- =============================================================================
-- Shared team inbox for staff notifications.
--
-- `team_notification_emails` is a comma-separated list copied on every
-- staff-facing notification (new enquiry, follow-up reminder, site visit,
-- job reminders, weekly summary). Client-facing mail — quotations, payment
-- requests, intake links — is deliberately NOT sent here.
--
-- Seeded for every existing org with the address the client asked for. Orgs
-- that already have a value set are left alone.
-- =============================================================================

INSERT INTO public.app_settings (org_id, key, value)
SELECT o.id, 'team_notification_emails', 'globalgeotechnics@ymail.com'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings s
  WHERE s.org_id = o.id AND s.key = 'team_notification_emails'
);
