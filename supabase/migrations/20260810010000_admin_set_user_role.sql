-- Phase 4: Atomic single-role mutation for Admin Users management.
-- Caller identity comes from auth.uid() (JWT). Defense-in-depth Admin check via has_role.
-- Enforces: single application role, no self role-change, never remove the last Admin.
-- Concurrent role mutations are serialized via a transaction-scoped advisory lock so
-- two demotions can never race to zero Admins.

create or replace function public.admin_set_user_role(
  p_target_user_id uuid,
  p_new_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_admin_count integer;
  v_target_exists boolean;
  v_target_is_admin boolean;
begin
  -- Serialize all admin role mutations for this database.
  -- Transaction-scoped: released automatically on commit/rollback.
  perform pg_advisory_xact_lock(hashtext('waraqa_admin_role_mutation'));

  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  if not public.has_role(v_caller, 'admin'::public.app_role) then
    raise exception 'ADMIN_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_target_user_id is null then
    raise exception 'INVALID_TARGET'
      using errcode = 'P0001';
  end if;

  if p_new_role is null then
    raise exception 'INVALID_ROLE'
      using errcode = 'P0001';
  end if;

  -- Phase 4 MVP: Admins cannot change their own role (prevents self-lockout).
  if v_caller = p_target_user_id then
    raise exception 'SELF_ROLE_CHANGE_FORBIDDEN'
      using errcode = 'P0001';
  end if;

  select exists (
    select 1 from auth.users u where u.id = p_target_user_id
  ) into v_target_exists;

  if not v_target_exists then
    raise exception 'USER_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select public.has_role(p_target_user_id, 'admin'::public.app_role)
    into v_target_is_admin;

  -- Last-admin protection: cannot demote the only Admin.
  -- Safe under concurrency because this runs only while holding the advisory lock.
  if p_new_role = 'teacher'::public.app_role and v_target_is_admin then
    select count(*)::integer
      into v_admin_count
      from public.user_roles
     where role = 'admin'::public.app_role;

    if v_admin_count <= 1 then
      raise exception 'LAST_ADMIN'
        using errcode = 'P0001';
    end if;
  end if;

  -- Atomic single-role replace (application model: exactly one role).
  delete from public.user_roles
   where user_id = p_target_user_id;

  insert into public.user_roles (user_id, role)
  values (p_target_user_id, p_new_role);

  -- Post-mutation invariant: the system must never end with zero Admins.
  select count(*)::integer
    into v_admin_count
    from public.user_roles
   where role = 'admin'::public.app_role;

  if v_admin_count < 1 then
    raise exception 'LAST_ADMIN'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to service_role;

comment on function public.admin_set_user_role(uuid, public.app_role) is
  'Admin-only atomic single-role replace. auth.uid()+has_role; advisory xact lock; blocks self-change and last-admin demotion (incl. concurrent).';
