-- P3 Step 4 — preparing status + preparing-state immutability (F1/F2).
--
-- Existing status CHECK was defined inline on create
-- (supabase/migrations/20260807000100_create_lesson_sessions.sql):
--   status text not null default 'scheduled'
--     check (status in ('scheduled', 'prepared', 'completed', 'cancelled'))
-- Constraint name is discovered at apply time (do not hard-code a guess).
--
-- Existing BEFORE UPDATE trigger on lesson_sessions:
--   lesson_sessions_updated_at → public.set_updated_at()
-- This migration adds a second BEFORE UPDATE trigger for preparing freeze.
-- updated_at may change; identity fields may not.
--
-- Teardown (p2e2e) DELETEs lesson_sessions by teacher_id — UPDATE trigger does not apply.
--
-- No new table/column. No DML. No RLS/grants changes. No ai_generations changes.
-- No SECURITY DEFINER. No RPC.

do $$
declare
  status_constraint_name text;
begin
  select c.conname
    into status_constraint_name
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'lesson_sessions'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ~* 'status'
    and pg_get_constraintdef(c.oid) ~* 'scheduled'
  order by c.conname
  limit 1;

  if status_constraint_name is null then
    raise exception
      'P3 Step 4: could not locate lesson_sessions status CHECK constraint to add preparing';
  end if;

  execute format(
    'alter table public.lesson_sessions drop constraint %I',
    status_constraint_name
  );

  alter table public.lesson_sessions
    add constraint lesson_sessions_status_check
    check (
      status in (
        'scheduled',
        'preparing',
        'prepared',
        'completed',
        'cancelled'
      )
    );
end;
$$;

comment on column public.lesson_sessions.status is
  'scheduled | preparing (Prepare claim in progress) | prepared | completed | cancelled. lesson_locked=true means preparation completed, not merely claimed.';

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

drop trigger if exists lesson_sessions_enforce_preparing_state on public.lesson_sessions;

create trigger lesson_sessions_enforce_preparing_state
before update
on public.lesson_sessions
for each row
execute function public.lesson_sessions_enforce_preparing_state();

comment on function public.lesson_sessions_enforce_preparing_state() is
  'P3 Step 4 F1/F2: while status=preparing, freeze identity and allow only preparing→prepared (locked) or preparing→scheduled (unlocked).';
