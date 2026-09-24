# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project Overview

**express-zod** is a type-safe, schema-validated routing library for Express and Zod v4. It uses Zod schemas to validate request inputs (params, query, body, headers, cookies) and infer response types at compile time.

## Monorepo Structure (pnpm workspaces)

| Package               | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| `packages/core`       | Main `express-zod` package — `Router` and `Application` classes |
| `packages/client`     | `@express-zod/client` — type-safe API client generator          |
| `packages/openapi`    | `@express-zod/openapi` — OpenAPI/Scalar documentation           |
| `packages/playground` | Interactive demo app (Vite + Tailwind + WebContainers)          |

## Architecture

- **`Router`** (`packages/core/src/router.ts`) — Core class wrapping Express Router. Supports `.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.head()`, `.options()`, `.all()`, `.use()`, and `.listen()`. Each route method is overloaded for type inference: passing a schema object infers `req.params`, `req.query`, `req.body`, and `res.json()` types.
- **`Application`** (`packages/core/src/application.ts`) — Wraps Express app directly. **Note: this file was deleted in the current working tree**; check git history if needed.
- **`schema-validator.ts`** — Runtime validation middleware that calls `schema.parse(req[key])` for each request-side schema (params, query, body, headers, cookies). Validation failures forward to `next(err)`.
- **`types/router.ts`** — Core type definitions: `IRouteOptions`, `IRoute`, `IRouteRecord`, `IRouterOptions`, `RouteMethod`, `RouteHandler`, `AppendRoutes`, `UpdateRoutesPath`, `IPlugin`. These use heavy conditional/types from `type-fest` and `zod`.
- **`types/utility.ts`** — Shared utility types: `MarkOptionalIfUndefined`, `IntelliSense`, `Mutable`, `NoExtraKeys`, `WhenUnexpected`.
- **`utils/path.ts`** — `JoinPath` type and `joinPath` function for path concatenation.

## Key Types Flow

Route schemas map to TypeScript types via `InferOptions` → `InferRouteSchema` → `RouteHandler`. The `responses` key in `IRouteOptions` is not validated at runtime but drives `res.json()` typing and OpenAPI generation.

## Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build a single package
pnpm --filter express-zod build        # core
pnpm --filter @express-zod/client build  # client
pnpm --filter @express-zod/openapi build # openapi

# Run tests (from root or package)
pnpm test
pnpm --filter express-zod test

# Run tests with UI
pnpm test:ui
pnpm --filter express-zod test:ui

# Run a single test file (via vitest)
npx vitest run packages/core/__test__/router.test-d.ts

# Lint
pnpm lint

# Format
pnpm format

# Prepare (set up husky)
pnpm prepare
```

## Build System

- **tsdown** is the bundler (esm format, `.d.ts` generation). Config lives in `tsdown.config.base.ts` and each package has its own `tsdown.config.ts` importing it.
- `express` and `zod` are never bundled (`deps.neverBundle`).
- `tsconfig.base.json` extends to all packages; each package has a local `tsconfig.json` extending it.

## Testing

- **Vitest** with `globals: true` and `typecheck.enabled: true`.
- Tests live in `packages/core/__test__/`. Type-level tests use `@vitest/typecheck` via `.test-d.ts` files.
- The project uses `supertest` for HTTP integration testing.

## Linting & Formatting

- **Biome** (`biome.json`) — linting and formatting. Configured with `preset: "recommended"`, single quotes, semicolons as needed.
- **lint-staged** runs biome on staged files.
- **Husky** pre-commit hook triggers lint-staged.

## Important Files

- `package.json` (root) — root workspace config, scripts, devDependencies
- `pnpm-workspace.yaml` — workspace packages and catalog (`type-fest`)
- `tsconfig.base.json` — base TypeScript config (esnext, strict, bundler module resolution)
- `tsdown.config.base.ts` — shared tsdown configuration
- `biome.json` — biome lint/format config
- `packages/core/src/router.ts` — main Router class (the most important file)
- `packages/core/src/types/router.ts` — core type definitions
- `packages/core/src/schema-validator.ts` — runtime validation
- `packages/core/src/utils/path.ts` — path utilities

## Commit Convention

Commit format: `type(scope): description`

| type       | Description                              |
| ---------- | ---------------------------------------- |
| `feat`     | New feature                              |
| `fix`      | Bug fix                                  |
| `refactor` | Code refactoring                         |
| `docs`     | Documentation change                     |
| `chore`    | Build, dependency, or config maintenance |
| `ci`       | CI configuration change                  |

Commit command:

```bash
# Stage and commit
git add . && git commit -m "type(scope): description"
```

If multiple files are changed, use a list in the commit message:

```bash
git add . && git commit -m "feat(core): support generic middleware

- Add middleware parameter overload
- Update schema-validator type inference
- Fix edge cases in path utility function"
```

## Notes

- The `sse.ts` module exists but was recently removed from the main flow (git history shows `feat(core): SSE support and test` commit).
- `application.ts` and several test files were deleted in the working tree but remain in git history.
- Node.js >= 24.12.0 is required (`engines` in root `package.json`).
- TypeScript 6.0.3 is used; `verbatimModuleSyntax` and `exactOptionalPropertyTypes` are enabled.
