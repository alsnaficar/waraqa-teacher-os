-- TASK 8D — track whether curriculum_lesson_id came from the planner or a manual override.
-- Additive only. Existing rows receive 'plan' via column DEFAULT (no UPDATE backfill).
-- Extends preparing-state immutability to curriculum_lesson_source (same trigger).

alter table public.lesson_sessions
  add column if not exists curriculum_lesson_source text not null default 'plan';

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'lesson_sessions'
      and c.conname = 'lesson_sessions_curriculum_lesson_source_check'
  ) then
    alter table public.lesson_sessions
      add constraint lesson_sessions_curriculum_lesson_source_check
      check (curriculum_lesson_source in ('plan', 'manual'));
  end if;
end;
$$;

comment on column public.lesson_sessions.curriculum_lesson_source is
  'plan = curriculum_lesson_id selected by planner/timetable matching (DI-02); manual = teacher override via changeLesson. Automatic P2 stale-plan refresh must never overwrite manual.';

create or replace function public.lesson_sessions_enforce_preparing_state()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from 'preparing' then
    return new;
  end if;

  -- Freeze session identity / context while preparing.
  if new.id is distinct from old.id
     or new.teacher_id is distinct from old.teacher_id
     or new.academic_year_id is distinct from old.academic_year_id
     or new.semester_id is distinct from old.semester_id
     or new.grade_id is distinct from old.grade_id
     or new.class_id is distinct from old.class_id
     or new.curriculum_lesson_id is distinct from old.curriculum_lesson_id
     or new.curriculum_lesson_source is distinct from old.curriculum_lesson_source
     or new.session_date is distinct from old.session_date
     or new.day_of_week is distinct from old.day_of_week
     or new.period_number is distinct from old.period_number
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'lesson_sessions preparing: identity/context fields are immutable (F1)';
  end if;

  if new.status = 'prepared' then
    if new.lesson_locked is not true then
      raise exception
        'lesson_sessions preparing→prepared requires lesson_locked = true';
    end if;
    if new.prepared_at is null then
      raise exception
        'lesson_sessions preparing→prepared requires prepared_at';
    end if;
    return new;
  end if;

  if new.status = 'scheduled' then
    if new.lesson_locked is distinct from false then
      raise exception
        'lesson_sessions preparing→scheduled requires lesson_locked = false';
    end if;
    if new.prepared_at is not null then
      raise exception
        'lesson_sessions preparing→scheduled requires prepared_at IS NULL';
    end if;
    if new.completed_at is distinct from old.completed_at then
      raise exception
        'lesson_sessions preparing→scheduled must not change completed_at';
    end if;
    return new;
  end if;

  raise exception
    'lesson_sessions preparing: status transition % → % is not allowed (F2)',
    old.status,
    new.status;
end;
$$;

comment on function public.lesson_sessions_enforce_preparing_state() is
  'P3 Step 4 F1/F2 + TASK 8D: while status=preparing, freeze identity/context (including curriculum_lesson_source) and allow only preparing→prepared (locked) or preparing→scheduled (unlocked).';
