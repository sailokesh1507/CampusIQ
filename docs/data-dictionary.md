# Data dictionary and CSV contract

## Unified CSV headers

Required headers are `student_id` and `observed_at`. At least one of the following measurements must be populated:

| Domain | Headers | Accepted range |
| --- | --- | --- |
| Academic | `cgpa`, `cgpa_scale`, `marks_percent`, `backlogs` | CGPA ≥ 0, scale > 0, marks 0–100, backlogs ≥ 0 integer |
| Attendance | `attendance_percent` | 0–100 |
| LMS | `lms_login_count`, `assignment_completion_percent` | Login count ≥ 0 integer, completion 0–100 |
| Engagement | `events_count`, `clubs_count`, `hackathons_count`, `certifications_count` | Counts ≥ 0 integers |
| Placement | `aptitude_score`, `coding_score`, `mock_interview_score` | 0–100 |
| Skills | `technical_skill_score`, `soft_skill_score` | 0–100 |
| Feedback | `student_satisfaction`, `faculty_feedback` | Satisfaction 1–5; text is context only |

`display_name`, `department`, `programme`, and `semester` are cohort context. Semester is 1–12. Names are synthetic demo labels by default. Student identity is always joined by `student_id`; names are never keys.

## Validation behavior

- ISO dates are required for `observed_at`.
- Blank optional cells become `NULL`; they do not become zero.
- A supplied `cgpa` without a declared `cgpa_scale` is rejected.
- Unsupported headers, invalid ranges, malformed dates, duplicate `(student_id, observed_at)` observations, and rows without measurement values are surfaced with row number, field, code and message.
- Atomic mode blocks the commit when any row is rejected. Partial mode commits accepted rows only after the user chooses it.
- A committed batch is recorded with accepted/rejected counts and errors.

## Persisted domains

Source tables retain `observed_at` and `source_batch_id`. The API currently presents the latest row per domain; the schema supports dated observations for future trend views. Feedback text is displayed only as context and is excluded from score calculations and any optional external insight payload.
