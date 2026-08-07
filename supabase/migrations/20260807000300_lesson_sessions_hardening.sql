-- Lesson Sessions hardening.
--
-- 20260807000100_create_lesson_sessions.sql created the table but left it without
-- row level security, grants, an updated_at trigger, or the indexes needed by the
-- teacher/date/status access patterns. Without RLS every teacher can read and write
-- every other teacher's sessions, so this migration closes that hole and makes
-- session generation idempotent.

grant select, insert, update, delete
on public.lesson_sessions
to authenticated;

grant all
on public.lesson_sessions
to service_role;

alter table public.lesson_sessions
enable row level security;

drop policy if exists "lesson sessions owner" on public.lesson_sessions;

create policy "lesson sessions owner"
on public.lesson_sessions
for all
to authenticated
using (auth.uid() = teacher_id)
with check (auth.uid() = teacher_id);

drop trigger if exists lesson_sessions_updated_at on public.lesson_sessions;

create trigger lesson_sessions_updated_at
before update
on public.lesson_sessions
for each row
execute function public.set_updated_at();

-- One session per teacher per period per day. Lets generation upsert instead of
-- duplicating rows every time it re-runs.
create unique index if not exists idx_lesson_sessions_unique_slot
on public.lesson_sessions (
    teacher_id,
    session_date,
    period_number
);

create index if not exists idx_lesson_sessions_curriculum_lesson
on public.lesson_sessions (curriculum_lesson_id);

create index if not exists idx_lesson_sessions_academic_year
on public.lesson_sessions (academic_year_id);

create index if not exists idx_lesson_sessions_semester
on public.lesson_sessions (semester_id);

create index if not exists idx_lesson_sessions_grade
on public.lesson_sessions (grade_id);

create index if not exists idx_lesson_sessions_class
on public.lesson_sessions (class_id);

create index if not exists idx_lesson_sessions_teacher_status
on public.lesson_sessions (teacher_id, status);
