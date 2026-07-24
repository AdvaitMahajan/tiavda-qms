-- =============================================================================
-- Internal mobilisation acknowledgement by the assigned team member.
--
-- The existing confirmation loop runs between the CLIENT and the team lead
-- (mob_confirmation_tokens). This adds the INTERNAL loop the operations team
-- needs: when a mobilisation is scheduled, the assigned person is notified and
-- can either accept the date or request a reschedule with a proposed date —
-- and either action notifies the admins for review.
--
--   team_lead_status: 'pending' | 'accepted' | 'reschedule_requested'
-- =============================================================================

ALTER TABLE public.mobilisation
  ADD COLUMN IF NOT EXISTS team_lead_status        text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS team_lead_responded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS team_lead_proposed_date date,
  ADD COLUMN IF NOT EXISTS team_lead_note          text;

COMMENT ON COLUMN public.mobilisation.team_lead_status IS
  'Assigned team member''s response: pending | accepted | reschedule_requested';
COMMENT ON COLUMN public.mobilisation.team_lead_proposed_date IS
  'Alternate date proposed by the assigned team member when requesting a reschedule';

-- Guard the allowed values without a hard enum (keeps future states cheap).
DO $$
BEGIN
  ALTER TABLE public.mobilisation
    ADD CONSTRAINT mobilisation_team_lead_status_chk
    CHECK (team_lead_status IN ('pending', 'accepted', 'reschedule_requested'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
