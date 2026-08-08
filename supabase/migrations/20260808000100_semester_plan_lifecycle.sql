-- Priority 2 — Semester Plan identity, lifecycle, and immutable version snapshots.
--
-- Operational schedule remains `planner_entries`.
-- `semester_plan_versions.snapshot` is audit/history only — never the live schedule.

-- =========================
-- Enums
-- =========================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'semester_plan_status') then
    create type public.semester_plan_status as enum (
      'draft',
      'approved',
      'in_progress',
      'completed',
      'archived'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'semester_plan_version_status') then
    create type public.semester_plan_version_status as enum (
      'draft',
      'approved'
    );
  end if;
end $$;

-- =========================
-- semester_plans
-- =========================

create table if not exists public.semester_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  grade text not null default '',
  academic_year_id uuid references public.academic_years(id) on delete set null,
  semester_id uuid references public.semesters(id) on delete set null,
  status public.semester_plan_status not null default 'draft',
  current_version integer not null default 1
    check (current_version >= 1),
  approved_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists semester_plans_owner_scope_uidx
on public.semester_plans (
  user_id,
  subject,
  coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(semester_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create index if not exists idx_semester_plans_user
on public.semester_plans(user_id);

create index if not exists idx_semester_plans_user_status
on public.semester_plans(user_id, status);

drop trigger if exists semester_plans_updated_at on public.semester_plans;
create trigger semester_plans_updated_at
before update on public.semester_plans
for each row execute function public.set_updated_at();

-- =========================
-- semester_plan_versions
-- =========================

create table if not exists public.semester_plan_versions (
  id uuid primary key default gen_random_uuid(),
  semester_plan_id uuid not null
    references public.semester_plans(id) on delete cascade,
  version_number integer not null
    check (version_number >= 1),
  status public.semester_plan_version_status not null default 'draft',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (semester_plan_id, version_number)
);

create index if not exists idx_semester_plan_versions_plan
on public.semester_plan_versions(semester_plan_id);

-- =========================
-- planner_entries linkage
-- =========================

alter table public.planner_entries
  add column if not exists semester_plan_id uuid
    references public.semester_plans(id) on delete set null;

alter table public.planner_entries
  add column if not exists semester_plan_version_id uuid
    references public.semester_plan_versions(id) on delete set null;

create index if not exists idx_planner_entries_semester_plan
on public.planner_entries(semester_plan_id);

create index if not exists idx_planner_entries_semester_plan_version
on public.planner_entries(semester_plan_version_id);

-- =========================
-- Ownership helpers
-- =========================

create or replace function public.is_semester_plan_owner(plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.semester_plans p
    where p.id = plan_id
      and (
        p.user_id = auth.uid()
        or public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  );
$$;

revoke all on function public.is_semester_plan_owner(uuid) from public, anon;
grant execute on function public.is_semester_plan_owner(uuid) to authenticated, service_role;

-- =========================
-- Lifecycle transition guard
-- =========================

-- Lifecycle status changes must go through the SECURITY DEFINER RPCs below.
-- Direct client UPDATEs that change status are rejected (including draft→approved),
-- so approval always captures an immutable version snapshot first.
create or replace function public.semester_plan_rpc_is(expected text)
returns boolean
language sql
stable
as $$
  select nullif(current_setting('app.semester_plan_rpc', true), '') is not distinct from expected;
$$;

revoke all on function public.semester_plan_rpc_is(text) from public, anon, authenticated;
grant execute on function public.semester_plan_rpc_is(text) to service_role;

create or replace function public.semester_plans_enforce_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Plans must be born as draft; non-draft INSERT would bypass RPC approval/snapshot.
  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception 'semester plans must be created as draft';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'archived' then
      raise exception 'archived semester plans are immutable';
    end if;
    return old;
  end if;

  if old.status = 'archived' then
    raise exception 'archived semester plans are immutable';
  end if;

  if new.status is not distinct from old.status then
    -- Non-status edits on non-archived plans are allowed (grade label, etc.).
    if new.current_version < old.current_version then
      raise exception 'semester plan version cannot decrease';
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'approved' then
    if not public.semester_plan_rpc_is('approve_semester_plan') then
      raise exception 'approval must go through approve_semester_plan()';
    end if;
    new.approved_at := coalesce(new.approved_at, now());
    return new;
  end if;

  if old.status = 'approved' and new.status = 'in_progress' then
    if not public.semester_plan_rpc_is('start_semester_plan_execution') then
      raise exception 'start execution must go through start_semester_plan_execution()';
    end if;
    return new;
  end if;

  if old.status = 'in_progress' and new.status = 'completed' then
    if not public.semester_plan_rpc_is('complete_semester_plan') then
      raise exception 'completion must go through complete_semester_plan()';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
    return new;
  end if;

  if old.status = 'completed' and new.status = 'archived' then
    if not public.semester_plan_rpc_is('archive_semester_plan') then
      raise exception 'archival must go through archive_semester_plan()';
    end if;
    new.archived_at := coalesce(new.archived_at, now());
    return new;
  end if;

  -- Explicit reopen via create_semester_plan_version only.
  if old.status in ('approved', 'in_progress') and new.status = 'draft' then
    if not public.semester_plan_rpc_is('create_semester_plan_version') then
      raise exception 'reopening a semester plan must go through create_semester_plan_version()';
    end if;
    if new.current_version <= old.current_version then
      raise exception 'reopening a semester plan requires a new version';
    end if;
    return new;
  end if;

  raise exception 'invalid semester plan transition: % → %', old.status, new.status;
end;
$$;

drop trigger if exists semester_plans_lifecycle on public.semester_plans;
create trigger semester_plans_lifecycle
before insert or update or delete on public.semester_plans
for each row execute function public.semester_plans_enforce_lifecycle();

-- Approved historical versions are fully immutable (all columns).
-- Versions must be inserted as draft; approval is an UPDATE performed by the RPC.
create or replace function public.semester_plan_versions_enforce_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_status public.semester_plan_status;
begin
  select p.status into plan_status
  from public.semester_plans p
  where p.id = coalesce(new.semester_plan_id, old.semester_plan_id);

  if plan_status = 'archived' then
    raise exception 'archived semester plan versions are immutable';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      raise exception 'semester plan versions must be created as draft';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'approved semester plan versions cannot be deleted';
    end if;
    return old;
  end if;

  -- Once approved, no field may change — including status and approval metadata.
  if old.status = 'approved' then
    raise exception 'approved semester plan versions are immutable';
  end if;

  -- draft → approved only via approve_semester_plan RPC (same session GUC).
  if old.status = 'draft' and new.status = 'approved' then
    if not public.semester_plan_rpc_is('approve_semester_plan') then
      raise exception 'version approval must go through approve_semester_plan()';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists semester_plan_versions_immutable on public.semester_plan_versions;
create trigger semester_plan_versions_immutable
before insert or update or delete on public.semester_plan_versions
for each row execute function public.semester_plan_versions_enforce_immutability();

-- Block destructive schedule writes when the linked plan is not draft.
create or replace function public.planner_entries_enforce_plan_mutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_status public.semester_plan_status;
  plan_id uuid;
begin
  plan_id := coalesce(new.semester_plan_id, old.semester_plan_id);
  if plan_id is null then
    return coalesce(new, old);
  end if;

  select p.status into plan_status
  from public.semester_plans p
  where p.id = plan_id;

  if plan_status is null then
    return coalesce(new, old);
  end if;

  if plan_status = 'archived' then
    raise exception 'archived semester plans are read-only';
  end if;

  if plan_status <> 'draft' then
    -- Allow marker/config rows (no version) and non-destructive touches only when
    -- the RPC/service reassigns version ids during create_new_version.
    if tg_op = 'DELETE' then
      raise exception 'cannot modify planner entries while semester plan is %', plan_status;
    end if;

    if tg_op = 'INSERT' then
      raise exception 'cannot modify planner entries while semester plan is %', plan_status;
    end if;

    -- UPDATE: allow re-pointing version id / notes only when plan is being reopened
    -- via application after status becomes draft. While approved/in_progress/completed,
    -- block structural field changes.
    if plan_status in ('approved', 'in_progress', 'completed') then
      if new.week_start_date is distinct from old.week_start_date
         or new.day_of_week is distinct from old.day_of_week
         or new.period is distinct from old.period
         or new.subject is distinct from old.subject
         or new.notes is distinct from old.notes
         or new.user_id is distinct from old.user_id then
        raise exception 'cannot modify planner entries while semester plan is %', plan_status;
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists planner_entries_plan_mutability on public.planner_entries;
create trigger planner_entries_plan_mutability
before insert or update or delete on public.planner_entries
for each row execute function public.planner_entries_enforce_plan_mutability();

-- =========================
-- Snapshot helper
-- =========================

create or replace function public.capture_semester_plan_snapshot(p_plan_id uuid, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if not public.is_semester_plan_owner(p_plan_id) then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'capturedAt', to_jsonb(now()),
    'entries', coalesce(
      (
        select jsonb_agg(pe.notes::jsonb order by pe.week_start_date, pe.day_of_week, pe.period)
        from public.planner_entries pe
        where pe.semester_plan_id = p_plan_id
          and pe.semester_plan_version_id = p_version_id
          and pe.subject is distinct from 'OVERRIDES'
          and pe.notes is not null
          and pe.notes ~ '^\s*\{'
      ),
      '[]'::jsonb
    ),
    'overrides', coalesce(
      (
        select pe.notes::jsonb
        from public.planner_entries pe
        where pe.semester_plan_id = p_plan_id
          and pe.week_start_date = '1970-01-02'
          and pe.subject = 'OVERRIDES'
        limit 1
      ),
      '[]'::jsonb
    )
  )
  into payload;

  return payload;
end;
$$;

revoke all on function public.capture_semester_plan_snapshot(uuid, uuid) from public, anon;
grant execute on function public.capture_semester_plan_snapshot(uuid, uuid) to authenticated, service_role;

-- =========================
-- Lifecycle RPCs
-- =========================

create or replace function public.approve_semester_plan(p_plan_id uuid)
returns public.semester_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_row public.semester_plans;
  version_row public.semester_plan_versions;
  snap jsonb;
begin
  if not public.is_semester_plan_owner(p_plan_id) then
    raise exception 'not authorized';
  end if;

  select * into plan_row from public.semester_plans where id = p_plan_id for update;
  if not found then
    raise exception 'semester plan not found';
  end if;
  if plan_row.status <> 'draft' then
    raise exception 'only draft plans can be approved';
  end if;

  select * into version_row
  from public.semester_plan_versions
  where semester_plan_id = p_plan_id
    and version_number = plan_row.current_version
  for update;

  if not found then
    raise exception 'current plan version not found';
  end if;

  snap := public.capture_semester_plan_snapshot(p_plan_id, version_row.id);

  if snap is null or not (snap ? 'entries') then
    raise exception 'approval requires a valid version snapshot';
  end if;

  -- GUC must be set before both version and plan status flips.
  perform set_config('app.semester_plan_rpc', 'approve_semester_plan', true);

  -- Version is still draft here; immutability trigger allows draft→approved via RPC GUC.
  update public.semester_plan_versions
  set snapshot = snap,
      status = 'approved',
      approved_at = now()
  where id = version_row.id
    and status = 'draft';

  if not found then
    raise exception 'current plan version is not a draft';
  end if;

  update public.semester_plans
  set status = 'approved',
      approved_at = now()
  where id = p_plan_id
  returning * into plan_row;

  return plan_row;
end;
$$;

create or replace function public.start_semester_plan_execution(p_plan_id uuid)
returns public.semester_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_row public.semester_plans;
begin
  if not public.is_semester_plan_owner(p_plan_id) then
    raise exception 'not authorized';
  end if;

  perform set_config('app.semester_plan_rpc', 'start_semester_plan_execution', true);

  update public.semester_plans
  set status = 'in_progress'
  where id = p_plan_id
    and status = 'approved'
  returning * into plan_row;

  if not found then
    raise exception 'only approved plans can start execution';
  end if;

  return plan_row;
end;
$$;

create or replace function public.complete_semester_plan(p_plan_id uuid)
returns public.semester_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_row public.semester_plans;
begin
  if not public.is_semester_plan_owner(p_plan_id) then
    raise exception 'not authorized';
  end if;

  perform set_config('app.semester_plan_rpc', 'complete_semester_plan', true);

  update public.semester_plans
  set status = 'completed',
      completed_at = now()
  where id = p_plan_id
    and status = 'in_progress'
  returning * into plan_row;

  if not found then
    raise exception 'only in-progress plans can be completed';
  end if;

  return plan_row;
end;
$$;

create or replace function public.archive_semester_plan(p_plan_id uuid)
returns public.semester_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_row public.semester_plans;
begin
  if not public.is_semester_plan_owner(p_plan_id) then
    raise exception 'not authorized';
  end if;

  perform set_config('app.semester_plan_rpc', 'archive_semester_plan', true);

  update public.semester_plans
  set status = 'archived',
      archived_at = now()
  where id = p_plan_id
    and status = 'completed'
  returning * into plan_row;

  if not found then
    raise exception 'only completed plans can be archived';
  end if;

  return plan_row;
end;
$$;

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

  -- Reopen as draft first so operational rows can be re-pointed safely.
  -- Does not mutate the previous approved version row or its snapshot.
  perform set_config('app.semester_plan_rpc', 'create_semester_plan_version', true);

  update public.semester_plans
  set status = 'draft',
      current_version = next_number
  where id = p_plan_id
  returning * into plan_row;

  -- Re-point operational schedule + overrides to the new draft version.
  update public.planner_entries
  set semester_plan_version_id = new_version.id
  where semester_plan_id = p_plan_id;

  return plan_row;
end;
$$;

revoke all on function public.approve_semester_plan(uuid) from public, anon;
revoke all on function public.start_semester_plan_execution(uuid) from public, anon;
revoke all on function public.complete_semester_plan(uuid) from public, anon;
revoke all on function public.archive_semester_plan(uuid) from public, anon;
revoke all on function public.create_semester_plan_version(uuid) from public, anon;

grant execute on function public.approve_semester_plan(uuid) to authenticated, service_role;
grant execute on function public.start_semester_plan_execution(uuid) to authenticated, service_role;
grant execute on function public.complete_semester_plan(uuid) to authenticated, service_role;
grant execute on function public.archive_semester_plan(uuid) to authenticated, service_role;
grant execute on function public.create_semester_plan_version(uuid) to authenticated, service_role;

-- =========================
-- RLS
-- =========================

alter table public.semester_plans enable row level security;
alter table public.semester_plan_versions enable row level security;

revoke all on public.semester_plans from anon;
revoke all on public.semester_plan_versions from anon;

grant select, insert, update, delete on public.semester_plans to authenticated;
grant select, insert, update, delete on public.semester_plan_versions to authenticated;
grant all on public.semester_plans to service_role;
grant all on public.semester_plan_versions to service_role;

drop policy if exists "semester_plans owner all" on public.semester_plans;
create policy "semester_plans owner all"
on public.semester_plans
for all
to authenticated
using (
  auth.uid() = user_id
  or public.has_role(auth.uid(), 'admin'::public.app_role)
)
with check (
  auth.uid() = user_id
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

drop policy if exists "semester_plan_versions owner all" on public.semester_plan_versions;
create policy "semester_plan_versions owner all"
on public.semester_plan_versions
for all
to authenticated
using (
  public.is_semester_plan_owner(semester_plan_id)
)
with check (
  public.is_semester_plan_owner(semester_plan_id)
);
