# Initialize git repository

Set up a clean git repository for this TSF++ project with a `main` branch, a
proper `.gitignore`, an initial conventional commit, and an optional remote.

---

## Steps

### 1 — Check git status

Run `git status` to determine whether a repository already exists.

- If already initialized: report the current branch and proceed to step 3.
- If not initialized: run `git init -b main` and confirm.

### 2 — Create `.gitignore`

If no `.gitignore` exists, create one. If one exists, verify it covers at
minimum all entries below and append any that are missing.

```gitignore
# Dependencies
node_modules/

# Build output
dist/
build/
out/
coverage/
.turbo/

# TypeScript
*.tsbuildinfo

# Environment
.env
.env.*
!.env.example

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.idea/

# pnpm
.pnpm-store/

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
```

### 3 — Stage and commit

```bash
git add .
git status
```

Show the staged file list. Then commit:

```bash
git commit -m "chore: initial project setup"
```

The commit message follows Conventional Commits. Do not use a different format.

### 4 — Remote (optional)

Ask once:

> Do you want to add a remote? If so, paste the repository URL (or press Enter
> to skip):

If a URL is provided:

```bash
git remote add origin <url>
git push -u origin main
```

This is the only legitimate direct push to `main` in the lifetime of this
repository. After this, all changes go through branches and pull requests.

Then activate Husky hooks (they may have silently failed during `pnpm install`
if git was not yet initialized at that point):

```bash
pnpm exec husky install
```

If skipped, confirm the local repository is ready and suggest adding a remote
later with:

```bash
git remote add origin <url>
git push -u origin main
```

---

## Rules

- Never force-push (`--force`) on `main`.
- Never amend the initial commit once pushed.
- If `git push` fails due to an existing remote history, stop and report — do
  not `--force`.
- Do not create any branches other than `main` during this flow.