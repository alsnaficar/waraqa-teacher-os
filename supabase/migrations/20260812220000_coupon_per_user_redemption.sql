-- Phase 5.1: Atomic per-user coupon redemption insert.
-- Server-only (service_role). Locks the coupon row, verifies payment
-- ownership (payments.id + payments.user_id), enforces
-- max_redemptions_per_user, preserves (coupon_id, payment_id) idempotency.
-- Global used_count / max_usage CAS remains in application code after this RPC.
-- Does NOT bind the resolved coupon to payments.coupon_id (legacy checkout-log path).

create or replace function public.try_insert_coupon_redemption(
  p_coupon_id uuid,
  p_user_id uuid,
  p_payment_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if p_coupon_id is null or p_user_id is null or p_payment_id is null then
    raise exception 'INVALID_COUPON_REDEMPTION_ARGS'
      using errcode = 'P0001';
  end if;

  -- Serialize per-coupon redemption inserts with the coupon row lock.
  -- Released when this RPC transaction ends (before app-level used_count CAS).
  select coalesce(max_redemptions_per_user, 1)
    into v_limit
    from public.coupons
   where id = p_coupon_id
   for update;

  if not found then
    raise exception 'COUPON_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  -- Defense-in-depth: do not trust p_user_id without a matching payment row.
  if not exists (
    select 1
      from public.payments
     where id = p_payment_id
       and user_id = p_user_id
  ) then
    raise exception 'PAYMENT_OWNER_MISMATCH'
      using errcode = 'P0001';
  end if;

  -- Same-payment idempotency: must not consume another per-user slot.
  -- MUST run before the per-user quota count.
  if exists (
    select 1
      from public.coupon_redemptions
     where coupon_id = p_coupon_id
       and payment_id = p_payment_id
  ) then
    return 'existing';
  end if;

  -- 0 = unlimited per user (global max_usage still enforced by the app).
  if v_limit > 0 then
    select count(*)::integer
      into v_count
      from public.coupon_redemptions
     where coupon_id = p_coupon_id
       and user_id = p_user_id;

    if v_count >= v_limit then
      return 'per_user_exhausted';
    end if;
  end if;

  insert into public.coupon_redemptions (coupon_id, user_id, payment_id)
  values (p_coupon_id, p_user_id, p_payment_id);

  return 'inserted';
exception
  when unique_violation then
    -- Concurrent same-payment insert: treat as idempotent success.
    return 'existing';
end;
$$;

revoke all on function public.try_insert_coupon_redemption(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.try_insert_coupon_redemption(uuid, uuid, uuid)
  to service_role;

comment on function public.try_insert_coupon_redemption(uuid, uuid, uuid) is
  'Service-role only. Atomic coupon_redemptions insert with payment-owner check and per-user cap (NULL→1, 0=unlimited). Returns inserted|existing|per_user_exhausted.';
