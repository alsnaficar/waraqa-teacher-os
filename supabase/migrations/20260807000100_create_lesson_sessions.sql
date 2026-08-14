create extension if not exists pgcrypto;

create table if not exists public.lesson_sessions (
    id uuid primary key default gen_random_uuid(),

    teacher_id uuid not null references auth.users(id) on delete cascade,

    academic_year_id uuid not null references public.academic_years(id),

    semester_id uuid not null references public.semesters(id),

    grade_id uuid references public.grades(id),

    class_id uuid references public.classes(id),

    curriculum_lesson_id uuid not null
        references public.curriculum_lessons(id)
        on delete cascade,

    session_date date not null,

    day_of_week smallint not null
        check (day_of_week between 0 and 6),

    period_number smallint not null
        check (period_number > 0),

    lesson_locked boolean not null default false,

    status text not null default 'scheduled'
        check (status in (
            'scheduled',
            'prepared',
            'completed',
            'cancelled'
        )),

    prepared_at timestamptz,

    completed_at timestamptz,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

create index if not exists idx_lesson_sessions_teacher
on public.lesson_sessions(teacher_id);

create index if not exists idx_lesson_sessions_date
on public.lesson_sessions(session_date);

create index if not exists idx_lesson_sessions_teacher_date
on public.lesson_sessions(teacher_id, session_date);
