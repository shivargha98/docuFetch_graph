---
name: design-skill-annotation-pattern
description: How to judge which features/issues in docuFetch's frontend PM docs get a "use the frontend-design skill" callout vs. which are purely behavioral and should be left alone
metadata:
  type: feedback
---

The user asked (2026-07-05, post-review of `docs/frontend/features.md`/`issues.md`) for a surgical amendment: add a one-line `**Design note:** Use the `frontend-design` skill for this — [reason]` callout to entries involving genuine visual-design judgment (color, glow/highlight treatment, typography, motion/animation feel, HUD/overlay styling), and explicitly *not* to purely logical/behavioral entries (state wiring, WebSocket connection handling, validation flows).

**Why:** The `frontend-design` skill exists to prevent visually "templated" defaults on aesthetic decisions — it has no value on a feature where the only decisions are correctness/timing/data-flow, and over-applying it dilutes the signal for where it actually matters.

**How to apply — the judgment line that worked:**
1. Look at whether the feature/issue's acceptance criteria mention a color/style/contrast/animation outcome explicitly (e.g. "muted/neutral style clearly distinct," "glow/color change," "fade/pop-in animation") — if yes, annotate.
2. If the criteria are only about state correctness, timing, or data plumbing (even if the thing being described is a UI component), don't annotate — e.g. `Folder Path Input & Validation` renders an input+error but its criteria are about validation/error-state behavior, not styling, so it was left out.
3. Borderline cases (renders visible UI state but criteria are behavior-only) — flag them explicitly to the user rather than silently deciding: `Live Ingestion Status Display` and `Collapsible Chat Panel` were judged borderline and left unannotated, but called out by name in `context.md` so the user could override if they disagreed.
4. When one issue/feature bundles a stylistic sub-part with a structural sub-part (e.g. Issue 1 = three-panel layout + dark neon/glow theme), annotate but scope the note to the stylistic sub-part only ("Use the skill for the theming portion of this issue"), not the whole entry.
5. Keep the edit to exactly one new line per entry, placed after the existing acceptance-criteria/caveat block — no restructuring of the surrounding doc, consistent with this project's general "surgical changes" coding guideline ([[project-docs-conventions]]).

Confirmed outcome on the frontend pass: 8 of 16 features and 7 of 14 issues annotated; the full annotated/unannotated breakdown (with reasoning) is recorded in `docs/frontend/context.md`'s "Amendment" section rather than only in memory, since it's specific to that PM loop round.

See also [[project-docs-conventions]].
