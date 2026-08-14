-- TASK 22.2 — Teacher-owned tests / assessments foundation.
--
-- Tables: tests, test_questions, test_options, test_submissions, test_answers.
-- Ownership is always auth.uid() = teacher_id (or resolved through parent test).
-- Client teacher_id is never trusted.
--
-- Does NOT modify homework / students / lesson_sessions / ai_generations schemas
-- beyond foreign-key references.

-- ---------------------------------------------------------------------------
-- tests
-- ---------------------------------------------------------------------------

create table if not exists public.tests (
    id uuid primary key default gen_random_uuid(),

    teacher_id uuid not null references auth.users(id) on delete cascade,

    lesson_session_id uuid
        references public.lesson_sessions(id)
        on delete set null,

    source_ai_generation_id uuid
        references public.ai_generations(id)
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
            'published',
            'closed'
        )),

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);

comment on table public.tests is
  'Teacher-owned assessments. Optional lesson_session and AI generation provenance.';

comment on column public.tests.lesson_session_id is
  'Optional owning lesson session. NULL allowed for standalone tests.';

comment on column public.tests.source_ai_generation_id is
  'Optional ai_generations row that seeded this draft. Does not create generations.';

comment on column public.tests.status is
  'draft → published → closed.';

grant select, insert, update, delete
on public.tests
to authenticated;

grant all
on public.tests
to service_role;

alter table public.tests
enable row level security;

drop policy if exists "tests owner" on public.tests;

create policy "tests owner"
on public.tests
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
    and (
        source_ai_generation_id is null
        or exists (
            select 1
            from public.ai_generations g
            where g.id = source_ai_generation_id
              and g.user_id = auth.uid()
        )
    )
);

drop trigger if exists tests_updated_at on public.tests;

create trigger tests_updated_at
before update
on public.tests
for each row
execute function public.set_updated_at();

create index if not exists idx_tests_teacher
on public.tests (teacher_id);

create index if not exists idx_tests_teacher_status
on public.tests (teacher_id, status);

create index if not exists idx_tests_teacher_due_date
on public.tests (teacher_id, due_date);

create index if not exists idx_tests_lesson_session
on public.tests (lesson_session_id);

create index if not exists idx_tests_source_ai_generation
on public.tests (source_ai_generation_id);

-- ---------------------------------------------------------------------------
-- test_questions
-- ---------------------------------------------------------------------------

create table if not exists public.test_questions (
    id uuid primary key default gen_random_uuid(),

    test_id uuid not null
        references public.tests(id)
        on delete cascade,

    position integer not null,

    type text not null
        check (type in (
            'multiple_choice',
            'true_false'
        )),

    prompt text not null,

    points numeric not null default 1
        check (points >= 0),

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint test_questions_test_position_unique
        unique (test_id, position)
);

comment on table public.test_questions is
  'Ordered assessment items. V1 types: multiple_choice, true_false.';

grant select, insert, update, delete
on public.test_questions
to authenticated;

grant all
on public.test_questions
to service_role;

alter table public.test_questions
enable row level security;

drop policy if exists "test questions owner" on public.test_questions;

create policy "test questions owner"
on public.test_questions
for all
to authenticated
using (
    exists (
        select 1
        from public.tests t
        where t.id = test_id
          and t.teacher_id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from public.tests t
        where t.id = test_id
          and t.teacher_id = auth.uid()
    )
);

drop trigger if exists test_questions_updated_at on public.test_questions;

create trigger test_questions_updated_at
before update
on public.test_questions
for each row
execute function public.set_updated_at();

create index if not exists idx_test_questions_test
on public.test_questions (test_id);

-- ---------------------------------------------------------------------------
-- test_options
-- ---------------------------------------------------------------------------

create table if not exists public.test_options (
    id uuid primary key default gen_random_uuid(),

    question_id uuid not null
        references public.test_questions(id)
        on delete cascade,

    position integer not null,

    label text not null,

    is_correct boolean not null default false,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint test_options_question_position_unique
        unique (question_id, position)
);

comment on table public.test_options is
  'Answer choices for MCQ/true_false questions. Exactly one correct option expected for V1.';

grant select, insert, update, delete
on public.test_options
to authenticated;

grant all
on public.test_options
to service_role;

alter table public.test_options
enable row level security;

drop policy if exists "test options owner" on public.test_options;

create policy "test options owner"
on public.test_options
for all
to authenticated
using (
    exists (
        select 1
        from public.test_questions q
        join public.tests t on t.id = q.test_id
        where q.id = question_id
          and t.teacher_id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from public.test_questions q
        join public.tests t on t.id = q.test_id
        where q.id = question_id
          and t.teacher_id = auth.uid()
    )
);

drop trigger if exists test_options_updated_at on public.test_options;

create trigger test_options_updated_at
before update
on public.test_options
for each row
execute function public.set_updated_at();

create index if not exists idx_test_options_question
on public.test_options (question_id);

-- ---------------------------------------------------------------------------
-- test_submissions
-- ---------------------------------------------------------------------------

create table if not exists public.test_submissions (
    id uuid primary key default gen_random_uuid(),

    teacher_id uuid not null references auth.users(id) on delete cascade,

    test_id uuid not null
        references public.tests(id)
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

    max_score numeric,

    feedback text,

    submitted_at timestamptz,

    graded_at timestamptz,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint test_submissions_test_student_unique
        unique (test_id, student_id)
);

comment on table public.test_submissions is
  'Per-student test attempts owned by the teacher. Not student login.';

comment on column public.test_submissions.status is
  'pending → submitted → graded.';

grant select, insert, update, delete
on public.test_submissions
to authenticated;

grant all
on public.test_submissions
to service_role;

alter table public.test_submissions
enable row level security;

drop policy if exists "test submissions owner" on public.test_submissions;

create policy "test submissions owner"
on public.test_submissions
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
        from public.tests t
        where t.id = test_id
          and t.teacher_id = auth.uid()
    )
);

drop trigger if exists test_submissions_updated_at on public.test_submissions;

create trigger test_submissions_updated_at
before update
on public.test_submissions
for each row
execute function public.set_updated_at();

create index if not exists idx_test_submissions_teacher
on public.test_submissions (teacher_id);

create index if not exists idx_test_submissions_test
on public.test_submissions (test_id);

create index if not exists idx_test_submissions_student
on public.test_submissions (student_id);

create index if not exists idx_test_submissions_teacher_status
on public.test_submissions (teacher_id, status);

-- ---------------------------------------------------------------------------
-- test_answers
-- ---------------------------------------------------------------------------

create table if not exists public.test_answers (
    id uuid primary key default gen_random_uuid(),

    submission_id uuid not null
        references public.test_submissions(id)
        on delete cascade,

    question_id uuid not null
        references public.test_questions(id)
        on delete cascade,

    selected_option_id uuid
        references public.test_options(id)
        on delete set null,

    boolean_answer boolean,

    is_correct boolean,

    points_awarded numeric,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint test_answers_submission_question_unique
        unique (submission_id, question_id)
);

comment on table public.test_answers is
  'Per-question responses for a test submission. Grading columns reserved for later tasks.';

grant select, insert, update, delete
on public.test_answers
to authenticated;

grant all
on public.test_answers
to service_role;

alter table public.test_answers
enable row level security;

drop policy if exists "test answers owner" on public.test_answers;

create policy "test answers owner"
on public.test_answers
for all
to authenticated
using (
    exists (
        select 1
        from public.test_submissions s
        where s.id = submission_id
          and s.teacher_id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from public.test_submissions s
        where s.id = submission_id
          and s.teacher_id = auth.uid()
    )
);

drop trigger if exists test_answers_updated_at on public.test_answers;

create trigger test_answers_updated_at
before update
on public.test_answers
for each row
execute function public.set_updated_at();

create index if not exists idx_test_answers_submission
on public.test_answers (submission_id);

create index if not exists idx_test_answers_question
on public.test_answers (question_id);

-- Keep answer.question on the same test as answer.submission; option on same question.
create or replace function public.enforce_test_answer_consistency()
returns trigger
language plpgsql
as $$
declare
  submission_test uuid;
  question_test uuid;
  option_question uuid;
begin
  select s.test_id
  into submission_test
  from public.test_submissions s
  where s.id = new.submission_id;

  if submission_test is null then
    raise exception 'test answer submission not found';
  end if;

  select q.test_id
  into question_test
  from public.test_questions q
  where q.id = new.question_id;

  if question_test is null then
    raise exception 'test answer question not found';
  end if;

  if submission_test is distinct from question_test then
    raise exception 'test answer question does not belong to the submission test';
  end if;

  if new.selected_option_id is not null then
    select o.question_id
    into option_question
    from public.test_options o
    where o.id = new.selected_option_id;

    if option_question is null then
      raise exception 'test answer selected option not found';
    end if;

    if option_question is distinct from new.question_id then
      raise exception 'test answer selected option does not belong to the question';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists test_answers_consistency on public.test_answers;

create trigger test_answers_consistency
before insert or update
on public.test_answers
for each row
execute function public.enforce_test_answer_consistency();
