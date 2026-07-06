# PM Loop Memory Index

- [Project docs conventions](project_docs_conventions.md) — docs/{scope}/ uses context.md, not pm-loop-context.md; don't confuse with backend_context.md/backend_TASKS.md (build orchestrator's files)
- [Grill doc as source of truth](grill_doc_first_source_of_truth.md) — grill_doc_roadmap.md precedes PM loop; its deferred items must thread through PRD → features → issues as open callouts, never silently resolved
- [Issues-creator autonomous mode](issues_creator_autonomous_mode.md) — skip issues-creator's interactive review checkpoint when running the full loop autonomously; substitute a self-check and disclose it in context.md
- [Cross-scope dependency pinning](cross_scope_dependency_pinning.md) — when frontend depends on open backend contracts, pin to the backend's specific issue number at every doc layer, flag as point-in-time
- [Backend test suite patterns](backend_test_suite_patterns.md) — docs/backend/tests/ (not backend/tests/) structure: conftest.py + unit/one-file-per-module + integration/one-file-per-flow + api/one-file-per-endpoint; stub-only tests with Source: docstring lines; open items get injectable-fixture or skip-marked contract tests, never hardcoded guesses
- [Resuming deferred PM loop steps](resuming_deferred_pm_loop_steps.md) — when a user defers then later requests a step, edit existing tasks.md/context.md in place (flip checklist, rewrite Final Status) rather than starting a new round
- [Design-skill annotation pattern](design_skill_annotation_pattern.md) — how to judge which features/issues get a "use frontend-design skill" callout: check acceptance criteria for color/style/animation outcomes, not just "renders UI"
