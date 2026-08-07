create table if not exists public.teacher_timetable (
    id uuid primary key default gen_random_uuid(),

    teacher_id uuid not null references auth.users(id) on delete cascade,

    day_of_week smallint not null,
    period smallint not null,

    subject text not null,

    grade text not null,

    class_name text not null,

    classroom text,

    starts_at time,

    ends_at time,

    active boolean not null default true,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

grant select, insert, update, delete
on public.teacher_timetable
to authenticated;

grant all
on public.teacher_timetable
to service_role;

alter table public.teacher_timetable
enable row level security;

create policy "teacher timetable owner"
on public.teacher_timetable
for all
to authenticated
using (auth.uid() = teacher_id)
with check (auth.uid() = teacher_id);

create trigger teacher_timetable_updated_at
before update
on public.teacher_timetable
for each row
execute function public.set_updated_at();

create index if not exists idx_teacher_timetable_teacher
on public.teacher_timetable (teacher_id);

create index if not exists idx_teacher_timetable_day
on public.teacher_timetable (teacher_id, day_of_week);

create unique index if not exists idx_teacher_timetable_unique_slot
on public.teacher_timetable (
    teacher_id,
    day_of_week,
    period
);
