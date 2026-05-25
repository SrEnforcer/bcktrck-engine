# Write changelog entry

Inspect the current working tree, derive the correct conventional commit message,
and append a matching entry to the `## [Unreleased]` section of `CHANGELOG.md`.

---

## Step 1 — Inspect changes

Run the following to see what has changed:

```bash
git diff --stat HEAD
git status --short
```

For each changed or added file, read enough of its diff to understand **what
changed and why** — not just which lines moved.

```bash
git diff HEAD -- <file>
```

If files are staged but not committed, use:

```bash
git diff --cached --stat
git diff --cached -- <file>
```

---

## Step 2 — Classify changes

Map each change to a Conventional Commits type:

| Type | Use when |
|---|---|
| `feat` | New behaviour or capability visible to a consumer |
| `fix` | Corrects incorrect behaviour |
| `perf` | Improves performance without changing behaviour |
| `refactor` | Internal restructuring; no behaviour change, no bug fix |
| `test` | Adds or fixes tests; no production code change |
| `docs` | Documentation only |
| `chore` | Tooling, config, dependencies, release machinery |
| `build` | Build system or external dependency changes |
| `ci` | CI configuration changes |

**Breaking change:** any change that removes or renames a public export, changes
a function signature, or alters a type in a way that requires consumer updates.
Mark with `!` after the type (e.g. `feat!`) and add a `BREAKING CHANGE:` footer.

**Scope:** the package or module affected — e.g. `prelude`, `boundary`, `agents`,
`react`, `dal`. Omit if the change is cross-cutting.

---

## Step 3 — Write the commit message

Produce a conventional commit message following this format exactly:

```
<type>(<scope>): <imperative summary in sentence case, ≤ 72 chars>

<optional body — what changed and why, not how, wrapped at 72 chars>

<optional footers>
BREAKING CHANGE: <description if applicable>
Closes #<issue> (if applicable)
```

Rules:
- Summary is imperative mood: "add", "fix", "remove" — not "added", "fixes"
- Summary does not end with a period
- Body explains the **why**, not the **what** (the diff is the what)
- One commit per logical change; if the diff contains multiple unrelated changes,
  produce one message per change and say so

---

## Step 4 — Update CHANGELOG.md

Find or create the `## [Unreleased]` section at the top of `CHANGELOG.md`.
If `CHANGELOG.md` does not exist, create it with this header:

```markdown
# Changelog

All notable changes to this project will be documented in this file.
This file is maintained automatically by [release-please](https://github.com/googleapis/release-please)
and supplemented during development via the `/trunk-changelog` prompt.

<!-- do not remove this comment — release-please uses it as an anchor -->
<!-- RELEASE-PLEASE-INSERTION-POINT -->

## [Unreleased]
```

Append the new entry under `## [Unreleased]`, grouped by type in this order:

```markdown
## [Unreleased]

### Breaking changes
- `feat!(boundary)!: remove legacy `fold` export` — consumers must migrate to `map`/`flatMap`

### Features
- `feat(prelude): add ReadonlyMap combinators` — `intoMap`, `assoc`, `dissoc`, `lookup`, `entriesOfMap`

### Bug fixes
- `fix(agents): init.mjs fails with ReferenceError when run with --yes`

### Performance
- ...

### Refactoring
- ...

### Tests
- ...

### Documentation
- ...

### Chores
- ...
```

Only include sections that have entries. Do not add empty sections.

Each entry is a single line:
- Backtick-quoted commit summary
- Em dash
- One-sentence plain-English explanation of the user-visible impact

---

## Step 5 — Output

Print the proposed commit message in a code block so it can be copied directly
into the terminal or used with `git commit`:

```
git commit -m "<type>(<scope>): <summary>" \
           -m "<body paragraph if needed>"
```

If there are multiple logical changes, list each message separately and recommend
committing them individually with `git add -p` to stage per-change.

---

## Rules

- Never invent changes that are not visible in the diff
- Never write a changelog entry for a change that has no user-visible impact
  (internal renaming, comment edits) — use `chore` or `refactor` in the commit
  message but omit from `## [Unreleased]`
- Do not modify any section of `CHANGELOG.md` other than `## [Unreleased]`
- release-please owns every versioned section (`## [1.2.3]`) — never touch those