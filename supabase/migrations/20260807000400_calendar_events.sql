-- Calendar events (holidays, exams, remote-learning days).
--
-- 20260806100000_academic_calendar.sql tried to introduce this table alongside a
-- second, globally scoped `academic_years`. That migration cannot apply, because
-- 20260721103657 already created a per-teacher `academic_years`, so it aborts on
-- "relation already exists" and calendar_events never gets created — even though
-- the planner engine reads it on every schedule generation.
--
-- This migration creates the table against the schema that actually exists:
-- per-teacher, owner-scoped, and pointing at `semesters` rather than the
-- `academic_terms` table that never materialised.

create table if not exists public.calendar_events (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null references auth.users(id) on delete cascade,

    academic_year_id uuid references public.academic_years(id) on delete cascade,

    semester_id uuid references public.semesters(id) on delete set null,

    title text not null,

    event_type text not null default 'holiday'
        check (event_type in (
            'school_start',
            'school_end',
            'holiday',
            'long_weekend',
            'national_day',
            'foundation_day',
            'exam',
            'remote_learning',
            'custom'
        )),

    starts_at date not null,

    ends_at date not null,

    is_teaching_day boolean not null default false,

    is_remote boolean not null default false,

    notes text,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint calendar_events_dates_check check (ends_at >= starts_at)
);

grant select, insert, update, delete
on public.calendar_events
to authenticated;

grant all
on public.calendar_events
to service_role;

alter table public.calendar_events
enable row level security;

drop policy if exists "calendar events owner" on public.calendar_events;

create policy "calendar events owner"
on public.calendar_events
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists calendar_events_updated_at on public.calendar_events;

create trigger calendar_events_updated_at
before update
on public.calendar_events
for each row
execute function public.set_updated_at();

create index if not exists idx_calendar_events_user
on public.calendar_events (user_id);

create index if not exists idx_calendar_events_year
on public.calendar_events (academic_year_id);

create index if not exists idx_calendar_events_semester
on public.calendar_events (semester_id);

create index if not exists idx_calendar_events_dates
on public.calendar_events (user_id, starts_at, ends_at);

create index if not exists idx_calendar_events_teaching_day
on public.calendar_events (user_id, is_teaching_day);
