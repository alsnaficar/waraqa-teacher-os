-- TASK 20.3 — Homework management foundation.
--
-- Teacher-owned homework assignments. Optional binding to lesson_sessions.
-- Ownership is always auth.uid() = teacher_id; client teacher_id is never trusted.
-- When lesson_session_id is set, WITH CHECK requires the session to belong to
-- the same authenticated teacher (same pattern as ai_generations session binding).
--
-- No changes to lesson_sessions / reports / AI / timetable schemas.

create table if not exists public.homework (
    id uuid primary key default gen_random_uuid(),

    teacher_id uuid not null references auth.users(id) on delete cascade,

    lesson_session_id uuid
        references public.lesson_sessions(id)
        on delete set null,

    title text not null,

    instructions text not null default '',

    subject text,

    grade text,

    class_name text,

    due_date date,

    status text not null default 'draft'
        check (status in (
            'draft',
            'assigned',
            'collected',
            'corrected'
        )),

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

comment on table public.homework is
  'Teacher-owned homework assignments. Optional lesson_session binding.';

comment on column public.homework.lesson_session_id is
  'Optional owning lesson session. NULL allowed for standalone homework.';

comment on column public.homework.status is
  'draft → assigned → collected → corrected (management + correction pipeline).';

grant select, insert, update, delete
on public.homework
to authenticated;

grant all
on public.homework
to service_role;

alter table public.homework
enable row level security;

drop policy if exists "homework owner" on public.homework;

create policy "homework owner"
on public.homework
for all
to authenticated
using (auth.uid() = teacher_id)
with check (
    auth.uid() = teacher_id
    and (
        lesson_session_id is null
        or exists (
            select 1
            from public.lesson_sessions s
            where s.id = lesson_session_id
              and s.teacher_id = auth.uid()
        )
    )
);

drop trigger if exists homework_updated_at on public.homework;

create trigger homework_updated_at
before update
on public.homework
for each row
execute function public.set_updated_at();

create index if not exists idx_homework_teacher
on public.homework (teacher_id);

create index if not exists idx_homework_teacher_status
on public.homework (teacher_id, status);

create index if not exists idx_homework_teacher_due_date
on public.homework (teacher_id, due_date);

create index if not exists idx_homework_lesson_session
on public.homework (lesson_session_id);
