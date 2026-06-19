-- Server-side status transition validation for enquiries.status
-- Mirrors VALID_TRANSITIONS from src/components/EnquiryKanban.tsx
-- Prevents invalid status transitions via direct DB access

CREATE OR REPLACE FUNCTION public.validate_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  allowed text[];
  user_role text;
BEGIN
  -- Skip if status hasn't changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Allow any transition from NULL (initial insert handled by INSERT, not UPDATE)
  IF OLD.status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow super_admin to bypass (escape hatch for data fixes)
  BEGIN
    user_role := coalesce(
      current_setting('request.jwt.claims', true)::json->>'role',
      (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role')
    );
  EXCEPTION WHEN OTHERS THEN
    user_role := NULL;
  END;

  IF user_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- Define valid transitions (mirrors client-side VALID_TRANSITIONS)
  allowed := CASE OLD.status
    WHEN 'new' THEN ARRAY['intake_pending', 'pending', 'lost', 'inactive']
    WHEN 'intake_pending' THEN ARRAY['pending', 'lost', 'inactive']
    WHEN 'pending' THEN ARRAY['sent', 'lost', 'inactive']
    WHEN 'sent' THEN ARRAY['follow_up', 'negotiation', 'approved', 'lost', 'inactive']
    WHEN 'follow_up' THEN ARRAY['sent', 'negotiation', 'approved', 'lost', 'inactive']
    WHEN 'negotiation' THEN ARRAY['sent', 'approved', 'lost', 'inactive']
    WHEN 'approved' THEN ARRAY['payment_received', 'lost', 'inactive']
    WHEN 'payment_received' THEN ARRAY['mobilization_scheduled', 'lost', 'inactive']
    WHEN 'mobilization_scheduled' THEN ARRAY['job_active', 'lost', 'inactive']
    WHEN 'job_active' THEN ARRAY['completed', 'lost', 'inactive']
    WHEN 'confirmed' THEN ARRAY['completed', 'lost', 'inactive']
    WHEN 'lost' THEN ARRAY['follow_up']
    WHEN 'inactive' THEN ARRAY['follow_up']
    WHEN 'completed' THEN ARRAY[]::text[]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid status transition: "%" → "%". Allowed from "%": %',
      OLD.status, NEW.status, OLD.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any (idempotent)
DROP TRIGGER IF EXISTS trg_validate_status ON public.enquiries;

-- Create trigger (BEFORE UPDATE so we can reject invalid transitions)
CREATE TRIGGER trg_validate_status
  BEFORE UPDATE ON public.enquiries
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validate_status_transition();
