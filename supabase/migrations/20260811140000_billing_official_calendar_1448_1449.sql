-- Official Saudi general-education billing calendar for 1448-1449 / 2026-2027.
-- Dates are the approved Gregorian bounds. No schema, RLS, or logic changes.

do $$
declare
  year_row public.billing_academic_years%rowtype;
  sem_row public.billing_semesters%rowtype;
  extra_count integer;
begin
  select * into year_row
  from public.billing_academic_years
  where code = '1448-1449';

  if found then
    if year_row.starts_on <> date '2026-08-23'
       or year_row.ends_on <> date '2027-06-24' then
      raise exception
        'billing_calendar: year 1448-1449 already exists with conflicting dates % → %',
        year_row.starts_on,
        year_row.ends_on;
    end if;
  end if;

  if year_row.id is not null then
    select * into sem_row
    from public.billing_semesters
    where academic_year_id = year_row.id
      and code = 'semester_1';

    if found then
      if sem_row.starts_on <> date '2026-08-23'
         or sem_row.ends_on <> date '2027-01-07'
         or sem_row.sequence <> 1 then
        raise exception
          'billing_calendar: semester_1 already exists with conflicting data % → % seq=%',
          sem_row.starts_on,
          sem_row.ends_on,
          sem_row.sequence;
      end if;
    end if;

    select * into sem_row
    from public.billing_semesters
    where academic_year_id = year_row.id
      and code = 'semester_2';

    if found then
      if sem_row.starts_on <> date '2027-01-17'
         or sem_row.ends_on <> date '2027-06-24'
         or sem_row.sequence <> 2 then
        raise exception
          'billing_calendar: semester_2 already exists with conflicting data % → % seq=%',
          sem_row.starts_on,
          sem_row.ends_on,
          sem_row.sequence;
      end if;
    end if;

    select count(*) into extra_count
    from public.billing_semesters
    where academic_year_id = year_row.id
      and code not in ('semester_1', 'semester_2');

    if extra_count > 0 then
      raise exception
        'billing_calendar: year 1448-1449 already has % unexpected semester row(s)',
        extra_count;
    end if;
  end if;
end;
$$;

insert into public.billing_academic_years (
  code, label, starts_on, ends_on, is_current
)
values (
  '1448-1449',
  'العام الدراسي 1448-1449هـ',
  date '2026-08-23',
  date '2027-06-24',
  (current_date >= date '2026-08-23' and current_date <= date '2027-06-24')
)
on conflict (code) do update
set
  label = excluded.label,
  is_current = excluded.is_current,
  updated_at = now()
where
  billing_academic_years.starts_on = excluded.starts_on
  and billing_academic_years.ends_on = excluded.ends_on;

insert into public.billing_semesters (
  academic_year_id, code, label, sequence, starts_on, ends_on, is_current
)
select
  y.id,
  v.code,
  v.label,
  v.sequence,
  v.starts_on,
  v.ends_on,
  (current_date >= v.starts_on and current_date <= v.ends_on)
from public.billing_academic_years y
cross join (
  values
    (
      'semester_1',
      'الفصل الدراسي الأول',
      1,
      date '2026-08-23',
      date '2027-01-07'
    ),
    (
      'semester_2',
      'الفصل الدراسي الثاني',
      2,
      date '2027-01-17',
      date '2027-06-24'
    )
) as v(code, label, sequence, starts_on, ends_on)
where y.code = '1448-1449'
on conflict (academic_year_id, code) do update
set
  label = excluded.label,
  sequence = excluded.sequence,
  is_current = excluded.is_current,
  updated_at = now()
where
  billing_semesters.starts_on = excluded.starts_on
  and billing_semesters.ends_on = excluded.ends_on
  and billing_semesters.sequence = excluded.sequence;
