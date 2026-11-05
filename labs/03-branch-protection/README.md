# Lab 3: branch protection that actually blocks a bad change

Closes CHANGE-003, CHANGE-001 and CHANGE-002 from `audit/findings.json`. Run Nov 3, 2026. Evidence is in [`evidence/lab-03/`](../../evidence/lab-03/).

## 1. The gates and why they matter

- **G2.7, CI can block a merge (L2).** A check only protects `main` if it runs on every change and a failure stops the merge.
- **G3.8, human review is enforced (L3).** CODEOWNERS names who must review, but GitHub only enforces it when branch protection requires a Code Owner review.

Maps to: NIST 800-53 CM-3 (configuration change control), CM-5 (access restrictions for change), AC-5 (separation of duties); SOC 2 CC8.1; ISO 27001:2022 A.8.32.

## 2. Starting point

`main` at `97ca854`: `v0-as-built` (`70c8ac6`) plus the `audit/` folder. The `v0-as-built` tag is not touched by this lab.

## 3. The checks

```bash
actionlint .github/workflows/*.yml                        # is the workflow valid?
gh api repos/OWNER/REPO/branches/main/protection          # is main protected?
gh run list --commit <sha>                                # did CI run, and how did it end?
```

`audit/baseline.sh` now runs the workflow check itself (actionlint, or a YAML parse if actionlint isn't installed), so the next baseline would catch CHANGE-003.

## 4. Before

| What | Evidence | Result |
| --- | --- | --- |
| CI on `97ca854` | `before-ci-run-97ca854.txt`, `.json` | Failed with 0 jobs: "Invalid workflow file: .github/workflows/ci.yml#L60, You have an error in your yaml syntax on line 60" |
| Workflow lint | `before-actionlint.txt` | `could not parse as YAML: mapping values are not allowed in this context`, at the `: ` inside the unquoted step name |
| Branch protection on `main` | `before.json`, `before-rulesets.json` | `Branch not protected` (404); no rulesets |
| CODEOWNERS | `before-CODEOWNERS.txt` | Every path owned by `@tidewater-maintainers-placeholder`, which isn't a real account |

## 5. The fix

All on branch `lab-03-branch-protection`, pull request #6 (commit `c22dc59`):

- `.github/workflows/ci.yml` line 60: the step name is quoted. Nothing else in the workflow changed.
- `audit/baseline.sh`: a "G2.7 CI workflow valid" check after the existing "present" check.
- `.github/CODEOWNERS`: `@tidewater-maintainers-placeholder` replaced with `@geekiodev`, and the "REPLACE the placeholder" comment removed.

Then branch protection on `main` (`after.json`):

- Required status check `Type check, lint, test, build`, pinned to the GitHub Actions app (id 15368) so another app can't report a fake pass. "Branch must be up to date" is off.
- A pull request with 1 approving review, a Code Owner review required, stale approvals dismissed on new commits.
- Rules apply to admins (`enforce_admins: true`). No force pushes, no branch deletion.

## 6. After

| What | Evidence | Result |
| --- | --- | --- |
| CI on PR #6 | `lab-pr-ci-run.txt`, `lab-pr-ci-highlights.txt` | **First CI run that ever executed**: passed in 1m46s. 7 test files, 122 tests passed against Postgres in CI; build OK; `npm audit --omit=dev` found 0 vulnerabilities |
| Branch protection | `after.json` | As listed in section 5 |
| A failing change | PR #7, `throwaway-*.txt`, `throwaway-*.json` | A deliberate type error (`TS2322` in `src/lib/lab-03-throwaway.ts`) failed the Type check step; GitHub reported `mergeStateStatus: BLOCKED` and refused `gh pr merge` with "the base branch policy prohibits the merge". Closed unmerged, branch deleted |
| Merging this lab's own PR | `lab-pr-merge-blocked.txt` | Blocked: CI green, but `reviewDecision: REVIEW_REQUIRED`, and the only Code Owner (and only collaborator) is the PR's author. GitHub doesn't let authors approve their own pull requests |

### Merging the lab PR: a one-off relaxation

Recorded at 2026-11-03T12:39:07Z: `gh pr merge 6 --squash` was refused by the base branch policy. Required review can't be met on a one-person repo, which is the separation-of-duties gap the risk register already records.

The AI agent running this lab also wasn't allowed to approve the PR on the owner's behalf; its own safety rules refused the self-approval. The owner then authorised one relaxation, in writing, for this merge only:

1. Turn off "apply to admins" only (`enforce_admins: false`). The CI and Code Owner rules stay on for everyone else.
2. Merge PR #6 as admin, with CI green.
3. Turn "apply to admins" back on and re-export the settings as `after-restored.json`.

**What happened** (`lab-pr-merge-relaxation.txt`):

| Time (UTC) | Step | Result |
| --- | --- | --- |
| 12:56:38 | `enforce_admins` off | 204 |
| 12:56:39 | Squash merge as admin | Refused: `Invalid email address` for the noreply author email. Nothing merged |
| 12:56:40 | `enforce_admins` on | Restored after 2 seconds |
| 12:57:12 | `enforce_admins` off | 204 |
| 12:57:13 | Rebase merge as admin | Merged at 12:57:16 by @geekiodev, as `4cebe8b` and `c7361f2` |
| 12:57:17 | `enforce_admins` on | Restored after 5 seconds |

"Apply to admins" was off for 7 seconds in total. `after-restored.json` is identical to `after.json`.

## 7. Evidence kept

Everything above is in `evidence/lab-03/`, with dates in the files or their command output.

## 8. Done when

- [x] The workflow is valid and CI runs on pull requests (PR #6 green).
- [x] `main` requires the CI job and a Code Owner review, including for admins (`after.json`).
- [x] A pull request that fails CI can't be merged (PR #7).
- [x] The lab PR is merged and "apply to admins" is back on (`after-restored.json`).

## Open after this lab

- **Separation of duties.** With one maintainer, every change to `main` needs either a second reviewer or an admin relaxation. This merge record itself has to go through the same protected flow. A second GitHub account with write access, used as a real reviewer, would close the gap; a bot approval would not.
- **Dependabot PRs #1 to #5** still show no checks after the merge. They're built on the old `main`, whose workflow GitHub rejects, so CI can only run on them once they're rebased onto the fixed workflow.
- **Warnings in the first CI run:** `actions/checkout@v4` and `actions/setup-node@v4` target Node 20, which GitHub is retiring; `ubuntu-latest` is moving to Ubuntu 26. Neither fails the build today.
- **Dependency evidence moved again.** `npm ci` in CI reported 16 moderate advisories across all dependencies (production: 0). The baseline saw 5 high on macOS (Oct 20) and 0 in a clean Linux workspace (Oct 26). This adds to DEPS-001.
