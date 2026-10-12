# Score methodology: heuristic-v1

CampusIQ displays an illustrative Student Success Score from 0–100. It is a transparent heuristic for faculty triage, not a validated prediction, causal conclusion, or automated decision.

## Top-level weights

| Component | Weight |
| --- | ---: |
| Academic | 35% |
| Attendance | 25% |
| Learning & engagement | 15% |
| Placement readiness | 25% |

The score uses only components with valid evidence and reweights their published weights. If present component weights total less than 60%, the score is `Insufficient data` rather than zero. The profile exposes inputs used, absent indicators, component value, coverage and weighted contribution.

## Component calculations

- **Academic:** normalized CGPA (`100 × cgpa / declared scale`) at 60% and marks/subject average at 40%, reweighted when one is absent. Subtract `min(20, 5 × backlogs)` once, then clamp to 0–100. The importer never assumes a 10-point scale.
- **Attendance:** overall percent, otherwise a subject mean when subject records are available.
- **Learning & engagement:** LMS is 50% capped login activity (`login_count / 20`) and 50% assignment completion; engagement is 40% capped events/clubs/hackathons and 60% capped certifications (`certifications / 3`); skills is the mean technical and soft skill assessment. Groups are combined as 60% LMS, 25% engagement and 15% skills, reweighted across groups.
- **Placement readiness:** aptitude 40%, coding 35%, mock interview 25%, reweighted over supplied tests.
- **Feedback:** satisfaction and free-text faculty feedback are retained as context and explicitly excluded from score.

## Review signals

- Academic: component <55, normalized CGPA <50, marks <50, or at least two backlogs.
- Attendance: <75%.
- Learning engagement: <50.
- Placement: component <55 or at least two supplied tests <50.

`needs_review` means score <50 with sufficient coverage or at least three signals. `watch` means score <60 or at least two signals. `none` means neither rule matches. These are non-stigmatizing prompts for faculty review.

## Segmentation

Segments overlap. Performance segments are withheld below 60% coverage. Rules include high academic/low placement, attendance plus academic support, placement-ready/academic-support, current strong performance, and insufficient data. A historical `consistently strong` claim requires dated snapshots at least 30 days apart; the current prototype labels the live rule `Current strong performance` when history is unavailable.
