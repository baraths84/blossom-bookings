---
name: blossom-bookings-implement-feature
description: Deliver Blossom Bookings features from ticket requirements and optional design context. Use when the user asks to implement, plan, review, scope, or understand a Blossom Bookings feature, especially when a ticket may reference a design asset.
---

# Blossom Bookings Implement Feature

Use this workflow for feature work that may combine product requirements, design context, tests, and implementation.

## Workflow

Use jira-mock for ticket operations and figma-mock for design operations.

1. Call `get_issue` with the requested ticket ID and treat the issue as the source of truth.
2. If the issue includes a `designAssetId`, call `get_design` on `figma-mock` and use it for UI states, visual structure, and interaction details.
3. Reconcile ticket requirements, design observations, open questions, and existing code patterns before editing. If an open decision would change the implementation, ask the user to resolve it before producing the plan or editing code.
4. Define the smallest coherent implementation slice that can be tested and reviewed.
5. Implement the slice with behavior-focused tests for business rules and user-visible states.
6. Run relevant tests and broader checks, including lint and typecheck/build when applicable.
7. For user-facing work, start the application. Use the in-app browser to exercise every changed user journey in the running application. Verify the happy path and relevant validation, error, empty, loading, disabled, and responsive states. When a design asset exists, compare the rendered result with it.
8. Report what changed, acceptance criteria coverage, design coverage, checks run, browser evidence, and remaining questions. Report the browser journeys and states verified, along with any visual or behavioral discrepancies.

## Output Guidance

- Start with the product outcome, not the technology.
- Distinguish ticket requirements from design observations.
- Do not invent missing business policy, UI states, or eligibility rules.
- If requirements and design conflict, name the conflict and ask the user how to resolve it before implementing that part.
- Prefer incremental, testable slices over broad speculative implementation.
- Cover business behavior and user-facing states that the ticket or design makes observable.
- Do not mark user-facing work complete based only on automated tests or code inspection.
- If the in-app browser is unavailable, report browser verification as incomplete and explain what remains unverified.
- When reviewing work, check acceptance criteria first, then design fidelity, then implementation quality.

If the user does not provide a ticket ID, ask for one instead of guessing. If a required tool is unavailable, say that the Blossom Bookings plugin must be installed and its jira-mock and figma-mock connections enabled.
