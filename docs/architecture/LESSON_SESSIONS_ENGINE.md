# Lesson Sessions Engine

## Status

Draft v1.0

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
