---
name: commit
description: Stage all changes and commit with conventional commit format. Use when user wants to commit, save changes, or says "commit", "save", "git commit".
tools: Bash, Read, Glob
---

# Commit

Stage all changes and create a commit following the conventional commit format used in this project.

## Workflow

### Phase 1: Check Changes

Run `git status` to see what files have changed:

```bash
git status
```

Review the staged and modified files. If there are untracked files, prompt the user before adding them.

### Phase 2: Stage Changes

Stage all tracked changes:

```bash
git add .
```

### Phase 3: Determine Commit Message

Analyze the changed files to determine the appropriate `type(scope): description` format:

| Changed Files Pattern | Type | Example |
|---|---|---|
| `packages/core/src/**` | `feat` or `fix` or `refactor` | `feat(core): add validation middleware` |
| `packages/core/src/types/**` | `feat` or `refactor` | `refactor(core): improve type inference` |
| `packages/client/**` | `feat` or `fix` | `feat(client): update type generation` |
| `packages/openapi/**` | `feat` or `fix` | `fix(openapi): correct schema mapping` |
| `packages/playground/**` | `feat` or `chore` | `feat(playground): update demo` |
| `.github/**`, `*.yml`, `*.yaml` | `ci` | `ci: add deploy workflow` |
| `README.md`, `*.md` | `docs` | `docs: update installation instructions` |
| `package.json`, `pnpm-lock.yaml`, `tsconfig.*` | `chore` | `chore: update dependencies` |
| `biome.json`, `.husky/**` | `chore` | `chore: update lint config` |
| `tests/**`, `__test__/**` | `feat` or `fix` | `fix(core): add edge case tests` |

If the type is ambiguous, ask the user which type applies.

### Phase 4: Determine Scope

Extract the scope from the changed file paths:
- `packages/core/src/` → `core`
- `packages/client/` → `client`
- `packages/openapi/` → `openapi`
- `packages/playground/` → `playground`
- Root config files → no scope or omit

### Phase 5: Commit

If only one logical change:
```bash
git commit -m "type(scope): description"
```

If multiple distinct changes or many files changed, use a multi-line format with a bullet list:
```bash
git commit -m "type(scope): summary description

- Item 1: brief description of change
- Item 2: brief description of change
- Item 3: brief description of change"
```

## Commit Message Rules

- Lowercase description after the colon
- Do not end with a period
- Use imperative mood ("add" not "added")
- Scope should match the package directory name
- For root-level changes without a clear package, omit the scope: `chore: update dependencies`

## Example

Given changes to `packages/core/src/router.ts`, `packages/core/src/types/router.ts`, and `packages/core/src/utils/path.ts`:

```bash
git add . && git commit -m "refactor(core): consolidate path utilities and type definitions

- Extract JoinPath type into dedicated utility
- Simplify AppendRoutes type using updated path helpers
- Remove redundant type aliases from router.ts"
```
