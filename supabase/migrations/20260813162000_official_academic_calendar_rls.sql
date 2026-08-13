-- Official academic calendar RLS: teachers SELECT the active official year/semesters;
-- only admins INSERT/UPDATE/DELETE. Legacy personal rows stay owner-readable.
--
-- Does not grant unrestricted row access.
-- Does not add columns, change grants, or mutate calendar rows.
-- user_id is kept as-is (legacy ownership / created-by metadata).

-- =========================
-- academic_years
-- =========================

drop policy if exists "academic_years owner all" on public.academic_years;

drop policy if exists "academic_years official select" on public.academic_years;
create policy "academic_years official select"
on public.academic_years
for select
to authenticated
using (
  is_active = true
  or public.has_role(auth.uid(), 'admin'::public.app_role)
  or auth.uid() = user_id
);

drop policy if exists "academic_years admin insert" on public.academic_years;
create policy "academic_years admin insert"
on public.academic_years
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "academic_years admin update" on public.academic_years;
create policy "academic_years admin update"
on public.academic_years
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "academic_years admin delete" on public.academic_years;
create policy "academic_years admin delete"
on public.academic_years
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =========================
-- semesters
-- =========================

drop policy if exists "semesters owner all" on public.semesters;

drop policy if exists "semesters official select" on public.semesters;
create policy "semesters official select"
on public.semesters
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or auth.uid() = user_id
  or exists (
    select 1
    from public.academic_years y
    where y.id = semesters.academic_year_id
      and y.is_active = true
  )
);

drop policy if exists "semesters admin insert" on public.semesters;
create policy "semesters admin insert"
on public.semesters
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "semesters admin update" on public.semesters;
create policy "semesters admin update"
on public.semesters
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "semesters admin delete" on public.semesters;
create policy "semesters admin delete"
on public.semesters
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));
