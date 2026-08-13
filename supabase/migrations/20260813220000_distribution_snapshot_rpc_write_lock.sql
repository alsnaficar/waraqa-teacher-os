-- Lock distribution snapshot writes to approve_distribution_snapshot.
-- Direct PostgREST INSERT/UPDATE/DELETE is denied for authenticated JWTs.
-- SELECT for owners/admins is preserved.
-- SECURITY INVOKER RPC remains the only write path: it sets a
-- transaction-local GUC after validation so RLS write policies can pass.
-- Does not use SECURITY DEFINER, service_role, or USING(true).
-- Does not disable RLS. Does not touch planner/session/calendar tables.
-- Not applied until an explicit db push is requested.

-- =========================
-- RPC GUC gate (read-only helper)
-- =========================

create or replace function public.distribution_snapshot_rpc_is(expected text)
returns boolean
language sql
stable
as $$
  select nullif(current_setting('app.distribution_snapshot_rpc', true), '')
    is not distinct from expected;
$$;

revoke all on function public.distribution_snapshot_rpc_is(text)
  from public, anon;

grant execute on function public.distribution_snapshot_rpc_is(text)
  to authenticated;

-- =========================
-- Table grants: keep SELECT + RPC-required writes, drop DELETE
-- =========================

alter table public.distribution_snapshots enable row level security;
alter table public.distribution_snapshot_items enable row level security;

revoke all on public.distribution_snapshots from authenticated;
revoke all on public.distribution_snapshot_items from authenticated;

grant select, insert, update on public.distribution_snapshots to authenticated;
grant select, insert on public.distribution_snapshot_items to authenticated;

-- =========================
-- RLS: preserve SELECT, gate writes on RPC GUC
-- =========================

drop policy if exists "distribution_snapshots owner all" on public.distribution_snapshots;
drop policy if exists "distribution_snapshots select owner" on public.distribution_snapshots;
drop policy if exists "distribution_snapshots insert rpc" on public.distribution_snapshots;
drop policy if exists "distribution_snapshots update rpc" on public.distribution_snapshots;

create policy "distribution_snapshots select owner"
on public.distribution_snapshots
for select
to authenticated
using (public.is_semester_plan_owner(semester_plan_id));

create policy "distribution_snapshots insert rpc"
on public.distribution_snapshots
for insert
to authenticated
with check (
  public.is_semester_plan_owner(semester_plan_id)
  and public.has_role(auth.uid(), 'admin'::public.app_role)
  and public.distribution_snapshot_rpc_is('approve_distribution_snapshot')
);

create policy "distribution_snapshots update rpc"
on public.distribution_snapshots
for update
to authenticated
using (
  public.is_semester_plan_owner(semester_plan_id)
  and public.has_role(auth.uid(), 'admin'::public.app_role)
  and public.distribution_snapshot_rpc_is('approve_distribution_snapshot')
)
with check (
  public.is_semester_plan_owner(semester_plan_id)
  and public.has_role(auth.uid(), 'admin'::public.app_role)
  and public.distribution_snapshot_rpc_is('approve_distribution_snapshot')
);

drop policy if exists "distribution_snapshot_items owner all" on public.distribution_snapshot_items;
drop policy if exists "distribution_snapshot_items select owner" on public.distribution_snapshot_items;
drop policy if exists "distribution_snapshot_items insert rpc" on public.distribution_snapshot_items;

create policy "distribution_snapshot_items select owner"
on public.distribution_snapshot_items
for select
to authenticated
using (
  exists (
    select 1
    from public.distribution_snapshots s
    where s.id = snapshot_id
      and public.is_semester_plan_owner(s.semester_plan_id)
  )
);

create policy "distribution_snapshot_items insert rpc"
on public.distribution_snapshot_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.distribution_snapshots s
    where s.id = snapshot_id
      and public.is_semester_plan_owner(s.semester_plan_id)
  )
  and public.has_role(auth.uid(), 'admin'::public.app_role)
  and public.distribution_snapshot_rpc_is('approve_distribution_snapshot')
);

-- No DELETE policy on either table: default-deny under RLS.
-- No UPDATE policy on items: RPC does not update items.

-- =========================
-- RPC: set transaction-local GUC after validation, before writes
-- =========================

create or replace function public.approve_distribution_snapshot(
  p_semester_plan_id uuid,
  p_spreadsheet_id text,
  p_worksheet_name text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_plan public.semester_plans;
  v_version public.semester_plan_versions;
  v_snapshot_id uuid;
  v_item_count integer := 0;
  v_total_periods integer := 0;
  v_item jsonb;
  v_order integer;
  v_periods integer;
  v_lesson text;
  v_seen_orders integer[] := '{}';
begin
  if v_caller is null then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  if not public.has_role(v_caller, 'admin'::public.app_role) then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  if p_semester_plan_id is null then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  select *
    into v_plan
    from public.semester_plans
   where id = p_semester_plan_id
   for update;

  if not found then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  if not public.is_semester_plan_owner(v_plan.id) then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  if v_plan.status is distinct from 'draft' then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  select *
    into v_version
    from public.semester_plan_versions
   where semester_plan_id = v_plan.id
     and version_number = v_plan.current_version
   for update;

  if not found then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  if p_spreadsheet_id is null
     or char_length(btrim(p_spreadsheet_id)) not between 1 and 128 then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  if p_worksheet_name is null
     or char_length(btrim(p_worksheet_name)) not between 1 and 100 then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) < 1 then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  for v_item in
    select elem.item
      from jsonb_array_elements(p_items) as elem(item)
  loop
    begin
      v_order := (v_item->>'order_index')::integer;
      v_periods := (v_item->>'periods')::integer;
    exception
      when others then
        raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
    end;

    v_lesson := btrim(coalesce(v_item->>'lesson', ''));

    if v_order is null or v_order < 1
       or v_periods is null or v_periods < 1
       or v_lesson = '' then
      raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
    end if;

    if v_order = any (v_seen_orders) then
      raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
    end if;

    v_seen_orders := array_append(v_seen_orders, v_order);
    v_item_count := v_item_count + 1;
    v_total_periods := v_total_periods + v_periods;
  end loop;

  if v_item_count < 1 or v_total_periods < 1 then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  perform set_config(
    'app.distribution_snapshot_rpc',
    'approve_distribution_snapshot',
    true
  );

  update public.distribution_snapshots
     set is_current = false
   where semester_plan_version_id = v_version.id
     and is_current = true;

  insert into public.distribution_snapshots (
    semester_plan_id,
    semester_plan_version_id,
    spreadsheet_id,
    worksheet_name,
    source,
    item_count,
    total_periods,
    approved_by,
    is_current
  )
  values (
    v_plan.id,
    v_version.id,
    btrim(p_spreadsheet_id),
    btrim(p_worksheet_name),
    'google_sheets',
    v_item_count,
    v_total_periods,
    v_caller,
    true
  )
  returning id into v_snapshot_id;

  insert into public.distribution_snapshot_items (
    snapshot_id,
    order_index,
    unit,
    lesson,
    periods,
    notes,
    curriculum_lesson_id
  )
  select
    v_snapshot_id,
    (elem.item->>'order_index')::integer,
    coalesce(elem.item->>'unit', ''),
    btrim(elem.item->>'lesson'),
    (elem.item->>'periods')::integer,
    coalesce(elem.item->>'notes', ''),
    nullif(btrim(coalesce(elem.item->>'curriculum_lesson_id', '')), '')::uuid
  from jsonb_array_elements(p_items) as elem(item);

  if (
    select count(*)::integer
      from public.distribution_snapshot_items
     where snapshot_id = v_snapshot_id
  ) is distinct from v_item_count then
    raise exception 'تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.';
  end if;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'semester_plan_id', v_plan.id,
    'semester_plan_version_id', v_version.id,
    'item_count', v_item_count,
    'total_periods', v_total_periods
  );
end;
$$;

revoke all on function public.approve_distribution_snapshot(uuid, text, text, jsonb)
  from public, anon;

grant execute on function public.approve_distribution_snapshot(uuid, text, text, jsonb)
  to authenticated;
