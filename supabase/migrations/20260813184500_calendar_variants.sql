-- Calendar variants: one official base calendar + optional regional exceptions.
-- GENERAL is the default. WESTERN is a selectable variant with no seeded dates.
-- Does not copy academic_years or semesters.
-- Does not backfill semester_plans.
-- Does not mutate lesson_sessions, planner_entries, or calendar_events.
-- Does not add region_id.

-- =========================
-- calendar_variants
-- =========================

create table if not exists public.calendar_variants (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  is_default boolean not null default false,
  is_selectable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_variants_code_key unique (code),
  constraint calendar_variants_code_format check (code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint calendar_variants_label_len check (char_length(label) between 1 and 120)
);

create unique index if not exists calendar_variants_one_default
on public.calendar_variants (is_default)
where is_default = true;

drop trigger if exists calendar_variants_updated_at on public.calendar_variants;
create trigger calendar_variants_updated_at
before update on public.calendar_variants
for each row execute function public.set_updated_at();

insert into public.calendar_variants (code, label, is_default, is_selectable, sort_order)
values
  ('GENERAL', 'جميع المناطق', true, true, 0),
  ('WESTERN', 'المنطقة الغربية', false, true, 1)
on conflict (code) do nothing;

-- =========================
-- calendar_term_overrides
-- =========================

create table if not exists public.calendar_term_overrides (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.calendar_variants(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_term_overrides_variant_semester_key unique (variant_id, semester_id),
  constraint calendar_term_overrides_bounds_check check (
    start_date is not null or end_date is not null
  ),
  constraint calendar_term_overrides_range_check check (
    start_date is null or end_date is null or start_date <= end_date
  )
);

drop trigger if exists calendar_term_overrides_updated_at on public.calendar_term_overrides;
create trigger calendar_term_overrides_updated_at
before update on public.calendar_term_overrides
for each row execute function public.set_updated_at();

create index if not exists idx_calendar_term_overrides_semester
on public.calendar_term_overrides (semester_id);

-- =========================
-- calendar_exceptions
-- =========================

create table if not exists public.calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.calendar_variants(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  semester_id uuid references public.semesters(id) on delete set null,
  kind text not null
    check (kind in (
      'holiday',
      'exam',
      'remote',
      'break',
      'teaching_day',
      'non_teaching_day'
    )),
  action text not null
    check (action in ('add', 'remove', 'replace')),
  starts_at date not null,
  ends_at date not null,
  title text not null,
  replaces_exception_id uuid references public.calendar_exceptions(id) on delete set null,
  is_teaching_day boolean not null default false,
  is_remote boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_exceptions_dates_check check (ends_at >= starts_at),
  constraint calendar_exceptions_title_len check (char_length(title) between 1 and 160)
);

drop trigger if exists calendar_exceptions_updated_at on public.calendar_exceptions;
create trigger calendar_exceptions_updated_at
before update on public.calendar_exceptions
for each row execute function public.set_updated_at();

create index if not exists idx_calendar_exceptions_variant_year
on public.calendar_exceptions (variant_id, academic_year_id, starts_at);

create index if not exists idx_calendar_exceptions_semester
on public.calendar_exceptions (semester_id);

-- =========================
-- semester_plans.calendar_variant_id
-- =========================

alter table public.semester_plans
  add column if not exists calendar_variant_id uuid
  references public.calendar_variants(id) on delete restrict;

create index if not exists idx_semester_plans_calendar_variant
on public.semester_plans (calendar_variant_id);

-- =========================
-- grants
-- =========================

revoke all on public.calendar_variants from anon;
revoke all on public.calendar_term_overrides from anon;
revoke all on public.calendar_exceptions from anon;

grant select on public.calendar_variants to authenticated;
grant select on public.calendar_term_overrides to authenticated;
grant select on public.calendar_exceptions to authenticated;

grant all on public.calendar_variants to service_role;
grant all on public.calendar_term_overrides to service_role;
grant all on public.calendar_exceptions to service_role;

alter table public.calendar_variants enable row level security;
alter table public.calendar_term_overrides enable row level security;
alter table public.calendar_exceptions enable row level security;

-- =========================
-- RLS — no USING (true)
-- =========================

drop policy if exists "calendar_variants official select" on public.calendar_variants;
create policy "calendar_variants official select"
on public.calendar_variants
for select
to authenticated
using (
  is_selectable = true
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

drop policy if exists "calendar_variants admin insert" on public.calendar_variants;
create policy "calendar_variants admin insert"
on public.calendar_variants
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "calendar_variants admin update" on public.calendar_variants;
create policy "calendar_variants admin update"
on public.calendar_variants
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "calendar_variants admin delete" on public.calendar_variants;
create policy "calendar_variants admin delete"
on public.calendar_variants
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "calendar_term_overrides official select" on public.calendar_term_overrides;
create policy "calendar_term_overrides official select"
on public.calendar_term_overrides
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or exists (
    select 1
    from public.calendar_variants v
    where v.id = calendar_term_overrides.variant_id
      and v.is_selectable = true
  )
);

drop policy if exists "calendar_term_overrides admin insert" on public.calendar_term_overrides;
create policy "calendar_term_overrides admin insert"
on public.calendar_term_overrides
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "calendar_term_overrides admin update" on public.calendar_term_overrides;
create policy "calendar_term_overrides admin update"
on public.calendar_term_overrides
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "calendar_term_overrides admin delete" on public.calendar_term_overrides;
create policy "calendar_term_overrides admin delete"
on public.calendar_term_overrides
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "calendar_exceptions official select" on public.calendar_exceptions;
create policy "calendar_exceptions official select"
on public.calendar_exceptions
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or exists (
    select 1
    from public.calendar_variants v
    where v.id = calendar_exceptions.variant_id
      and v.is_selectable = true
  )
);

drop policy if exists "calendar_exceptions admin insert" on public.calendar_exceptions;
create policy "calendar_exceptions admin insert"
on public.calendar_exceptions
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "calendar_exceptions admin update" on public.calendar_exceptions;
create policy "calendar_exceptions admin update"
on public.calendar_exceptions
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "calendar_exceptions admin delete" on public.calendar_exceptions;
create policy "calendar_exceptions admin delete"
on public.calendar_exceptions
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));
