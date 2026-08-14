-- TASK 20.5-B — Teacher-owned students + homework submissions.
--
-- Students are a teacher roster (not auth accounts).
-- Submissions link homework ↔ student under the same teacher.
-- Client teacher_id is never trusted; ownership is auth.uid().
-- No school/org hierarchy. No Madrasati student integration.

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------

create table if not exists public.students (
    id uuid primary key default gen_random_uuid(),

    teacher_id uuid not null references auth.users(id) on delete cascade,

    full_name text not null,

    class_id uuid
        references public.classes(id)
        on delete set null,

    grade_id uuid
        references public.grades(id)
        on delete set null,

    student_code text,

    active boolean not null default true,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

comment on table public.students is
  'Teacher-owned student roster for homework submissions. Not auth users.';

comment on column public.students.student_code is
  'Optional external/import code. Unique per teacher when present.';

grant select, insert, update, delete
on public.students
to authenticated;

grant all
on public.students
to service_role;

alter table public.students
enable row level security;

drop policy if exists "students owner" on public.students;

create policy "students owner"
on public.students
for all
to authenticated
using (auth.uid() = teacher_id)
with check (
    auth.uid() = teacher_id
    and (
        class_id is null
        or exists (
            select 1
            from public.classes c
            where c.id = class_id
              and c.user_id = auth.uid()
        )
    )
    and (
        grade_id is null
        or exists (
            select 1
            from public.grades g
            where g.id = grade_id
              and g.user_id = auth.uid()
        )
    )
);

drop trigger if exists students_updated_at on public.students;

create trigger students_updated_at
before update
on public.students
for each row
execute function public.set_updated_at();

create index if not exists idx_students_teacher
on public.students (teacher_id);

create index if not exists idx_students_teacher_active
on public.students (teacher_id, active);

create index if not exists idx_students_class
on public.students (class_id);

create index if not exists idx_students_grade
on public.students (grade_id);

create unique index if not exists idx_students_teacher_code_unique
on public.students (teacher_id, student_code)
where student_code is not null;

-- ---------------------------------------------------------------------------
-- homework_submissions
-- ---------------------------------------------------------------------------

create table if not exists public.homework_submissions (
    id uuid primary key default gen_random_uuid(),

    teacher_id uuid not null references auth.users(id) on delete cascade,

    homework_id uuid not null
        references public.homework(id)
        on delete cascade,

    student_id uuid not null
        references public.students(id)
        on delete cascade,

    status text not null default 'pending'
        check (status in (
            'pending',
            'submitted',
            'graded'
        )),

    score numeric,

    feedback text,

    submitted_at timestamptz,

    graded_at timestamptz,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint homework_submissions_homework_student_unique
        unique (homework_id, student_id)
);

comment on table public.homework_submissions is
  'Per-student homework work records owned by the teacher. Not student login.';

comment on column public.homework_submissions.status is
  'pending → submitted → graded (manual grading V1).';

grant select, insert, update, delete
on public.homework_submissions
to authenticated;

grant all
on public.homework_submissions
to service_role;

alter table public.homework_submissions
enable row level security;

drop policy if exists "homework submissions owner" on public.homework_submissions;

create policy "homework submissions owner"
on public.homework_submissions
for all
to authenticated
using (auth.uid() = teacher_id)
with check (
    auth.uid() = teacher_id
    and exists (
        select 1
        from public.students s
        where s.id = student_id
          and s.teacher_id = auth.uid()
    )
    and exists (
        select 1
        from public.homework h
        where h.id = homework_id
          and h.teacher_id = auth.uid()
    )
);

drop trigger if exists homework_submissions_updated_at on public.homework_submissions;

create trigger homework_submissions_updated_at
before update
on public.homework_submissions
for each row
execute function public.set_updated_at();

create index if not exists idx_homework_submissions_teacher
on public.homework_submissions (teacher_id);

create index if not exists idx_homework_submissions_homework
on public.homework_submissions (homework_id);

create index if not exists idx_homework_submissions_student
on public.homework_submissions (student_id);

create index if not exists idx_homework_submissions_teacher_status
on public.homework_submissions (teacher_id, status);
