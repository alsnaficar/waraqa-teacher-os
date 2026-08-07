-- Row level security for the subscription and payment tables.
--
-- 20260804_subscription_engine.sql created plans, subscriptions, payments,
-- payment_methods, coupons and subscription_logs with no RLS, no policies and
-- no grants. Supabase grants every table in `public` to anon and authenticated
-- by default, so with RLS off all six were readable *and writable* through
-- PostgREST by anyone holding the publishable key -- which ships in the browser
-- bundle. That allowed a visitor to grant themselves an active subscription,
-- mark a payment as paid, read every discount code, read any other teacher's
-- billing history, and rewrite the audit log.
--
-- The rule applied here: a teacher may read their own billing data and may open
-- a *pending* subscription, but may not otherwise write anything. Every state
-- change that involves money -- activating a subscription, recording a payment,
-- consuming a coupon, appending to the audit log -- belongs to service_role,
-- which bypasses RLS and is only reachable from server code.

-- =========================
-- plans (shared catalogue)
-- =========================

revoke all on public.plans from anon, authenticated;
grant select on public.plans to authenticated;
grant all on public.plans to service_role;

alter table public.plans enable row level security;

drop policy if exists "plans readable when active" on public.plans;

-- is_active is nullable; a NULL is treated as not-visible, which fails closed.
create policy "plans readable when active"
on public.plans
for select
to authenticated
using (is_active);

drop policy if exists "plans admin manage" on public.plans;

create policy "plans admin manage"
on public.plans
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop trigger if exists plans_updated_at on public.plans;

create trigger plans_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

-- =========================================
-- payment_methods (provider configuration)
-- =========================================
--
-- This table is provider config, not saved cards: it has no user_id and its
-- `settings` jsonb is where merchant IDs and API credentials would live. No
-- teacher gets access to the table itself; checkout reads the safe view below.

-- The table-level SELECT below is gated by the admin-only policy that follows:
-- a non-admin holds the privilege but matches no rows, so they read nothing.
revoke all on public.payment_methods from anon, authenticated;
grant select on public.payment_methods to authenticated;
grant all on public.payment_methods to service_role;

alter table public.payment_methods enable row level security;

drop policy if exists "payment methods admin read" on public.payment_methods;

create policy "payment methods admin read"
on public.payment_methods
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Exposes only the columns a checkout screen needs and never `settings`.
-- Left as a security-definer view on purpose: it must read past the base
-- table's RLS, and its column list is fixed here rather than by the caller.
create or replace view public.payment_methods_public as
select
  id,
  name,
  provider
from public.payment_methods
where is_active;

revoke all on public.payment_methods_public from anon, authenticated;
grant select on public.payment_methods_public to authenticated;
grant all on public.payment_methods_public to service_role;

-- =========================
-- coupons
-- =========================
--
-- Unreadable by teachers: only admins match the policy below. A teacher able to
-- read this table could enumerate every discount code in one request, so
-- redemption has to be validated server-side under service_role.

revoke all on public.coupons from anon, authenticated;
grant select on public.coupons to authenticated;
grant all on public.coupons to service_role;

alter table public.coupons enable row level security;

drop policy if exists "coupons admin read" on public.coupons;

create policy "coupons admin read"
on public.coupons
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =========================
-- subscriptions
-- =========================

revoke all on public.subscriptions from anon, authenticated;
grant select, insert on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions owner read" on public.subscriptions;

create policy "subscriptions owner read"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "subscriptions owner open pending" on public.subscriptions;

-- A teacher may start checkout by opening a pending row for themselves. There
-- is intentionally no UPDATE or DELETE policy: without one they cannot promote
-- that row to 'active', so an inserted row confers nothing until service_role
-- activates it after real payment confirmation.
create policy "subscriptions owner open pending"
on public.subscriptions
for insert
to authenticated
with check (
  auth.uid() = user_id
  and status = 'pending'
);

drop policy if exists "subscriptions admin read" on public.subscriptions;

create policy "subscriptions admin read"
on public.subscriptions
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop trigger if exists subscriptions_updated_at on public.subscriptions;

create trigger subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

-- =========================
-- payments
-- =========================
--
-- Read-only for the owning teacher. Writes are service_role only: a client that
-- can insert here can declare its own payment 'paid'.

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
grant all on public.payments to service_role;

alter table public.payments enable row level security;

drop policy if exists "payments owner read" on public.payments;

create policy "payments owner read"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.subscriptions s
    where s.id = payments.subscription_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "payments admin read" on public.payments;

create policy "payments admin read"
on public.payments
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =========================
-- subscription_logs
-- =========================
--
-- Append-only audit trail owned by the server. Teachers may read their own
-- history; nobody but service_role may write, so entries cannot be forged,
-- back-dated or erased, and `performed_by` cannot be spoofed.

revoke all on public.subscription_logs from anon, authenticated;
grant select on public.subscription_logs to authenticated;
grant all on public.subscription_logs to service_role;

alter table public.subscription_logs enable row level security;

drop policy if exists "subscription logs owner read" on public.subscription_logs;

create policy "subscription logs owner read"
on public.subscription_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.subscriptions s
    where s.id = subscription_logs.subscription_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "subscription logs admin read" on public.subscription_logs;

create policy "subscription logs admin read"
on public.subscription_logs
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =========================
-- Supporting indexes
-- =========================
--
-- The owner policies on payments and subscription_logs filter by
-- subscription_id, and subscriptions is looked up by user_id on every check.

create index if not exists idx_subscriptions_user on public.subscriptions (user_id);
create index if not exists idx_subscriptions_status on public.subscriptions (user_id, status);
create index if not exists idx_payments_subscription on public.payments (subscription_id);
create index if not exists idx_subscription_logs_subscription
on public.subscription_logs (subscription_id);
