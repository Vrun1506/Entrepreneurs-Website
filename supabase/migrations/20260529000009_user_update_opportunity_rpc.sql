-- ════════════════════════════════════════════════════════════════════
-- Foundry · Allow posters to edit their own pending opportunities
--
-- Events and vcs_grants can be edited via direct PostgREST UPDATE (RLS
-- already permits it for posted_by=auth.uid() and status='pending'), so
-- they don't need an RPC. Opportunities have skill + sector junction
-- tables that need to be re-synced atomically with the parent row, so
-- they get a dedicated SECURITY DEFINER RPC.
--
-- The RPC explicitly checks ownership + status='pending' inside the
-- function body even though SECURITY DEFINER bypasses RLS — that's the
-- security boundary, not RLS.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.update_opportunity(
  p_id                    uuid,
  p_position_name         text,
  p_company               text,
  p_pay                   text,
  p_location_type         location_type,
  p_location_text         text,
  p_description           text,
  p_start_month           smallint,
  p_start_year            int,
  p_application_deadline  date,
  p_contact_email         text,
  p_contact_email_visible boolean,
  p_apply_method          apply_method,
  p_apply_url             text,
  p_skill_ids             smallint[],
  p_sector_ids            smallint[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller   uuid := auth.uid();
  v_owner    uuid;
  v_status   listing_status;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select posted_by, status into v_owner, v_status
    from public.opportunities where id = p_id;
  if not found then
    raise exception 'Opportunity not found: %', p_id;
  end if;
  if v_owner <> v_caller then
    raise exception 'You can only edit your own listings' using errcode = '42501';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only pending listings can be edited' using errcode = '42501';
  end if;

  if p_application_deadline is null or p_application_deadline < current_date then
    raise exception 'Application deadline must be today or later';
  end if;

  update public.opportunities
     set position_name         = p_position_name,
         company               = p_company,
         pay                   = p_pay,
         location_type         = p_location_type,
         location_text         = p_location_text,
         description           = p_description,
         start_month           = p_start_month,
         start_year            = p_start_year,
         application_deadline  = p_application_deadline,
         contact_email         = p_contact_email,
         contact_email_visible = coalesce(p_contact_email_visible, false),
         apply_method          = p_apply_method,
         apply_url             = p_apply_url
   where id = p_id;

  delete from public.opportunity_skills  where opportunity_id = p_id;
  delete from public.opportunity_sectors where opportunity_id = p_id;

  if p_skill_ids is not null and array_length(p_skill_ids, 1) > 0 then
    insert into public.opportunity_skills (opportunity_id, skill_id)
    select p_id, unnest(p_skill_ids) on conflict do nothing;
  end if;

  if p_sector_ids is not null and array_length(p_sector_ids, 1) > 0 then
    insert into public.opportunity_sectors (opportunity_id, sector_id)
    select p_id, unnest(p_sector_ids) on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.update_opportunity(
  uuid, text, text, text, location_type, text, text, smallint, int, date,
  text, boolean, apply_method, text, smallint[], smallint[]
) to authenticated;
