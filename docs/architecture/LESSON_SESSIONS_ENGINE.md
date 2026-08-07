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

- One preparation per lesson.
- Teacher may regenerate preparation.
- Lesson becomes locked after preparation.
- Unlock only by deleting preparation.
- AI always uses current lesson session.
- No duplicated data.

How these are enforced:

- `prepareSession` sets `status = 'prepared'`, `lesson_locked = true`, `prepared_at`.
- `resetPreparation` is the only path back to `lesson_locked = false`.
- `changeLesson` throws `LessonSessionLockedError` while the lesson is locked.
- Generation never overwrites an existing session, so re-running it preserves
  work the teacher has already done.
- A unique index on `(teacher_id, session_date, period_number)` makes generation
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
