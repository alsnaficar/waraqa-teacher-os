-- Priority 2 — disposable E2E test-user teardown (privileged only).
--
-- Normal archived/approved immutability is unchanged for application traffic.
-- A transaction-local GUC (app.p2e2e_teardown) may allow deletes ONLY when:
--   1) set inside teardown_p2e2e_test_user(), and
--   2) the affected row belongs to a disposable p2e2e.*@waraqa.test auth user.
--
-- teardown_p2e2e_test_user is executable by service_role only.

-- =========================
-- Helpers
-- =========================

create or replace function public.is_p2e2e_test_email(p_email text)
returns boolean
language sql
immutable
as $$
  select p_email ~ '^[pP]2[eE]2[eE]\.(a|b)\.[0-9]+@waraqa\.test$';
$$;

revoke all on function public.is_p2e2e_test_email(text) from public, anon, authenticated;
grant execute on function public.is_p2e2e_test_email(text) to service_role;

create or replace function public.p2e2e_teardown_active()
returns boolean
language sql
stable
as $$
  select nullif(current_setting('app.p2e2e_teardown', true), '') = '1';
$$;

-- Readable by trigger definer; does not grant teardown power by itself.
revoke all on function public.p2e2e_teardown_active() from public, anon, authenticated;
grant execute on function public.p2e2e_teardown_active() to service_role;

create or replace function public.is_p2e2e_test_user_id(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and public.is_p2e2e_test_email(u.email)
  );
$$;

revoke all on function public.is_p2e2e_test_user_id(uuid) from public, anon, authenticated;
grant execute on function public.is_p2e2e_test_user_id(uuid) to service_role;

-- =========================
-- Lifecycle triggers: allow teardown GUC only for disposable test owners
-- =========================

create or replace function public.semester_plans_enforce_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception 'semester plans must be created as draft';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'archived' then
      if not (
        public.p2e2e_teardown_active()
        and public.is_p2e2e_test_user_id(old.user_id)
      ) then
        raise exception 'archived semester plans are immutable';
      end if;
    end if;
    return old;
  end if;

  -- Teardown GUC must never authorize UPDATE of archived plans.
  if old.status = 'archived' then
    raise exception 'archived semester plans are immutable';
  end if;

  if new.status is not distinct from old.status then
    if new.current_version < old.current_version then
      raise exception 'semester plan version cannot decrease';
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'approved' then
    if not public.semester_plan_rpc_is('approve_semester_plan') then
      raise exception 'approval must go through approve_semester_plan()';
    end if;
    new.approved_at := coalesce(new.approved_at, now());
    return new;
  end if;

  if old.status = 'approved' and new.status = 'in_progress' then
    if not public.semester_plan_rpc_is('start_semester_plan_execution') then
      raise exception 'start execution must go through start_semester_plan_execution()';
    end if;
    return new;
  end if;

  if old.status = 'in_progress' and new.status = 'completed' then
    if not public.semester_plan_rpc_is('complete_semester_plan') then
      raise exception 'completion must go through complete_semester_plan()';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
    return new;
  end if;

  if old.status = 'completed' and new.status = 'archived' then
    if not public.semester_plan_rpc_is('archive_semester_plan') then
      raise exception 'archival must go through archive_semester_plan()';
    end if;
    new.archived_at := coalesce(new.archived_at, now());
    return new;
  end if;

  if old.status in ('approved', 'in_progress') and new.status = 'draft' then
    if not public.semester_plan_rpc_is('create_semester_plan_version') then
      raise exception 'reopening a semester plan must go through create_semester_plan_version()';
    end if;
    if new.current_version <= old.current_version then
      raise exception 'reopening a semester plan requires a new version';
    end if;
    return new;
  end if;

  raise exception 'invalid semester plan transition: % → %', old.status, new.status;
end;
$$;

create or replace function public.semester_plan_versions_enforce_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_status public.semester_plan_status;
  plan_owner uuid;
begin
  select p.status, p.user_id
  into plan_status, plan_owner
  from public.semester_plans p
  where p.id = coalesce(new.semester_plan_id, old.semester_plan_id);

  -- Teardown may DELETE versions under an archived plan; never INSERT/UPDATE via GUC.
  if plan_status = 'archived' then
    if tg_op = 'DELETE'
       and public.p2e2e_teardown_active()
       and public.is_p2e2e_test_user_id(plan_owner) then
      return old;
    end if;
    raise exception 'archived semester plan versions are immutable';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      raise exception 'semester plan versions must be created as draft';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      if not (
        public.p2e2e_teardown_active()
        and public.is_p2e2e_test_user_id(plan_owner)
      ) then
        raise exception 'approved semester plan versions cannot be deleted';
      end if;
    end if;
    return old;
  end if;

  -- Teardown GUC must never authorize UPDATE of approved versions.
  if old.status = 'approved' then
    raise exception 'approved semester plan versions are immutable';
  end if;

  if old.status = 'draft' and new.status = 'approved' then
    if not public.semester_plan_rpc_is('approve_semester_plan') then
      raise exception 'version approval must go through approve_semester_plan()';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.planner_entries_enforce_plan_mutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_status public.semester_plan_status;
  plan_id uuid;
  entry_owner uuid;
begin
  plan_id := coalesce(new.semester_plan_id, old.semester_plan_id);
  entry_owner := coalesce(new.user_id, old.user_id);

  if plan_id is null then
    return coalesce(new, old);
  end if;

  select p.status into plan_status
  from public.semester_plans p
  where p.id = plan_id;

  if plan_status is null then
    return coalesce(new, old);
  end if;

  -- Disposable E2E teardown may DELETE linked rows for p2e2e owners only.
  -- INSERT/UPDATE continue through normal production mutability rules.
  if tg_op = 'DELETE'
     and public.p2e2e_teardown_active()
     and public.is_p2e2e_test_user_id(entry_owner) then
    return old;
  end if;

  if plan_status = 'archived' then
    raise exception 'archived semester plans are read-only';
  end if;

  if plan_status <> 'draft' then
    if tg_op = 'DELETE' then
      raise exception 'cannot modify planner entries while semester plan is %', plan_status;
    end if;

    if tg_op = 'INSERT' then
      raise exception 'cannot modify planner entries while semester plan is %', plan_status;
    end if;

    if plan_status in ('approved', 'in_progress', 'completed') then
      if new.week_start_date is distinct from old.week_start_date
         or new.day_of_week is distinct from old.day_of_week
         or new.period is distinct from old.period
         or new.subject is distinct from old.subject
         or new.notes is distinct from old.notes
         or new.user_id is distinct from old.user_id then
        raise exception 'cannot modify planner entries while semester plan is %', plan_status;
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- =========================
-- Privileged teardown RPC (service_role only)
-- =========================

create or replace function public.teardown_p2e2e_test_user(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  email_norm text := lower(trim(p_email));
  plans_deleted integer := 0;
  versions_deleted integer := 0;
  entries_deleted integer := 0;
  sessions_deleted integer := 0;
begin
  if not public.is_p2e2e_test_email(email_norm) then
    raise exception 'teardown refused: email is not a disposable p2e2e test address';
  end if;

  select u.id into uid
  from auth.users u
  where lower(u.email) = email_norm;

  if uid is null then
    return jsonb_build_object(
      'ok', true,
      'email', email_norm,
      'userId', null,
      'note', 'user already absent'
    );
  end if;

  -- Transaction-local flag; cannot persist across requests.
  perform set_config('app.p2e2e_teardown', '1', true);

  delete from public.lesson_sessions where teacher_id = uid;
  get diagnostics sessions_deleted = row_count;

  delete from public.planner_entries where user_id = uid;
  get diagnostics entries_deleted = row_count;

  delete from public.semester_plan_versions v
  using public.semester_plans p
  where v.semester_plan_id = p.id
    and p.user_id = uid;
  get diagnostics versions_deleted = row_count;

  delete from public.semester_plans where user_id = uid;
  get diagnostics plans_deleted = row_count;

  delete from public.calendar_events where user_id = uid;
  delete from public.teacher_timetable where teacher_id = uid;
  delete from public.curriculum_lessons where user_id = uid;
  delete from public.curriculum_files where user_id = uid;
  delete from public.classes where user_id = uid;
  delete from public.grades where user_id = uid;

  -- Payments cascade from subscriptions.
  delete from public.subscriptions where user_id = uid;

  delete from public.semesters where user_id = uid;
  delete from public.academic_years where user_id = uid;
  delete from public.user_roles where user_id = uid;
  delete from public.profiles where id = uid;

  delete from auth.users where id = uid;

  return jsonb_build_object(
    'ok', true,
    'email', email_norm,
    'userId', uid,
    'deleted', jsonb_build_object(
      'semester_plans', plans_deleted,
      'semester_plan_versions', versions_deleted,
      'planner_entries', entries_deleted,
      'lesson_sessions', sessions_deleted
    )
  );
end;
$$;

revoke all on function public.teardown_p2e2e_test_user(text) from public, anon, authenticated;
grant execute on function public.teardown_p2e2e_test_user(text) to service_role;
