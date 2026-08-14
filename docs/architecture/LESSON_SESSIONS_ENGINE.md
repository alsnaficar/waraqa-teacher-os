# Lesson Sessions Engine

## Status

v1.0 — implemented.

| Piece | Where |
| --- | --- |
| Table + RLS | `supabase/migrations/20260807000100_create_lesson_sessions.sql`, `20260807000300_lesson_sessions_hardening.sql` |
| Service | `src/features/lesson-sessions/services/lesson-session.service.ts` |
| Hook | `src/features/lesson-sessions/hooks/useLessonSessions.ts` |
| Screen | `src/routes/_authenticated/lesson-sessions.tsx` (`/lesson-sessions`) |
| Academic scope | `src/features/calendar/services/academic-calendar.ts` |
| Timetable source | `src/features/teacher-timetable/services/teacher-timetable.service.ts` |

Dependency direction is one-way: Madrasati -> Teacher Timetable -> Lesson Session.
Timetable is a leaf that only touches Supabase, so nothing above it may import
back into it.

---

# Purpose

Lesson Session is the central entity of Waraqa.

Every feature in the application must be linked to a Lesson Session.

---

# Main Entity

Lesson Session

Represents one scheduled lesson for one teacher.

It contains:

- Academic Year
- Semester
- Subject
- Grade
- Class
- Lesson
- Date
- Period
- Preparation Status

---

# Workflow

Madrasti
        │
        ▼
Teacher Timetable
        │
        ▼
Lesson Session
        │
        ├── Lesson Preparation
        ├── AI Generation
        ├── Worksheet
        ├── Activity
        ├── Quiz
        ├── Homework
        ├── Presentation
        ├── Notifications
        └── Reports

---

# Rules

- One **current** preparation per prepared lesson (latest completed `lesson_plan`).
- Teacher may regenerate preparation via **Reset → Prepare** (not a second Prepare).
- Prepare uses durable claim `status = preparing` before AI (Option A).
- `lesson_locked = true` means preparation **completed**, never a pre-AI claim.
- While `preparing`, session identity/curriculum is immutable (DB BEFORE UPDATE trigger).
- Unlock via `resetPreparation` (clears flags; historical `ai_generations` are kept).
- AI always uses current lesson session.
- Prepare artifact = `ai_generations` row (`kind = lesson_plan`, linked by `lesson_session_id`).

How these are enforced (P3 Step 4):

- `prepareLessonSession` (server): owned session → atomic claim `scheduled→preparing` →
  `runSessionBoundGeneration(lesson_plan)` → `preparing→prepared` + `lesson_locked` + `prepared_at`.
- Concurrent Prepare losers get `ALREADY_PREPARING` / `ALREADY_PREPARED` and never call the provider.
- AI failure releases claim: `preparing→scheduled`.
- DB trigger `lesson_sessions_enforce_preparing_state` blocks curriculum/status abuse while preparing.
- Service guards deny `changeLesson` / `completeSession` / `cancelSession` while preparing.
- `resetPreparation` returns `prepared|preparing → scheduled` (does not delete generations).
- `changeLesson` throws `LessonSessionLockedError` while the lesson is locked.
- A unique index on `(teacher_id, session_date, period_number)` makes **session** generation
  idempotent.

---

# Single Source of Truth

Lesson Session owns:

- subject
- grade
- class
- lesson
- date
- period

Everything else references Lesson Session.

---

# Future

Future modules:

- Attendance
- Assessment
- Classroom Management
- Parent Communication
- Student Progress

All linked to Lesson Session.
