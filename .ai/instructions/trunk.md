# Trunk-based development workflow

This repository follows a strict trunk-based development (TBD) workflow. `main` is the trunk. All work flows through short-lived feature branches that are rebased and merged via pull request. Direct pushes to `main` are prohibited except for automated release tooling (release-please).

The canonical commit format is **Conventional Commits v1.0.0**. Commit messages are validated by commitlint on every pre-commit hook and in CI.

---

## Branch conventions

| Type | Pattern | Lifetime |
|---|---|---|
| Feature | `feat/<ticket>-<slug>` | ≤ 2 days |
| Fix | `fix/<ticket>-<slug>` | ≤ 1 day |
| Refactor | `refactor/<slug>` | ≤ 2 days |
| Chore | `chore/<slug>` | ≤ 1 day |
| Hotfix | `hotfix/<slug>` | hours |
| Release | `release-please--*` | automated |

- `<ticket>` is the issue number (e.g. `42`).
- `<slug>` is kebab-case, max 40 characters, describes the intent.
- Branches older than their lifetime limit are flagged for review.

---

## Commit message format

```
<type>(<scope>): <subject>

[optional body]

[optional footer: BREAKING CHANGE, Closes #N]
```

**Types:** `feat` · `fix` · `refactor` · `perf` · `test` · `docs` · `chore` · `build` · `ci`

**Rules:**
- Subject line: imperative mood, no period, ≤ 72 characters.
- Scope: package or layer name (e.g. `prelude`, `boundary`, `react`, `api`).
- Breaking changes: add `!` after the type/scope AND a `BREAKING CHANGE:` footer.
- Each commit must be a single logical unit. Do not bundle unrelated changes.

**Examples:**

```
feat(prelude): add sequence combinator for Option

fix(boundary): handle empty body in extractContext

refactor(api): extract pagination helper into shared util

BREAKING CHANGE: fromZodError now requires a structured ZodIssue array
```

---

## Slash commands

These commands are available in Copilot agent context. Each maps to a discrete workflow step.

### `/start-work`

Validates that you are on `main` and up to date, then creates and checks out a correctly named branch.

**Workflow:**
1. Confirm current branch is `main`; abort with a warning if not.
2. `git pull --rebase origin main`
3. Prompt for type and short description; derive branch name from the pattern.
4. `git checkout -b <branch-name>`
5. Report the active branch and remind the agent to make the first commit before any significant file edits.

---

### `/checkpoint`

Commits staged (or all tracked) changes with a valid Conventional Commit message. Use at every logical boundary — do not accumulate work into one large end-of-task commit.

**Workflow:**
1. Run `git status` and show the staged diff summary.
2. If nothing is staged, offer to stage all tracked changes with `git add -u`.
3. Prompt for type, optional scope, and subject; compose the message.
4. Run `git commit -m "<message>"`.
5. Report the commit hash and subject.

**Guard:** Refuse to commit if `tsc --noEmit` or `eslint` (on staged files) reports errors. Show the errors and stop.

---

### `/sync`

Rebases the current branch onto the latest `main`. Use before opening a PR or after a long implementation session.

**Workflow:**
1. Abort if there are uncommitted changes; prompt to `/checkpoint` first.
2. `git fetch origin main`
3. `git rebase origin/main`
4. If conflicts arise, list the conflicted files and pause. Do not auto-resolve.
5. After resolution, run `git rebase --continue` and verify the build.

---

### `/open-pr`

Finalises the branch and opens a pull request against `main`.

**Workflow:**
1. Verify the branch is not `main`.
2. Run `/sync` if the branch is behind `origin/main`.
3. Run the full check suite: `pnpm typecheck && pnpm lint && pnpm test`.
4. Abort if any check fails; show the output.
5. `git push origin <branch> --force-with-lease`
6. Compose the PR body using the template below and open the PR via `gh pr create`.

**PR body template:**

```markdown
## Summary

<!-- One paragraph: what changed and why. -->

## Type of change

- [ ] feat — new capability
- [ ] fix — bug correction
- [ ] refactor — no behaviour change
- [ ] perf — performance improvement
- [ ] docs — documentation only
- [ ] chore — tooling, dependencies, config

## Checklist

- [ ] Types first: ADTs defined before implementation
- [ ] All exports have JSDoc
- [ ] No `any`, `as`, `!` outside permitted boundaries
- [ ] Exhaustive `switch` with `absurd` on all sum types
- [ ] `tsc --noEmit` passes
- [ ] `eslint` passes
- [ ] Tests pass (or not applicable — state why)
- [ ] DEVIATION comments added where rules are intentionally bent

## Breaking changes

<!-- Describe any breaking changes, or write "None". -->

## Related issues

<!-- Closes #N -->
```

---

### `/hotfix`

Creates a hotfix branch from `main`, applies a minimal fix, and opens an expedited PR.

**Workflow:**
1. `git checkout main && git pull --rebase origin main`
2. `git checkout -b hotfix/<slug>`
3. Apply the fix; `/checkpoint` immediately.
4. `/open-pr` — label the PR `hotfix` in the title.

**Constraint:** Hotfix branches contain exactly one commit. If more than one commit is needed, it is not a hotfix — use a regular feature branch.

---

### `/feature-lifecycle`

Runs the full end-to-end trunk workflow in a single guided session: start → implement → checkpoint(s) → sync → open-pr.

**Workflow:**
1. Run `/start-work`.
2. Implement the requested change following the TSF++ Guarded Coding workflow.
3. After each logical unit of work, run `/checkpoint`.
4. When implementation is complete and verified, run `/sync`.
5. Run `/open-pr`.

This command is the default mode for any non-trivial feature or fix.

---

## Release workflow

Releases are driven by Conventional Commits. The `trunk-release` agent handles local release preparation; the CI pipeline (release-please GitHub Action) owns tagging and npm publishing.

### Semver bump rules

| Signal | Bump |
|---|---|
| `BREAKING CHANGE:` footer or `!` after type | **major** |
| Any `feat` commit | **minor** |
| Only `fix`, `perf`, `refactor`, `chore`, `docs`, `test` | **patch** |

If no releasable commits exist since the last tag, no release is warranted.

### Release slash commands

Use `ai/agents/trunk-release.md` as the source of truth for release preparation work; Copilot will use the generated `.github/agents/trunk-release.agent.md` wrapper.

#### `/release preview`

Analyses commits since the last tag and reports the planned bump, next version, and draft changelog entries. No files are modified.

#### `/release prepare`

Asks for confirmation, then:
1. Updates `CHANGELOG.md` with a new version block.
2. Bumps the `"version"` field in `package.json`.
3. Updates `release-please-manifest.json`.
4. Commits with `chore(release): prepare v<version>`.

#### `/release verify`

Checks that `CHANGELOG.md`, `package.json`, and `release-please-manifest.json` are consistent with the latest git tag. No files are modified.

### Release lifecycle

```
feat/fix branches → merge to main
       ↓
trunk-release: /release preview   ← optional local preview
       ↓
CI: release-please opens release PR automatically
       ↓
Human reviews and merges release PR
       ↓
CI: tags commit, publishes to npm, creates GitHub release
```

The release commit message is always `chore(release): prepare v<version>`. Do not hand-craft release commits outside of `trunk-release`.

---

## Invariants

- `main` is always releasable. Never merge a branch that breaks the build.
- Rebase, never merge (within a branch). Merge only at PR close.
- One logical change per PR. Split unrelated changes into separate branches.
- PRs are merged by a human. Agents open PRs; they do not merge them.
- Release commits (`chore(release): ...`) are created exclusively by release-please. Do not hand-craft them.