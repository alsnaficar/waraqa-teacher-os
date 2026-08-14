-- Seed Core Standard launch entitlements.
-- Schema, RLS, plans, subscriptions, payments, and calendar are unchanged.

do $$
declare
  semester_id uuid;
  semester_active boolean;
  year_id uuid;
  year_active boolean;
  unexpected_count integer;
begin
  select p.id, p.is_active
  into semester_id, semester_active
  from public.plans p
  where p.code = 'core_standard_semester';

  if not found then
    raise exception
      'plan_entitlements: plan core_standard_semester does not exist';
  end if;

  if semester_active is not true then
    raise exception
      'plan_entitlements: plan core_standard_semester is inactive';
  end if;

  select p.id, p.is_active
  into year_id, year_active
  from public.plans p
  where p.code = 'core_standard_academic_year';

  if not found then
    raise exception
      'plan_entitlements: plan core_standard_academic_year does not exist';
  end if;

  if year_active is not true then
    raise exception
      'plan_entitlements: plan core_standard_academic_year is inactive';
  end if;

  select count(*)
  into unexpected_count
  from public.plan_entitlements pe
  where pe.plan_id in (semester_id, year_id)
    and pe.feature_key not in (
      'lesson_plan',
      'worksheet',
      'quiz',
      'activity_ideas'
    );

  if unexpected_count > 0 then
    raise exception
      'plan_entitlements: % unexpected feature_key row(s) on launch plans',
      unexpected_count;
  end if;

  insert into public.plan_entitlements (plan_id, feature_key)
  select ids.plan_id, keys.feature_key
  from (
    values
      (semester_id),
      (year_id)
  ) as ids(plan_id)
  cross join (
    values
      ('lesson_plan'),
      ('worksheet'),
      ('quiz'),
      ('activity_ideas')
  ) as keys(feature_key)
  on conflict (plan_id, feature_key) do nothing;
end;
$$;
