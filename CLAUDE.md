# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Rules

Standing rules. Each applies unless the current conversation says otherwise.

1. **Don't write test code unless asked.** No new `*.test.ts` or `*.test-d.ts`, whether adding a feature or fixing a bug. Running the existing suites is always fine; they must stay green.
2. **Stay inside the current package.** Don't search, read or modify anything outside the nearest `package.json` — from `packages/core`, that rules out sibling packages, root-level config and this file. Building, formatting or type-checking a sibling package counts as modifying it.
3. **Prefer `interface` to `type`** for object and record shapes. Keep `type` for unions, conditional types, mapped types, template literals, and aliases of primitives or other named types — which is all every `type` in `src/router.ts` is, so don't go converting them.
4. **Don't write comments unless asked.** No explanatory comments, no "why it has to be this way" notes, and no JSDoc beyond what the code around it already carries.

## Project Overview

**express-zod** is a type-safe, schema-validated routing library for Express 5 and Zod v4. Zod schemas validate request inputs (params, query, body, headers, cookies) and drive the types a handler sees — including what it may hand back to be sent as the response.

## Monorepo Structure (pnpm workspaces)

| Package               | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `packages/core`       | Main `express-zod` package — the `Router` class         |
| `packages/client`     | `@express-zod/client` — type-safe API client generator  |
| `packages/openapi`    | `@express-zod/openapi` — OpenAPI/Scalar documentation   |
| `packages/playground` | Interactive demo app (Vite + Tailwind + WebContainers)  |

> `client` and `openapi` still import the pre-rewrite core API (`TRouteOptions`,
> `TRouteRecord`, `TPlugin`, `TRoute`, `TRouteSchema`). Neither compiles against
> the current `core` and both need updating before they can be built.

## Architecture

Everything below `packages/core/src` is the library. `index.ts` re-exports
`./router` and the handler types.

- **`router.ts`** — the whole public surface, types included. `Router<RouterOptions, Records, Components>` exposes `.get .post .put .patch .delete .head .options .all .query`, `.use(...)` and `.listen`. Members prefixed `~` are internals: `~mount()` lazily builds the Express app, mounts the router under `~prefix` exactly once, and is what `listen` binds to; `~routes` returns the registered route metadata (`~path`, `~options`); `~register`, `~wrap` and `~components` are the dispatch internals. `JoinPath` (type) and `joinPath` (runtime) sit together at the top — they have no shared implementation and can drift.
- **`components.ts`** — `resolveOptions(components, options, seen)` merges the components an options object enables into it. Type-level counterpart is `TInferWithComponents`; the two must agree (see *Components* below).
- **`response.ts`** — `toResponse(handler, { autoNext })` adapts a handler whose **return value is the response** into an Express handler. Objects, arrays, strings, numbers and booleans all go through `res.json()` — never `res.send()`, so a number is never read as a status code. Special cases: Fetch `Response` (status, headers and each `set-cookie` are copied; encoding headers are dropped because `fetch` already decoded the body), Node streams and async iterables, `Buffer`, `null` (204, keeping a status the handler set itself) and `undefined`. It never rethrows, and calls `next()` from outside its `try` — Express 5's `router@2` both try/catches and attaches `.then(null, next)` to a returned thenable, so rethrowing forwards the same error twice.
- **`schema-validator.ts`** — `schemaValidator(options)` returns an Express middleware that `safeParse`s `params`, `query`, `body`, `headers` and `cookies` in that fixed order, writes each parsed value back onto `req`, and forwards the `ZodError` on the first failure. Returns `null` when there is nothing to validate, and ignores any schema whose `.meta().skip` is set.
- **`types/handler.ts`** — `IRequest`, `IResponse`, `RequestHandler`, `ErrorRequestHandler`. `ResponseBody` picks `responses[201]`, else `responses[200]`, else `unknown`.
- **`types/utility.ts`** — `IntelliSense`, `NoExtraKeys`, `IsObject`, `IsFunction`.

### Key Types Flow

`ISchema` names the schema keys a route may declare. `InferRouteOptions` maps each to its `z.output`, and `IRouteRegistrar` turns one call into an updated `Records`. Records are keyed by the **full path from the root**: `AddRoute` folds this router's own prefix into the key, so `use` only ever adds the *parent's* prefix — which is what lets prefixes compose recursively through any nesting depth.

### Components

A **component** is a named bundle of route schemas that later options can enable by name.

```ts
const app = new Router().use({
    asComponent: {
        name: 'User',
        headers: z.object({ authorization: z.string() }),
    },
})

// `User: true` at the top level of the options enables it
app.get('/me', { User: true, query: z.object({ page: z.coerce.number() }) }, (req) => {
    req.headers.authorization // string, from the component
})
```

Enabling merges the component's schemas *underneath* the call site's, so the call site wins a conflict. Object keys (`params`, `query`, `headers`, `cookies`, `locals`) merge field by field, `responses` merges per status code, `body` is replaced wholesale. Enables nest — a declaration may enable other components — and a cycle is cut on both sides (the type's `Seen` parameter, the runtime's `seen` set).

Two things have to agree, and are the usual place a change goes wrong:

- `TInferWithComponents` (types) and `resolveOptions` (runtime) implement the same merge independently. A change to either needs the other. `TInferUseOptions` is the `use`-only variant: a declaration that also passes middleware doubles as one, so its schemas have to be merged into the handler's types too, under `TInferWithComponents`.
- The *registrar overloads* constrain `Options` to `TOptions` (`object`), **never** to `IRouteOptions`. That interface is a weak type, and `{ User: true }` shares no property with it, so a weak-type constraint rejects the inferred literal — TypeScript then substitutes the constraint and the handler's `req`/`res` silently degrade to `InferRouteOptions<IRouteOptions>`. `NoExtraKeys` is what validates the options; routes give it `IRouteOptions & TComponentEnables<Components>`, while `use` gives it `TComponentOptions<Components>` (which also admits `asComponent`) **intersected with `Options`** — that intersection is a plain inference site, needed because `NoExtraKeys` alone fails to infer an options object whose only key is `asComponent`.
- `asComponent` lives on the ordinary `use` options overload, not on an overload of its own; the overload's *return* type switches on it (`Options extends { asComponent: infer Component }`) to hand back a router with the component registered.

`~register` resolves once and hands the **same merged object** to both `schemaValidator` and `~updateRoute` — that is what makes the merged schemas show up in `~options`, which is all the OpenAPI plugin reads.

### Known rough edges

- `use({ ... }, handler)` with an **inline** options literal does not infer `Options`, so `req.params` and friends degrade to `unknown`. Lift the schemas into a variable first. (The JSDoc on `use` shows the inline form, which does not work.) Route verbs (`get`, `post`, …) do not have this problem.
- Two annotated Express `ErrorRequestHandler`s cannot be passed to one `use` call — `IRequest<{}>['params']` is `unknown`, which is not assignable to Express's `ParamsDictionary`. Chain `.use(a).use(b)` instead.
- Middleware registered through `use` never auto-calls `next()` (that is the `autoNext: false` above). Returning a value still short-circuits; returning `undefined` means the middleware owns the chain, exactly as in plain Express.
- Components must be **chained**: `Components` lives on the type `use` returns, not on the instance, so `const r = new Router(); r.use({ asComponent: … }); r.get('/', { User: true }, h)` is a type error even though the runtime would accept it.
- Two components enabled together that declare the *same* field are ambiguous — the runtime folds them in options-key order while the type level peels the names in union order, which is not the same order. A field only one component declares is never ambiguous.
- `use(childRouter)` propagates neither the child's `Records` components nor its `~components` registry, so a parent route cannot enable a component the child declared.
- `safeExtend` carries the **base** schema's config and meta to the merged result, so a component's `strict`/`loose` mode and its `.meta({ skip: true })` beat the call site's.

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

# Tests — run them against packages/core
# The repo root has no vitest config, so `pnpm test` from there loads these
# test files without `globals: true` and fails with "describe is not defined".
cd packages/core
npx vitest run                # once
npx vitest                    # watch
npx vitest run --typecheck    # also collects the .test-d.ts assertions
npx vitest --ui
# …or, from anywhere:
pnpm --filter express-zod exec vitest run

# A single test file
cd packages/core && npx vitest run __test__/router.test.ts

# Type-only check — fast, and covers both src and __test__
cd packages/core && npx tsc --noEmit -p tsconfig.json

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

- **Vitest**, configured in `packages/core/vitest.config.ts`: `globals: true`, `typecheck.enabled: true`.
- Runtime suites live in `packages/core/__test__/*.test.ts`; type assertions live beside them in `*.test-d.ts` using `expectTypeOf`.
- `packages/core/tsconfig.json` includes `__test__`, so `npx tsc --noEmit -p tsconfig.json` type-checks the tests too — prefer it over vitest when only types changed.
- Assertions in a `.test-d.ts` **must** be inside a `test()`/`describe()` block, or vitest never collects them. A file with no `test()` call reports both "No test suite found" and "Type Errors no errors", which reads like the typechecker is broken when it simply saw nothing.
- HTTP tests use **supertest**. A test reaches the mounted app through `router['~mount']()`; nothing public exposes it, so the suites declare a small local `appOf` helper typed structurally (`{ '~mount': () => Express }`) to sidestep `Router<A, B>` variance.
- Confirm a new type test actually fails before trusting it — flip an assertion and watch `npx vitest run --typecheck` go red.

## Linting & Formatting

- **Biome** (`biome.json`) — linting and formatting. `preset: "recommended"`, single quotes, semicolons as needed, with `noExplicitAny` and `noConfusingVoidType` turned off.
- **lint-staged** runs `biome lint --error-on-warnings` (warnings fail the commit) plus `biome check`.
- **Husky** pre-commit hook triggers lint-staged. Don't reach for `--no-verify`; fix the finding instead.

## Important Files

- `package.json` (root) — root workspace config, scripts, devDependencies
- `pnpm-workspace.yaml` — workspace packages and catalog (`type-fest`)
- `tsconfig.base.json` — base TypeScript config (esnext, strict, bundler module resolution)
- `tsdown.config.base.ts` — shared tsdown configuration
- `biome.json` — biome lint/format config
- `packages/core/src/router.ts` — the `Router` class and every public type
- `packages/core/src/response.ts` — handler return value → HTTP response
- `packages/core/src/schema-validator.ts` — runtime validation middleware
- `packages/core/src/types/handler.ts` — request/response and handler types

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

- Node.js >= 24.12.0 is required (`engines` in root `package.json`).
- TypeScript 5.9.3; `verbatimModuleSyntax` and `exactOptionalPropertyTypes` are enabled.
- **`Application`, `sse.ts`, `utils/path.ts` and `types/router.ts` no longer exist.** The rewrite collapsed `Application` into `Router` (`listen` binds to the app `~mount()` builds) and dropped SSE, plugins and the `Application`/`Router` split. Check git history for the old shape.
- **`packages/core/README.md` is stale.** It documents `Application`, `app.routes`, `routeOptions`, an `sse` option and a plugin system — none of which exist in `src/`. Don't treat it as a spec; read `src/router.ts`.
- `.github/workflows/deploy-playground.yml` only builds and deploys the playground. There is no CI job running the tests.
