# Exercise starters

Each exercise starts with the prerequisites listed below. Preserve its seeded defects and missing artifacts for participants to work through.

Open the App clone as a Codex project. Start a new chat, choose **Worktree**, select the lesson's starter as its starting branch, and use the checked-in local environment. Setup runs in the new checkout. Confirm its starting commit with `git rev-parse HEAD`. A participant bundle has its own starting commits in `release-record.json` under `appRefs`.

If the branch picker only lists local branches, prepare the starter names once from the clone. This also works with a bundle as `origin`. Existing local branches and edits are preserved.

```sh
git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin/starter |
while IFS= read -r starter; do
  git show-ref --verify --quiet "refs/heads/$starter" ||
    git branch --no-track "$starter" "refs/remotes/origin/$starter" || exit 1
done
```

Choose **Preview app** on main, 101 or 201 and open the printed loopback URL. Each worktree has its own port and browser storage. Leave the first chat and preview open when starting another lesson. Reopen the original chat to resume with its edits. If a port is occupied, set `BLOSSOM_PORT_BASE` (1024–65534) to the same value in the preview and guide helper environments before starting them. A helper process sees one override at a time. The default works across multiple worktrees.

## Lesson map

The ZIP's release-record.json lists the participant commit for each branch. The 101.2 project setup can use the 101.3 starter. For 101.5 plugin installation, the local marketplace is present at the root of main and each 101/201 starter.

| Lesson | Branch in the kit | Already present | Participant work | Baseline tests |
| --- | --- | --- | --- | --- |
| 101.3 · Write AGENTS.md | `starter/101-3-create-agents-md` | Booking app and local images | Write root and domain guidance. | 15 pass, 1 date failure |
| 101.4 · Create a Definition of Done skill | `starter/101-4-create-definition-of-done` | Root and domain AGENTS.md files | Write and link the skill. | 15 pass, 1 date failure |
| 201.1 · Fix BB-142 | `starter/201-1-fix-booking-issue` | Guidance, skill and failing regression | Carry the edited dates into checkout. | 15 pass, 1 date failure |
| 201.2 · Implement coupons | `starter/201-2-coupons-and-sorting` | Date handoff fixed, BB-241 and design brief | Resolve the product decision and implement coupon management and redemption. | 16 pass |
| 201.3 · Work in parallel | `starter/201-2-coupons-and-sorting` | Same baseline, BB-412 and BB-241 | Develop stay sorting in a separate working branch. | 16 pass |
| 201.4 · Create and use a review agent | `starter/201-4-custom-agents` | Coupons, sorting and regression tests | Configure the read-only reviewer and repair confirmed coupon defects. | 24 pass, 6 coupon failures |
| 201.5 · Explore safeguards | `starter/201-5-explore-safeguards` | Configured reviewer, merge rule, opt-in hooks and lint fixture | Evaluate the rule and demonstrate one lint failure and repair. Preserve the coupon defects. | 17 pass, 6 coupon failures |
| 301.1 · Remote Development | `starter/301-delivery` | Exported foundation app and read-only CI workflow | Use the linked ticket and design in one remote worktree, test a change and review the running feature. | 16 pass |
| 301.2 · Autonomous Coding Agent | `starter/301-delivery` | Same unsolved foundation, Git starting commit and CI | Dispatch one MicroVM job and inspect the returned diff, checks and feature. Two extra tickets are optional. | 16 pass |
| 301 · Security Reviews | `starter/301-security-reviews` | Local Workboard handler and two fictional workspaces | Reproduce the authorization flaw, add regression tests and fix it. | 5 pass |

Use Node 24.21.0. For 101 and 201, run `npm test`, `npm run lint` and `npm run build` at the repository root. For 301.1, use the prepared Ubuntu worktree on your assigned seat or a fresh 301 worktree for local practice. For 301.2, dispatch the released starter from the seat and open the returned review worktree. From the repository root, run `npm --prefix foundation ci`, then `npm --prefix foundation test`, `npm --prefix foundation run lint` and `npm --prefix foundation run build`. Start its preview with `npm --prefix foundation run dev`. For the remote environment, use the forwarding instructions in the 301 kit. For Security Reviews, read the root README and run `npm test` locally. It needs no dependency installation or web server.

## Expected failures

The date failure on 101.3, 101.4 and 201.1 is:

- `carries the latest dates from stay details into checkout`

The coupon failures on 201.4 and 201.5 are:

- `normalizes codes, rejects duplicates and invalid percentages, and persists edits`
- `rounds to cents and accepts lowercase; rejects inactive and unknown codes`
- `revalidates at booking creation and stores the final discount`
- `recalculates dates, replaces and removes coupons, and persists confirmation savings`
- `manages coupons through the UI`
- `rounds fractional cents upward for an uppercase coupon`

To reproduce the date defect, open Seaside Cottage, change checkout from three nights to five, and reserve. Checkout shows three nights and $720 on both `main` and the 201.1 starter. The 201.1 starter has a failing test for the correct five-night handoff. On `main`, CI checks that the starting behavior is present. For the coupon review, compare lowercase and uppercase redemption and run the fractional-cent regression. For safeguards, `node --test scripts/hooks-demo.test.mjs` exercises synthetic hook events. The live lesson requires a trusted client and a separate observation of the hook.
