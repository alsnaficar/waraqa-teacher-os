begin;
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  price numeric(10,2) not null,
  starts_with text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists subscriptions (
    id uuid primary key default gen_random_uuid(),
      user_id uuid not null references profiles(id) on delete cascade,
        plan_id uuid not null references plans(id),
          academic_year_id uuid references academic_years(id),
            semester_id uuid references semesters(id),
              status text not null default 'active',
                starts_at date not null,
                  expires_at date not null,
                    renewed_from uuid references subscriptions(id),
                      created_at timestamptz default now(),
                        updated_at timestamptz default now()
                        );
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null,
  is_active boolean default true,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  payment_method_id uuid references payment_methods(id),
  amount numeric(10,2) not null,
  transaction_number text,
  status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz default now()
);
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null,
  value numeric(10,2) not null,
  starts_at timestamptz,
  expires_at timestamptz,
  max_usage integer default 0,
  used_count integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);
create table if not exists subscription_logs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  action text not null,
  performed_by uuid references profiles(id),
  notes text,
  created_at timestamptz default now()
);

commit;
