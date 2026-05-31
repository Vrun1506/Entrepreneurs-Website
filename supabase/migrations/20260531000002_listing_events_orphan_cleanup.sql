-- ════════════════════════════════════════════════════════════════════
-- Foundry · Auto-clean listing_events when a listing is deleted
--
-- listing_events.listing_id is polymorphic (discriminated by
-- listing_kind), so it cannot use a real FK. Without this, deleting
-- an opportunity / event / vc_grant leaves orphan rows in
-- listing_events forever. The records are not PII (viewer_id cascades
-- via the auth.users FK), but they're untidy and bloat the table over
-- time.
--
-- Fix: one AFTER DELETE trigger per listing table that wipes the
-- matching listing_events rows. Centralised here so every delete path
-- (user-initiated cards in /my-submissions, admin reject, expire job,
-- account deletion cascades) all clean up the same way without
-- having to remember to call a cleanup helper.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.tg_cleanup_listing_events_for_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.listing_events
   where listing_kind = TG_ARGV[0]::public.listing_event_kind
     and listing_id   = OLD.id;
  return OLD;
end;
$$;

-- Trigger executes as the function owner (postgres) so the DELETE
-- bypasses the deny-all RLS on listing_events. SECURITY DEFINER on
-- the function locks behaviour to its definition.
revoke all on function public.tg_cleanup_listing_events_for_listing() from public;

drop trigger if exists opportunities_cleanup_listing_events on public.opportunities;
create trigger opportunities_cleanup_listing_events
  after delete on public.opportunities
  for each row execute function public.tg_cleanup_listing_events_for_listing('opportunity');

drop trigger if exists events_cleanup_listing_events on public.events;
create trigger events_cleanup_listing_events
  after delete on public.events
  for each row execute function public.tg_cleanup_listing_events_for_listing('event');

drop trigger if exists vcs_grants_cleanup_listing_events on public.vcs_grants;
create trigger vcs_grants_cleanup_listing_events
  after delete on public.vcs_grants
  for each row execute function public.tg_cleanup_listing_events_for_listing('vc_grant');
