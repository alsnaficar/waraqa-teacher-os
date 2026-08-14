-- Priority 3 / Step 1 — published curriculum shared SELECT for authenticated teachers.
--
-- Existing owner FOR ALL policies remain the write + private-read path.
-- Authenticated clients may SELECT ONLY rows belonging to status = 'published' files.
-- Draft / archived / pending remain owner-only.
-- No INSERT/UPDATE/DELETE grants or policies are added.
-- Does not revive curricula/curriculum_units or change P1/P2 lifecycle.

-- Published curriculum files are readable by any authenticated teacher.
create policy "curriculum_files published select"
  on public.curriculum_files
  for select
  to authenticated
  using (status = 'published');

-- Lessons under a published file are readable by any authenticated teacher.
create policy "curriculum_lessons published select"
  on public.curriculum_lessons
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.curriculum_files f
      where f.id = curriculum_file_id
        and f.status = 'published'
    )
  );
