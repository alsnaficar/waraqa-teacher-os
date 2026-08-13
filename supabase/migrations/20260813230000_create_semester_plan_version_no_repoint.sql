-- P1-C2: Version isolation for create_semester_plan_version.
-- New draft versions must not inherit operational planner_entries.
-- Existing Version N rows stay on Version N. Version N+1 starts empty.
-- Does not edit 20260808000100. Same signature, SECURITY DEFINER, and grants.
-- Does not mutate planner_entries, lesson_sessions, distribution snapshots, or RLS.

create or replace function public.create_semester_plan_version(p_plan_id uuid)
returns public.semester_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_row public.semester_plans;
  current_version public.semester_plan_versions;
  new_version public.semester_plan_versions;
  next_number integer;
begin
  if not public.is_semester_plan_owner(p_plan_id) then
    raise exception 'not authorized';
  end if;

  select * into plan_row from public.semester_plans where id = p_plan_id for update;
  if not found then
    raise exception 'semester plan not found';
  end if;

  if plan_row.status not in ('approved', 'in_progress') then
    raise exception 'new versions can only be created from approved or in-progress plans';
  end if;

  select * into current_version
  from public.semester_plan_versions
  where semester_plan_id = p_plan_id
    and version_number = plan_row.current_version
  for update;

  if not found then
    raise exception 'current plan version not found';
  end if;

  -- Approved versions are immutable. Approval always captures the snapshot.
  if current_version.status <> 'approved'
     or not (current_version.snapshot ? 'entries') then
    raise exception 'current version must be approved with a snapshot before creating a new version';
  end if;

  next_number := plan_row.current_version + 1;

  insert into public.semester_plan_versions (
    semester_plan_id,
    version_number,
    status,
    snapshot,
    created_by
  )
  values (
    p_plan_id,
    next_number,
    'draft',
    jsonb_build_object(
      'clonedFromVersion', current_version.version_number,
      'entries', '[]'::jsonb,
      'overrides', '[]'::jsonb
    ),
    auth.uid()
  )
  returning * into new_version;

  -- Reopen as draft. Does not mutate the previous approved version row or its
  -- snapshot. Operational planner_entries stay on the previous version.
  perform set_config('app.semester_plan_rpc', 'create_semester_plan_version', true);

  update public.semester_plans
  set status = 'draft',
      current_version = next_number
  where id = p_plan_id
  returning * into plan_row;

  return plan_row;
end;
$$;
