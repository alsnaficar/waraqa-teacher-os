-- Independent distribution snapshots for draft semester plans.
-- Does not store distribution inside planner_entries or lesson_sessions.
-- Does not replace curriculum_lessons.
-- Does not alter academic_years, semesters, calendar_*, or planner-engine.
-- Does not backfill existing semester_plans or change calendar_variant_id.
-- Not applied in Step 3 until an explicit db push is requested.

-- =========================
-- distribution_snapshots
-- =========================

create table if not exists public.distribution_snapshots (
  id uuid primary key default gen_random_uuid(),
  semester_plan_id uuid not null
    references public.semester_plans(id) on delete cascade,
  semester_plan_version_id uuid not null
    references public.semester_plan_versions(id) on delete cascade,
  spreadsheet_id text not null,
  worksheet_name text not null,
  source text not null default 'google_sheets',
  item_count integer not null check (item_count >= 1),
  total_periods integer not null check (total_periods >= 1),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  constraint distribution_snapshots_source_check
    check (source = 'google_sheets'),
  constraint distribution_snapshots_sheet_len
    check (char_length(spreadsheet_id) between 1 and 128),
  constraint distribution_snapshots_worksheet_len
    check (char_length(worksheet_name) between 1 and 100)
);

create unique index if not exists distribution_snapshots_current_version_uidx
on public.distribution_snapshots (semester_plan_version_id)
where is_current;

create index if not exists idx_distribution_snapshots_plan
on public.distribution_snapshots (semester_plan_id);

create index if not exists idx_distribution_snapshots_version
on public.distribution_snapshots (semester_plan_version_id);

-- =========================
-- distribution_snapshot_items
-- =========================

create table if not exists public.distribution_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null
    references public.distribution_snapshots(id) on delete cascade,
  order_index integer not null check (order_index >= 1),
  unit text not null default '',
  lesson text not null,
  periods integer not null check (periods >= 1),
  notes text not null default '',
  curriculum_lesson_id uuid
    references public.curriculum_lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint distribution_snapshot_items_lesson_len
    check (char_length(lesson) between 1 and 240),
  unique (snapshot_id, order_index)
);

create index if not exists idx_distribution_snapshot_items_snapshot
on public.distribution_snapshot_items (snapshot_id);

create index if not exists idx_distribution_snapshot_items_curriculum
on public.distribution_snapshot_items (curriculum_lesson_id);

-- =========================
-- Draft-plan write guard
-- =========================

create or replace function public.distribution_snapshots_enforce_draft_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_status public.semester_plan_status;
  plan_id uuid;
  version_plan_id uuid;
begin
  plan_id := coalesce(new.semester_plan_id, old.semester_plan_id);

  select p.status into plan_status
  from public.semester_plans p
  where p.id = plan_id;

  if plan_status is null then
    raise exception 'semester plan not found';
  end if;

  if plan_status is distinct from 'draft' then
    raise exception 'distribution snapshots can only be written while the semester plan is draft';
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    select v.semester_plan_id into version_plan_id
    from public.semester_plan_versions v
    where v.id = new.semester_plan_version_id;

    if version_plan_id is null or version_plan_id is distinct from new.semester_plan_id then
      raise exception 'distribution snapshot version does not belong to the semester plan';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.semester_plan_id is distinct from old.semester_plan_id
       or new.semester_plan_version_id is distinct from old.semester_plan_version_id
       or new.spreadsheet_id is distinct from old.spreadsheet_id
       or new.worksheet_name is distinct from old.worksheet_name
       or new.source is distinct from old.source
       or new.item_count is distinct from old.item_count
       or new.total_periods is distinct from old.total_periods
       or new.approved_by is distinct from old.approved_by then
      raise exception 'distribution snapshots are immutable except is_current';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists distribution_snapshots_draft_plan on public.distribution_snapshots;
create trigger distribution_snapshots_draft_plan
before insert or update or delete on public.distribution_snapshots
for each row execute function public.distribution_snapshots_enforce_draft_plan();

create or replace function public.distribution_snapshot_items_enforce_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_status public.semester_plan_status;
  snapshot_id uuid;
begin
  snapshot_id := coalesce(new.snapshot_id, old.snapshot_id);

  select p.status into plan_status
  from public.distribution_snapshots s
  join public.semester_plans p on p.id = s.semester_plan_id
  where s.id = snapshot_id;

  if plan_status is distinct from 'draft' then
    raise exception 'distribution snapshot items can only be written while the semester plan is draft';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'distribution snapshot items are immutable';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists distribution_snapshot_items_immutable on public.distribution_snapshot_items;
create trigger distribution_snapshot_items_immutable
before insert or update or delete on public.distribution_snapshot_items
for each row execute function public.distribution_snapshot_items_enforce_immutable();

-- =========================
-- RLS
-- =========================

alter table public.distribution_snapshots enable row level security;
alter table public.distribution_snapshot_items enable row level security;

revoke all on public.distribution_snapshots from anon;
revoke all on public.distribution_snapshot_items from anon;

grant select, insert, update, delete on public.distribution_snapshots to authenticated;
grant select, insert, update, delete on public.distribution_snapshot_items to authenticated;
grant all on public.distribution_snapshots to service_role;
grant all on public.distribution_snapshot_items to service_role;

drop policy if exists "distribution_snapshots owner all" on public.distribution_snapshots;
create policy "distribution_snapshots owner all"
on public.distribution_snapshots
for all
to authenticated
using (public.is_semester_plan_owner(semester_plan_id))
with check (public.is_semester_plan_owner(semester_plan_id));

drop policy if exists "distribution_snapshot_items owner all" on public.distribution_snapshot_items;
create policy "distribution_snapshot_items owner all"
on public.distribution_snapshot_items
for all
to authenticated
using (
  exists (
    select 1
    from public.distribution_snapshots s
    where s.id = snapshot_id
      and public.is_semester_plan_owner(s.semester_plan_id)
  )
)
with check (
  exists (
    select 1
    from public.distribution_snapshots s
    where s.id = snapshot_id
      and public.is_semester_plan_owner(s.semester_plan_id)
  )
);
