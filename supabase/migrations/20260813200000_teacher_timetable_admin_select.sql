-- Step 6A — Admin SELECT of teacher_timetable for Capacity Preview.
--
-- Owner FOR ALL policy is unchanged. INSERT / UPDATE / DELETE stay owner-only.
-- Admins may SELECT any teacher's rows via has_role(admin).
-- Teachers cannot read another teacher's timetable.
-- No USING(true). No service_role. No grant changes. No backfill.

drop policy if exists "teacher timetable admin select" on public.teacher_timetable;

create policy "teacher timetable admin select"
on public.teacher_timetable
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));
