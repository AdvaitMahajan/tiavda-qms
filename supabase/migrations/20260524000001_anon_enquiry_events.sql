-- Allow anon to insert enquiry_events (for public site visit form completion logging)
create policy "Anon can insert enquiry_events"
  on public.enquiry_events for insert
  to anon
  with check (true);
