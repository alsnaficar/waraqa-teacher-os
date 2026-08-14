-- =====================================================
-- Academic Calendar Foundation
-- Waraqa Teacher OS
-- =====================================================
--
-- This migration originally also created public.academic_years and
-- public.calendar_events as globally shared, read-by-everyone tables. Both
-- definitions have been removed and the rest guarded, for three reasons:
--
--   1. Replay. 20260721103657 already creates public.academic_years, so the
--      unguarded CREATE TABLE here aborted with "relation academic_years
--      already exists" on every fresh database. Supabase stops at the first
--      failing migration, so nothing after this file could ever apply.
--
--   2. Ownership. The version created here has no user_id and a
--      `USING (true)` SELECT policy, so it would have let any authenticated
--      teacher read every other teacher's academic years. The canonical
--      per-teacher table with owner RLS is the one the app uses.
--
--   3. Shadowing. This file sorts before 20260807000400_calendar_events.sql.
--      Its shared calendar_events would have won on a fresh database and the
--      per-teacher calendar_events the app actually queries would silently
--      never be created.
--
-- academic_terms and curriculum_distribution are kept: no other migration
-- provides them. Note that terms consumed by the app come from
-- public.semesters, which is what lesson_sessions.semester_id references.

-- =========================
-- Academic Terms
-- =========================

CREATE TABLE IF NOT EXISTS public.academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  academic_year_id UUID NOT NULL
    REFERENCES public.academic_years(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  starts_at DATE NOT NULL,

  ends_at DATE NOT NULL,

  sort_order SMALLINT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT academic_terms_sort_check
    CHECK (sort_order IN (1,2))
);

CREATE INDEX IF NOT EXISTS idx_academic_terms_year
ON public.academic_terms(academic_year_id);

ALTER TABLE public.academic_terms
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read academic terms"
ON public.academic_terms;

CREATE POLICY "Authenticated users can read academic terms"
ON public.academic_terms
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.academic_terms TO authenticated;
GRANT ALL ON public.academic_terms TO service_role;

-- =========================
-- Curriculum Distribution
-- =========================

CREATE TABLE IF NOT EXISTS public.curriculum_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  academic_year_id UUID NOT NULL
    REFERENCES public.academic_years(id)
    ON DELETE CASCADE,

  academic_term_id UUID NOT NULL
    REFERENCES public.academic_terms(id)
    ON DELETE CASCADE,

  stage TEXT NOT NULL,

  grade TEXT NOT NULL,

  subject TEXT NOT NULL,

  unit_title TEXT,

  lesson_title TEXT NOT NULL,

  lesson_order INTEGER NOT NULL,

  suggested_week INTEGER,

  suggested_periods INTEGER NOT NULL DEFAULT 1,

  source_type TEXT NOT NULL DEFAULT 'pdf',

  source_file_id UUID
    REFERENCES public.curriculum_files(id)
    ON DELETE SET NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT curriculum_distribution_source_check
    CHECK (source_type IN ('pdf','manual'))
);

CREATE INDEX IF NOT EXISTS idx_curriculum_distribution_lookup
ON public.curriculum_distribution (
  academic_year_id,
  academic_term_id,
  stage,
  grade,
  subject
);

CREATE INDEX IF NOT EXISTS idx_curriculum_distribution_order
ON public.curriculum_distribution (
  subject,
  lesson_order
);

ALTER TABLE public.curriculum_distribution
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read curriculum distribution"
ON public.curriculum_distribution;

CREATE POLICY "Authenticated users can read curriculum distribution"
ON public.curriculum_distribution
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.curriculum_distribution TO authenticated;
GRANT ALL ON public.curriculum_distribution TO service_role;
