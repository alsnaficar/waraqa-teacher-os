ALTER TABLE public.ai_generations
ADD COLUMN IF NOT EXISTS lesson_id UUID,
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS grade TEXT,
ADD COLUMN IF NOT EXISTS lesson_title TEXT,
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_generations_lesson
ON public.ai_generations(lesson_id);

CREATE INDEX IF NOT EXISTS idx_ai_generations_user_kind
ON public.ai_generations(user_id, kind);
