---
name: blossom-bookings-fix-issue
description: Fix Blossom Bookings issues with a strict test-driven development workflow. Use when the user asks to fix or implement a Blossom Bookings issue, BB ticket, bug, regression, acceptance criterion, or ticket-driven repair. Require an explicit baseline-red-green-loop plan and test evidence before and after production changes.
---

# Blossom Bookings Fix Issue

Use this workflow whenever Blossom Bookings repair work is anchored to a ticket. Treat TDD as a mandatory execution protocol, not a preference.

## Mandatory TDD Plan

Before editing tests or production code, create or update the implementation plan. Include this explicit commitment:

> TDD commitment: I will run the existing tests to establish the baseline, write tests for every identified issue area, run them to prove the new tests fail, implement the fix, rerun the tests to prove they pass, and repeat the loop if any behavior remains unresolved.

The plan must name:

- **Baseline:** the existing test commands to run before making changes.
- **Red:** every issue area and acceptance criterion that needs a new or updated test.
- **Red confirmation:** the command that will prove the new tests fail for the expected reason.
- **Implementation:** the production fixes or refactors to attempt only after red is confirmed.
- **Green confirmation:** the focused and broader test commands that must pass after implementation.
- **Loop:** the return to the red phase when a test still fails or an uncovered behavior is discovered.

Do not edit production code until the plan contains this commitment and the red phase has been demonstrated.

## Strict TDD Methodology

1. Call `get_issue` with the requested ticket ID and treat the returned issue as the source of truth.
2. Restate the user journey, expected behavior, acceptance criteria, and any open product questions.
3. Inspect the relevant production code and tests. Identify every affected area before changing behavior.
4. Write the implementation plan with the mandatory TDD commitment and the baseline-red-green-loop phases above.
5. **Baseline:** run the existing relevant tests without changing code. Record the commands and results to establish the current passing state. If existing tests already fail, separate and report those failures before proceeding.
6. **Red authoring:** write or update behavior-focused tests for all identified issue areas and testable acceptance criteria. Do not edit production code during this phase.
7. **Red confirmation:** run the new tests and confirm they fail. Verify each failure is caused by the missing or incorrect behavior, not by a broken test or unrelated setup problem. If a new test passes unexpectedly, revise it until it exposes the issue.
8. **Implementation/refactor:** only after the red failures are confirmed, implement the smallest coherent fix or refactor that addresses the tested behavior.
9. **Green confirmation:** rerun the focused tests and confirm all new and existing relevant tests pass. Then run the broader related test suite.
10. **Loop:** if any test still fails, any acceptance criterion remains unproven, or implementation reveals another affected area, return to red authoring before making further production changes.
11. Run the completion checks, including the full relevant tests, lint, and typecheck/build.
12. Report the baseline result, red failures, implemented fixes, green results, acceptance criteria coverage, and any remaining questions.

## Output Guidance

- For bug tickets, emphasize the affected user journey, expected behavior, actual behavior, and business consequence.
- For feature tickets, emphasize the user/business goal, supported scenarios, eligibility rules, and acceptance criteria.
- Preserve ticket wording when precision matters, but keep summaries concise.
- Call out ambiguous or missing requirements explicitly instead of resolving them by assumption.
- Cover every identified issue area with behavior-focused tests before implementation begins.
- Record the exact baseline, red, and green commands and outcomes.
- Never treat a test that already failed during the baseline as proof of the new red phase.
- If an area genuinely cannot be tested automatically, document the reason in the plan before implementation and define the closest repeatable verification. Do not silently skip it.
- Keep code changes scoped to the ticket unless the existing design requires a small supporting refactor.
- Do not close or mutate a ticket unless the user explicitly asks for that workflow.

If the user does not provide a ticket ID, ask for one instead of guessing. If the tool is unavailable, say that the Blossom Bookings plugin must be installed and its jira-mock and figma-mock connections enabled.
