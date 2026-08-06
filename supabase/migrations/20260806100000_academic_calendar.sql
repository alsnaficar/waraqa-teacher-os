-- =====================================================
-- Academic Calendar Foundation
-- Waraqa Teacher OS
-- =====================================================

-- =========================
-- Academic Years
-- =========================

CREATE TABLE public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL UNIQUE,

  starts_at DATE NOT NULL,

  ends_at DATE NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_academic_years_active
ON public.academic_years(is_active);

ALTER TABLE public.academic_years
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read academic years"
ON public.academic_years
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.academic_years TO authenticated;
GRANT ALL ON public.academic_years TO service_role;
-- =========================
-- Academic Terms
-- =========================

CREATE TABLE public.academic_terms (
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

CREATE INDEX idx_academic_terms_year
ON public.academic_terms(academic_year_id);

ALTER TABLE public.academic_terms
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read academic terms"
ON public.academic_terms
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.academic_terms TO authenticated;
GRANT ALL ON public.academic_terms TO service_role;
-- =========================
-- Calendar Events
-- =========================

CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  academic_year_id UUID NOT NULL
    REFERENCES public.academic_years(id)
    ON DELETE CASCADE,

  academic_term_id UUID
    REFERENCES public.academic_terms(id)
    ON DELETE SET NULL,

  title TEXT NOT NULL,

  event_type TEXT NOT NULL,

  starts_at DATE NOT NULL,

  ends_at DATE NOT NULL,

  is_teaching_day BOOLEAN NOT NULL DEFAULT FALSE,

  is_remote BOOLEAN NOT NULL DEFAULT FALSE,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT calendar_events_dates_check
    CHECK (ends_at >= starts_at),

  CONSTRAINT calendar_events_type_check
    CHECK (
      event_type IN (
        'school_start',
        'school_end',
        'holiday',
        'long_weekend',
        'national_day',
        'foundation_day',
        'exam',
        'remote_learning',
        'custom'
      )
    )
);

CREATE INDEX idx_calendar_events_year
ON public.calendar_events(academic_year_id);

CREATE INDEX idx_calendar_events_dates
ON public.calendar_events(starts_at, ends_at);

ALTER TABLE public.calendar_events
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calendar events"
ON public.calendar_events
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
-- =========================
-- Curriculum Distribution
-- =========================

CREATE TABLE public.curriculum_distribution (
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

CREATE INDEX idx_curriculum_distribution_lookup
ON public.curriculum_distribution (
  academic_year_id,
  academic_term_id,
  stage,
  grade,
  subject
);

CREATE INDEX idx_curriculum_distribution_order
ON public.curriculum_distribution (
  subject,
  lesson_order
);

ALTER TABLE public.curriculum_distribution
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read curriculum distribution"
ON public.curriculum_distribution
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.curriculum_distribution TO authenticated;
GRANT ALL ON public.curriculum_distribution TO service_role;