-- =============================================================================
-- Waraqa Billing Phase 1 — schema, RLS, seeds, receipt storage
--
-- Official billing calendar is platform-owned and MUST stay separate from
-- teacher-owned public.academic_years / public.semesters.
--
-- Compatibility: existing checkout code still reads/writes plans.price,
-- plans.starts_with, subscriptions.starts_at/expires_at, subscriptions.status
-- ('pending'|'active'), payments.amount, payments.transaction_number, and
-- payments.status ('pending'|'submitted'|'paid'). Those columns are kept and
-- synced to the new canonical fields by triggers. Teacher PostgREST INSERT
-- on subscriptions is revoked; service_role server functions continue to work.
--
-- Academic dates are NOT seeded — no authoritative Saudi calendar is in-repo.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Official billing calendar
-- ---------------------------------------------------------------------------

create table if not exists public.billing_academic_years (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_academic_years_code_key unique (code),
  constraint billing_academic_years_dates_check check (starts_on <= ends_on)
);

create table if not exists public.billing_semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null
    references public.billing_academic_years(id) on delete cascade,
  code text not null,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  sequence integer not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_semesters_dates_check check (starts_on <= ends_on),
  constraint billing_semesters_sequence_check check (sequence > 0),
  constraint billing_semesters_year_code_key unique (academic_year_id, code),
  constraint billing_semesters_year_sequence_key unique (academic_year_id, sequence)
);

create index if not exists idx_billing_semesters_year
  on public.billing_semesters (academic_year_id);

create unique index if not exists billing_academic_years_one_current
  on public.billing_academic_years (is_current)
  where is_current;

create unique index if not exists billing_semesters_one_current_per_year
  on public.billing_semesters (academic_year_id)
  where is_current;

drop trigger if exists billing_academic_years_updated_at on public.billing_academic_years;
create trigger billing_academic_years_updated_at
before update on public.billing_academic_years
for each row execute function public.set_updated_at();

drop trigger if exists billing_semesters_updated_at on public.billing_semesters;
create trigger billing_semesters_updated_at
before update on public.billing_semesters
for each row execute function public.set_updated_at();

comment on table public.billing_academic_years is
  'Platform-owned official academic years for billing. Not teacher academic_years.';
comment on table public.billing_semesters is
  'Platform-owned official semesters for billing. Not teacher semesters.';

-- ---------------------------------------------------------------------------
-- 2. Plans — evolve in place
-- ---------------------------------------------------------------------------

alter table public.plans
  add column if not exists product text,
  add column if not exists tier text,
  add column if not exists term_kind text,
  add column if not exists price_sar numeric(10,2),
  add column if not exists currency text,
  add column if not exists vat_included boolean,
  add column if not exists sort_order integer;

update public.plans
set
  product = coalesce(product, 'core'),
  tier = coalesce(tier, 'standard'),
  term_kind = coalesce(
    term_kind,
    case
      when starts_with in ('semester', 'term') then 'semester'
      else 'academic_year'
    end
  ),
  price_sar = coalesce(price_sar, price),
  currency = coalesce(currency, 'SAR'),
  vat_included = coalesce(vat_included, true),
  sort_order = coalesce(sort_order, 0),
  is_active = coalesce(is_active, true);

alter table public.plans
  alter column product set default 'core',
  alter column tier set default 'standard',
  alter column term_kind set default 'academic_year',
  alter column currency set default 'SAR',
  alter column vat_included set default true,
  alter column sort_order set default 0,
  alter column is_active set default true;

alter table public.plans
  alter column product set not null,
  alter column tier set not null,
  alter column term_kind set not null,
  alter column price_sar set not null,
  alter column currency set not null,
  alter column vat_included set not null,
  alter column sort_order set not null,
  alter column is_active set not null;

alter table public.plans drop constraint if exists plans_product_check;
alter table public.plans
  add constraint plans_product_check check (product in ('core', 'whatsapp'));

alter table public.plans drop constraint if exists plans_tier_check;
alter table public.plans
  add constraint plans_tier_check check (tier in ('standard', 'premium'));

alter table public.plans drop constraint if exists plans_term_kind_check;
alter table public.plans
  add constraint plans_term_kind_check check (term_kind in ('semester', 'academic_year'));

do $$
declare
  bad_count integer;
  bad_ids text;
begin
  select count(*), string_agg(id::text, ', ' order by id)
  into bad_count, bad_ids
  from public.plans
  where price <= 0 or price_sar <= 0;

  if bad_count > 0 then
    raise exception
      'billing_phase1: % plan(s) have price <= 0 (ids: %)',
      bad_count,
      coalesce(bad_ids, '');
  end if;

  select count(*), string_agg(id::text, ', ' order by id)
  into bad_count, bad_ids
  from public.plans
  where price is distinct from price_sar;

  if bad_count > 0 then
    raise exception
      'billing_phase1: % plan(s) have price <> price_sar after backfill (ids: %)',
      bad_count,
      coalesce(bad_ids, '');
  end if;
end;
$$;

alter table public.plans drop constraint if exists plans_price_positive;
alter table public.plans
  add constraint plans_price_positive check (price > 0 and price_sar > 0);

-- Legacy checkout still reads plans.price; keep it identical to price_sar.
alter table public.plans drop constraint if exists plans_price_equals_price_sar;
alter table public.plans
  add constraint plans_price_equals_price_sar check (price = price_sar);

alter table public.plans drop constraint if exists plans_currency_len;
alter table public.plans
  add constraint plans_currency_len check (char_length(currency) = 3);

-- Keep plans.price and plans.price_sar aligned for current checkout code.
create or replace function public.sync_plan_price_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.price_sar is null and new.price is not null then
      new.price_sar := new.price;
    elsif new.price is null and new.price_sar is not null then
      new.price := new.price_sar;
    elsif new.price_sar is not null then
      new.price := new.price_sar;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.price_sar is distinct from old.price_sar then
      new.price := new.price_sar;
    elsif new.price is distinct from old.price then
      new.price_sar := new.price;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists plans_sync_price_fields on public.plans;
create trigger plans_sync_price_fields
before insert or update on public.plans
for each row execute function public.sync_plan_price_fields();

-- ---------------------------------------------------------------------------
-- 3. Launch plan seeds (idempotent). No premium / WhatsApp rows.
-- ---------------------------------------------------------------------------

insert into public.plans (
  code, name, product, tier, term_kind, price, price_sar, currency,
  vat_included, is_active, sort_order, starts_with
)
values
  (
    'core_standard_semester',
    'فصل دراسي',
    'core',
    'standard',
    'semester',
    40,
    40,
    'SAR',
    true,
    true,
    1,
    'semester'
  ),
  (
    'core_standard_academic_year',
    'عام دراسي',
    'core',
    'standard',
    'academic_year',
    70,
    70,
    'SAR',
    true,
    true,
    2,
    'academic_year'
  )
on conflict (code) do update
set
  name = excluded.name,
  product = excluded.product,
  tier = excluded.tier,
  term_kind = excluded.term_kind,
  price = excluded.price,
  price_sar = excluded.price_sar,
  currency = excluded.currency,
  vat_included = excluded.vat_included,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  starts_with = excluded.starts_with,
  updated_at = now();

-- Avoid unique-index collisions with leftover catalogue rows.
update public.plans p
set is_active = false
where p.is_active
  and p.code not in ('core_standard_semester', 'core_standard_academic_year')
  and exists (
    select 1
    from public.plans launch
    where launch.code in ('core_standard_semester', 'core_standard_academic_year')
      and launch.product = p.product
      and launch.tier = p.tier
      and launch.term_kind = p.term_kind
  );

create unique index if not exists plans_active_product_tier_term_uidx
  on public.plans (product, tier, term_kind)
  where is_active;

-- ---------------------------------------------------------------------------
-- 4. Plan entitlements foundation (no feature catalogue invented)
-- ---------------------------------------------------------------------------

create table if not exists public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null,
  created_at timestamptz not null default now(),
  constraint plan_entitlements_plan_feature_key unique (plan_id, feature_key),
  constraint plan_entitlements_feature_key_check check (char_length(feature_key) > 0)
);

create index if not exists idx_plan_entitlements_plan
  on public.plan_entitlements (plan_id);

-- ---------------------------------------------------------------------------
-- 5. Subscriptions — harden in place
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists product text,
  add column if not exists billing_academic_year_id uuid,
  add column if not exists billing_semester_id uuid,
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists created_from_payment_id uuid,
  add column if not exists activated_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspend_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_billing_year_fkey'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_billing_year_fkey
      foreign key (billing_academic_year_id)
      references public.billing_academic_years(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_billing_semester_fkey'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_billing_semester_fkey
      foreign key (billing_semester_id)
      references public.billing_semesters(id)
      on delete restrict;
  end if;
end;
$$;

-- Keep legacy teacher-calendar FKs (academic_year_id / semester_id) for the
-- current checkout writer. Canonical billing FKs are billing_* columns.

update public.subscriptions s
set
  starts_on = coalesce(s.starts_on, s.starts_at),
  ends_on = coalesce(s.ends_on, s.expires_at),
  product = coalesce(
    s.product,
    (select p.product from public.plans p where p.id = s.plan_id),
    'core'
  );

alter table public.subscriptions
  alter column product set default 'core';

alter table public.subscriptions
  alter column product set not null,
  alter column starts_on set not null,
  alter column ends_on set not null;

alter table public.subscriptions drop constraint if exists subscriptions_product_check;
alter table public.subscriptions
  add constraint subscriptions_product_check check (product in ('core', 'whatsapp'));

-- starts_at/expires_at and starts_on/ends_on are all DATE (see 20260804).
-- Exact equality is the type-safe invariant; no timestamp truncation.
do $$
declare
  inverted_count integer;
  inverted_ids text;
  mismatch_count integer;
  mismatch_ids text;
begin
  select count(*), string_agg(id::text, ', ' order by id)
  into inverted_count, inverted_ids
  from public.subscriptions
  where starts_at > expires_at;

  if inverted_count > 0 then
    raise exception
      'billing_phase1: % subscription(s) have starts_at > expires_at (ids: %)',
      inverted_count,
      coalesce(inverted_ids, '');
  end if;

  select count(*), string_agg(id::text, ', ' order by id)
  into mismatch_count, mismatch_ids
  from public.subscriptions
  where starts_on is distinct from starts_at
     or ends_on is distinct from expires_at;

  if mismatch_count > 0 then
    raise exception
      'billing_phase1: % subscription(s) have starts_on/ends_on <> starts_at/expires_at after backfill (ids: %)',
      mismatch_count,
      coalesce(mismatch_ids, '');
  end if;
end;
$$;

alter table public.subscriptions drop constraint if exists subscriptions_dates_check;
alter table public.subscriptions
  add constraint subscriptions_dates_check
  check (
    starts_on <= ends_on
    and starts_at <= expires_at
    and starts_on = starts_at
    and ends_on = expires_at
  );

-- Legacy statuses kept so current server functions keep working.
-- pending ≈ pending_payment; paid-era cancelled rows remain readable.
do $$
declare
  bad_count integer;
  bad_values text;
  bad_ids text;
begin
  select
    count(*),
    string_agg(distinct status, ', ' order by status),
    string_agg(id::text, ', ' order by id)
  into bad_count, bad_values, bad_ids
  from public.subscriptions
  where status is null
     or status not in (
       'pending_payment',
       'scheduled',
       'active',
       'expired',
       'suspended',
       'pending',
       'cancelled'
     );

  if bad_count > 0 then
    raise exception
      'billing_phase1: % subscription(s) have status outside allowed set [%] (ids: %)',
      bad_count,
      coalesce(bad_values, ''),
      coalesce(bad_ids, '');
  end if;
end;
$$;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (
    status in (
      'pending_payment',
      'scheduled',
      'active',
      'expired',
      'suspended',
      'pending',
      'cancelled'
    )
  );

alter table public.subscriptions
  alter column status set default 'pending_payment';

alter table public.subscriptions drop constraint if exists subscriptions_suspend_reason_check;
alter table public.subscriptions
  add constraint subscriptions_suspend_reason_check
  check (status <> 'suspended' or suspend_reason is not null);

create or replace function public.sync_subscription_billing_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  plan_row public.plans%rowtype;
begin
  if new.starts_on is null and new.starts_at is not null then
    new.starts_on := new.starts_at;
  elsif new.starts_at is null and new.starts_on is not null then
    new.starts_at := new.starts_on;
  elsif tg_op = 'UPDATE' then
    if new.starts_on is distinct from old.starts_on then
      new.starts_at := new.starts_on;
    elsif new.starts_at is distinct from old.starts_at then
      new.starts_on := new.starts_at;
    end if;
  elsif new.starts_on is not null then
    new.starts_at := new.starts_on;
  end if;

  if new.ends_on is null and new.expires_at is not null then
    new.ends_on := new.expires_at;
  elsif new.expires_at is null and new.ends_on is not null then
    new.expires_at := new.ends_on;
  elsif tg_op = 'UPDATE' then
    if new.ends_on is distinct from old.ends_on then
      new.expires_at := new.ends_on;
    elsif new.expires_at is distinct from old.expires_at then
      new.ends_on := new.expires_at;
    end if;
  elsif new.ends_on is not null then
    new.expires_at := new.ends_on;
  end if;

  if new.plan_id is not null then
    select * into plan_row from public.plans where id = new.plan_id;
    if found then
      if new.product is null then
        new.product := plan_row.product;
      end if;
    end if;
  end if;

  if new.product is null then
    new.product := 'core';
  end if;

  return new;
end;
$$;

drop trigger if exists subscriptions_sync_billing_fields on public.subscriptions;
create trigger subscriptions_sync_billing_fields
before insert or update on public.subscriptions
for each row execute function public.sync_subscription_billing_fields();

create index if not exists idx_subscriptions_billing_year
  on public.subscriptions (billing_academic_year_id);
create index if not exists idx_subscriptions_billing_semester
  on public.subscriptions (billing_semester_id);
create index if not exists idx_subscriptions_product_status
  on public.subscriptions (user_id, product, status);

-- ---------------------------------------------------------------------------
-- 6. Payments — harden in place
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists user_id uuid,
  add column if not exists provider text,
  add column if not exists provider_payment_id text,
  add column if not exists idempotency_key text,
  add column if not exists amount_sar numeric(10,2),
  add column if not exists discount_sar numeric(10,2),
  add column if not exists net_sar numeric(10,2),
  add column if not exists currency text,
  add column if not exists coupon_id uuid,
  add column if not exists transfer_reference text,
  add column if not exists receipt_path text,
  add column if not exists rejection_reason text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists updated_at timestamptz;

update public.payments p
set
  user_id = coalesce(
    p.user_id,
    (select s.user_id from public.subscriptions s where s.id = p.subscription_id)
  ),
  provider = coalesce(p.provider, 'bank'),
  amount_sar = coalesce(p.amount_sar, p.amount),
  discount_sar = coalesce(p.discount_sar, 0),
  net_sar = coalesce(p.net_sar, coalesce(p.amount_sar, p.amount) - coalesce(p.discount_sar, 0)),
  currency = coalesce(p.currency, 'SAR'),
  transfer_reference = coalesce(p.transfer_reference, p.transaction_number),
  updated_at = coalesce(p.updated_at, p.created_at, now());

do $$
begin
  if exists (select 1 from public.payments where user_id is null) then
    raise exception 'billing_phase1: payments.user_id backfill left null rows; refusing NOT NULL';
  end if;
end;
$$;

alter table public.payments
  alter column provider set default 'bank',
  alter column discount_sar set default 0,
  alter column currency set default 'SAR',
  alter column updated_at set default now();

alter table public.payments
  alter column user_id set not null,
  alter column provider set not null,
  alter column amount_sar set not null,
  alter column discount_sar set not null,
  alter column net_sar set not null,
  alter column currency set not null;

alter table public.payments
  alter column subscription_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_user_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payments_coupon_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_coupon_id_fkey
      foreign key (coupon_id) references public.coupons(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payments_verified_by_fkey'
  ) then
    alter table public.payments
      add constraint payments_verified_by_fkey
      foreign key (verified_by) references public.profiles(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_created_from_payment_fkey'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_created_from_payment_fkey
      foreign key (created_from_payment_id)
      references public.payments(id)
      on delete set null;
  end if;
end;
$$;

alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments
  add constraint payments_provider_check
  check (provider in ('tap', 'moyasar', 'bank'));

-- Legacy pending/paid kept for current activateSubscription / startCheckout.
do $$
declare
  bad_count integer;
  bad_values text;
  bad_ids text;
begin
  select
    count(*),
    string_agg(distinct status, ', ' order by status),
    string_agg(id::text, ', ' order by id)
  into bad_count, bad_values, bad_ids
  from public.payments
  where status is null
     or status not in (
       'created',
       'submitted',
       'verified',
       'failed',
       'rejected',
       'pending',
       'paid'
     );

  if bad_count > 0 then
    raise exception
      'billing_phase1: % payment(s) have status outside allowed set [%] (ids: %)',
      bad_count,
      coalesce(bad_values, ''),
      coalesce(bad_ids, '');
  end if;
end;
$$;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (
    status in (
      'created',
      'submitted',
      'verified',
      'failed',
      'rejected',
      'pending',
      'paid'
    )
  );

alter table public.payments
  alter column status set default 'created';

do $$
declare
  bad_count integer;
  bad_ids text;
begin
  select count(*), string_agg(id::text, ', ' order by id)
  into bad_count, bad_ids
  from public.payments
  where amount < 0
     or amount_sar < 0
     or discount_sar < 0
     or net_sar < 0
     or net_sar is distinct from (amount_sar - discount_sar);

  if bad_count > 0 then
    raise exception
      'billing_phase1: % payment(s) have invalid amount/amount_sar/discount_sar/net_sar (ids: %)',
      bad_count,
      coalesce(bad_ids, '');
  end if;
end;
$$;

alter table public.payments drop constraint if exists payments_amounts_check;
alter table public.payments
  add constraint payments_amounts_check
  check (
    amount_sar >= 0
    and discount_sar >= 0
    and net_sar >= 0
    and net_sar = amount_sar - discount_sar
  );

alter table public.payments drop constraint if exists payments_currency_len;
alter table public.payments
  add constraint payments_currency_len
  check (char_length(currency) = 3);

alter table public.payments drop constraint if exists payments_rejection_reason_check;
alter table public.payments
  add constraint payments_rejection_reason_check
  check (status <> 'rejected' or rejection_reason is not null);

create unique index if not exists payments_provider_payment_id_uidx
  on public.payments (provider_payment_id)
  where provider_payment_id is not null;

create unique index if not exists payments_idempotency_key_uidx
  on public.payments (idempotency_key)
  where idempotency_key is not null;

do $$
declare
  dup_ref_count integer;
  dup_row_count integer;
  dup_refs text;
  dup_ids text;
begin
  select
    count(*),
    coalesce(sum(cnt), 0),
    string_agg(transfer_reference, ', ' order by transfer_reference),
    string_agg(id_list, ' | ' order by transfer_reference)
  into dup_ref_count, dup_row_count, dup_refs, dup_ids
  from (
    select
      transfer_reference,
      count(*) as cnt,
      string_agg(id::text, ',' order by id) as id_list
    from public.payments
    where transfer_reference is not null
      and status not in ('rejected', 'failed')
    group by transfer_reference
    having count(*) > 1
  ) duplicates;

  if coalesce(dup_ref_count, 0) > 0 then
    raise exception
      'billing_phase1: % duplicate transfer_reference value(s) covering % payment(s) [%] (ids: %)',
      dup_ref_count,
      dup_row_count,
      coalesce(dup_refs, ''),
      coalesce(dup_ids, '');
  end if;
end;
$$;

create unique index if not exists payments_bank_transfer_reference_uidx
  on public.payments (transfer_reference)
  where transfer_reference is not null
    and status not in ('rejected', 'failed');

create index if not exists idx_payments_user on public.payments (user_id);
create index if not exists idx_payments_status on public.payments (status);

create or replace function public.sync_payment_billing_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is null and new.subscription_id is not null then
    select s.user_id into new.user_id
    from public.subscriptions s
    where s.id = new.subscription_id;
  end if;

  if new.provider is null then
    new.provider := 'bank';
  end if;

  if new.currency is null then
    new.currency := 'SAR';
  end if;

  if new.discount_sar is null then
    new.discount_sar := 0;
  end if;

  if tg_op = 'INSERT' then
    if new.amount_sar is null and new.amount is not null then
      new.amount_sar := new.amount;
    elsif new.amount is null and new.amount_sar is not null then
      new.amount := new.amount_sar;
    elsif new.amount_sar is not null then
      new.amount := new.amount_sar;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.amount_sar is distinct from old.amount_sar then
      new.amount := new.amount_sar;
    elsif new.amount is distinct from old.amount then
      new.amount_sar := new.amount;
    end if;
  end if;

  if new.amount_sar is not null then
    new.net_sar := new.amount_sar - coalesce(new.discount_sar, 0);
  end if;

  if new.transfer_reference is null and new.transaction_number is not null then
    new.transfer_reference := new.transaction_number;
  elsif new.transaction_number is null and new.transfer_reference is not null then
    new.transaction_number := new.transfer_reference;
  elsif tg_op = 'UPDATE' then
    if new.transfer_reference is distinct from old.transfer_reference then
      new.transaction_number := new.transfer_reference;
    elsif new.transaction_number is distinct from old.transaction_number then
      new.transfer_reference := new.transaction_number;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_sync_billing_fields on public.payments;
create trigger payments_sync_billing_fields
before insert or update on public.payments
for each row execute function public.sync_payment_billing_fields();

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

comment on column public.payments.provider_payment_id is
  'Gateway id; nullable for bank transfers until a reference exists. Unique when present.';

-- ---------------------------------------------------------------------------
-- 7. Billing settings — no secrets
-- ---------------------------------------------------------------------------

create table if not exists public.billing_settings (
  id integer primary key default 1,
  active_electronic_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_settings_singleton check (id = 1),
  constraint billing_settings_provider_check
    check (
      active_electronic_provider is null
      or active_electronic_provider in ('tap', 'moyasar')
    )
);

insert into public.billing_settings (id, active_electronic_provider)
values (1, null)
on conflict (id) do nothing;

drop trigger if exists billing_settings_updated_at on public.billing_settings;
create trigger billing_settings_updated_at
before update on public.billing_settings
for each row execute function public.set_updated_at();

comment on table public.billing_settings is
  'Singleton billing config. Electronic provider id only — API secrets stay in server env/vault.';

-- Lock payment_methods.settings away from PostgREST clients (including admin JWT).
revoke all on public.payment_methods from anon, authenticated;
grant all on public.payment_methods to service_role;

drop policy if exists "payment methods admin read" on public.payment_methods;

comment on column public.payment_methods.settings is
  'MUST NOT store API keys. Provider secrets belong in server environment/vault.';

-- ---------------------------------------------------------------------------
-- 8. Coupons
-- ---------------------------------------------------------------------------

alter table public.coupons
  add column if not exists applies_to_upgrades boolean,
  add column if not exists max_redemptions_per_user integer,
  add column if not exists updated_at timestamptz;

update public.coupons
set
  type = case
    when type in ('percent', 'percentage', 'pct', '%') then 'percent'
    else 'fixed'
  end
where type not in ('percent', 'fixed');

update public.coupons
set value = 100
where type = 'percent' and value > 100;

update public.coupons
set value = 0
where value < 0;

update public.coupons
set
  applies_to_upgrades = coalesce(applies_to_upgrades, false),
  max_redemptions_per_user = coalesce(max_redemptions_per_user, 1),
  max_usage = coalesce(max_usage, 0),
  used_count = coalesce(used_count, 0),
  is_active = coalesce(is_active, true),
  updated_at = coalesce(updated_at, created_at, now());

update public.coupons
set used_count = max_usage
where max_usage > 0 and used_count > max_usage;

alter table public.coupons
  alter column applies_to_upgrades set default false,
  alter column max_redemptions_per_user set default 1,
  alter column max_usage set default 0,
  alter column used_count set default 0,
  alter column is_active set default true,
  alter column updated_at set default now();

alter table public.coupons
  alter column applies_to_upgrades set not null,
  alter column max_redemptions_per_user set not null,
  alter column max_usage set not null,
  alter column used_count set not null,
  alter column is_active set not null;

alter table public.coupons drop constraint if exists coupons_type_check;
alter table public.coupons
  add constraint coupons_type_check check (type in ('percent', 'fixed'));

alter table public.coupons drop constraint if exists coupons_value_check;
alter table public.coupons
  add constraint coupons_value_check
  check (
    (type = 'percent' and value >= 0 and value <= 100)
    or (type = 'fixed' and value >= 0)
  );

alter table public.coupons drop constraint if exists coupons_usage_check;
alter table public.coupons
  add constraint coupons_usage_check
  check (
    max_usage >= 0
    and used_count >= 0
    and max_redemptions_per_user >= 0
    and (max_usage = 0 or used_count <= max_usage)
  );

drop trigger if exists coupons_updated_at on public.coupons;
create trigger coupons_updated_at
before update on public.coupons
for each row execute function public.set_updated_at();

comment on column public.coupons.max_redemptions_per_user is
  'Per-account cap. 1 = once per account; >1 = limited repeats; 0 = unlimited per user.';

create table if not exists public.coupon_plans (
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coupon_id, plan_id)
);

create index if not exists idx_coupon_plans_plan on public.coupon_plans (plan_id);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint coupon_redemptions_coupon_payment_key unique (coupon_id, payment_id)
);

create index if not exists idx_coupon_redemptions_user_coupon
  on public.coupon_redemptions (coupon_id, user_id);

-- ---------------------------------------------------------------------------
-- 9. Billing audit (keep subscription_logs)
-- ---------------------------------------------------------------------------

create table if not exists public.billing_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now(),
  constraint billing_audit_log_action_check check (char_length(action) > 0),
  constraint billing_audit_log_entity_type_check check (char_length(entity_type) > 0)
);

create index if not exists idx_billing_audit_log_entity
  on public.billing_audit_log (entity_type, entity_id);
create index if not exists idx_billing_audit_log_actor
  on public.billing_audit_log (actor_id, created_at desc);

comment on column public.billing_audit_log.reason is
  'Required by application code for sensitive manual admin mutations (Phase 6).';

-- ---------------------------------------------------------------------------
-- 10. Receipt storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('billing-receipts', 'billing-receipts', false)
on conflict (id) do update
set public = false;

drop policy if exists "billing-receipts owner select" on storage.objects;
drop policy if exists "billing-receipts owner insert" on storage.objects;
drop policy if exists "billing-receipts admin select" on storage.objects;

create policy "billing-receipts owner select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'billing-receipts'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "billing-receipts owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'billing-receipts'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "billing-receipts admin select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'billing-receipts'
  and public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- ---------------------------------------------------------------------------
-- 11. RLS
-- ---------------------------------------------------------------------------

-- Calendar: readable catalogue, no client writes.
alter table public.billing_academic_years enable row level security;
alter table public.billing_semesters enable row level security;

revoke all on public.billing_academic_years from anon, authenticated;
revoke all on public.billing_semesters from anon, authenticated;
grant select on public.billing_academic_years to authenticated;
grant select on public.billing_semesters to authenticated;
grant all on public.billing_academic_years to service_role;
grant all on public.billing_semesters to service_role;

drop policy if exists "billing years readable" on public.billing_academic_years;
create policy "billing years readable"
on public.billing_academic_years
for select
to authenticated
using (true);

drop policy if exists "billing semesters readable" on public.billing_semesters;
create policy "billing semesters readable"
on public.billing_semesters
for select
to authenticated
using (true);

-- Plans: keep active SELECT + admin manage.
-- Entitlements: readable catalogue.
alter table public.plan_entitlements enable row level security;
revoke all on public.plan_entitlements from anon, authenticated;
grant select on public.plan_entitlements to authenticated;
grant all on public.plan_entitlements to service_role;

drop policy if exists "plan entitlements readable" on public.plan_entitlements;
create policy "plan entitlements readable"
on public.plan_entitlements
for select
to authenticated
using (true);

-- Subscriptions: teacher SELECT own only. No INSERT/UPDATE/DELETE for authenticated.
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

drop policy if exists "subscriptions owner open pending" on public.subscriptions;

drop policy if exists "subscriptions owner read" on public.subscriptions;
create policy "subscriptions owner read"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "subscriptions admin read" on public.subscriptions;
create policy "subscriptions admin read"
on public.subscriptions
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Payments: teacher SELECT own via user_id (works even when subscription_id is null).
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
grant all on public.payments to service_role;

drop policy if exists "payments owner read" on public.payments;
create policy "payments owner read"
on public.payments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "payments admin read" on public.payments;
create policy "payments admin read"
on public.payments
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Coupons: still unreadable by teachers.
revoke all on public.coupons from anon, authenticated;
grant select on public.coupons to authenticated;
grant all on public.coupons to service_role;

drop policy if exists "coupons admin read" on public.coupons;
create policy "coupons admin read"
on public.coupons
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

alter table public.coupon_plans enable row level security;
revoke all on public.coupon_plans from anon, authenticated;
grant select on public.coupon_plans to authenticated;
grant all on public.coupon_plans to service_role;

drop policy if exists "coupon plans admin read" on public.coupon_plans;
create policy "coupon plans admin read"
on public.coupon_plans
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

alter table public.coupon_redemptions enable row level security;
revoke all on public.coupon_redemptions from anon, authenticated;
grant select on public.coupon_redemptions to authenticated;
grant all on public.coupon_redemptions to service_role;

drop policy if exists "coupon redemptions owner read" on public.coupon_redemptions;
create policy "coupon redemptions owner read"
on public.coupon_redemptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "coupon redemptions admin read" on public.coupon_redemptions;
create policy "coupon redemptions admin read"
on public.coupon_redemptions
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Billing settings: no secrets; teachers may read the active provider id.
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from anon, authenticated;
grant select on public.billing_settings to authenticated;
grant all on public.billing_settings to service_role;

drop policy if exists "billing settings readable" on public.billing_settings;
create policy "billing settings readable"
on public.billing_settings
for select
to authenticated
using (true);

-- Audit: admin read, no client writes.
alter table public.billing_audit_log enable row level security;
revoke all on public.billing_audit_log from anon, authenticated;
grant select on public.billing_audit_log to authenticated;
grant all on public.billing_audit_log to service_role;

drop policy if exists "billing audit admin read" on public.billing_audit_log;
create policy "billing audit admin read"
on public.billing_audit_log
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- subscription_logs remain append-only via service_role (unchanged grants).

commit;
