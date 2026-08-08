-- Priority 3 / Step 2 — Session Binding Contract for ai_generations.
--
-- Product invariant: Lesson Session → AI Generation.
-- New product generations must store lesson_session_id.
-- Historical rows may remain NULL (column is nullable).
--
-- DELETE behavior: ON DELETE CASCADE
-- Inspection findings:
--   * App has no product deleteSession path (sessions are never deleted in UI).
--   * lesson_sessions may still be removed via:
--       - auth.users ON DELETE CASCADE (teacher_id)
--       - curriculum_lessons ON DELETE CASCADE
--       - privileged p2e2e teardown DELETE
--   * ON DELETE SET NULL would silently orphan generations on those cascades —
--     forbidden by the Session Binding Contract.
--   * ON DELETE RESTRICT would block curriculum_lesson / user cascades and
--     break teardown when generations exist.
--   * CASCADE preserves the binding: when a session is removed, its generations
--     are removed with it rather than becoming NULL orphans.
--
-- RLS (BLOCKER F1 fix):
--   Remote currently has a single permissive FOR ALL policy "ai owner all"
--   with USING/WITH CHECK (auth.uid() = user_id) only.
--   Adding another permissive policy would OR with it and NOT close the hole.
--   Therefore DROP "ai owner all" and replace with explicit SELECT / INSERT /
--   UPDATE / DELETE policies.
--   INSERT requires a non-null lesson_session_id owned by auth.uid().
--   UPDATE may keep historical NULL; non-null must be owned by auth.uid().
--   Do not trust client-supplied teacher IDs — ownership is via EXISTS on
--   lesson_sessions.teacher_id = auth.uid().
--
-- No P1/P2 table changes. No new tables. No schedule source changes.

alter table public.ai_generations
  add column if not exists lesson_session_id uuid
    references public.lesson_sessions(id)
    on delete cascade;

create index if not exists idx_ai_generations_lesson_session
  on public.ai_generations (lesson_session_id);

comment on column public.ai_generations.lesson_session_id is
  'P3 Step 2: owning Lesson Session for product AI generations. Nullable for historical rows only.';

-- ---------------------------------------------------------------------------
-- RLS: replace permissive FOR ALL owner policy with operation-specific rules.
-- ---------------------------------------------------------------------------

drop policy if exists "ai owner all" on public.ai_generations;

create policy "ai_generations select own"
  on public.ai_generations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "ai_generations insert owned session"
  on public.ai_generations
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and lesson_session_id is not null
    and exists (
      select 1
      from public.lesson_sessions s
      where s.id = lesson_session_id
        and s.teacher_id = auth.uid()
    )
  );

create policy "ai_generations update own"
  on public.ai_generations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      lesson_session_id is null
      or exists (
        select 1
        from public.lesson_sessions s
        where s.id = lesson_session_id
          and s.teacher_id = auth.uid()
      )
    )
  );

create policy "ai_generations delete own"
  on public.ai_generations
  for delete
  to authenticated
  using (auth.uid() = user_id);
