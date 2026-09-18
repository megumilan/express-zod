# express-zod

Type-safe, schema-validated routing for [Express](https://expressjs.com/) and [Zod](https://zod.dev/).

Validate request bodies, query strings, path params, headers and cookies against Zod schemas, and get fully inferred types in your route handlers — with zero runtime cost on responses.

## Features

- **Schema-first routes** — validate `body`, `query`, `params`, `headers` and `cookies` with Zod schemas
- **End-to-end type inference** — route handlers are typed from your schemas, including response shapes for `res.json()`
- **Chainable API** — `new Application().get('/users', {...}, handler)`
- **Modular routers** — compose routers with automatic prefix composition in route metadata
- **Server-Sent Events** — first-class SSE support typed against your `responses` schemas
- **Plugin system** — extend route registration with reusable plugins
- **Runtime metadata** — inspect registered routes (`path`, `method`, `fullPath`, schemas) for docs or tooling

## Installation

`express-zod` requires Express 5 and Zod 4 as peer dependencies.

```bash
pnpm add express-zod express zod
```

## Quick start

```ts
import { z } from "zod";
import { Application } from "express-zod";

const app = new Application()
    .get("/", (_req, res) => res.json({ ok: true }))
    .post(
        "/users",
        { body: z.object({ name: z.string().min(1) }) },
        (req, res) => {
            res.json({ received: req.body.name });
        },
    );

app.listen(3000);
```

Invalid requests are forwarded to your error middleware as `z.ZodError` (Status 400).

## Usage

### Route schemas

Declare a schema object as the first argument after the path. Each key is optional:

| Key         | Zod type                  | Validates               |
| ----------- | ------------------------- | ----------------------- |
| `params`    | `ZodObject`               | URL path params         |
| `query`     | `ZodObject`               | query string            |
| `body`      | `ZodType`                 | request body            |
| `headers`   | `ZodObject`               | request headers         |
| `cookies`   | `ZodObject`               | request cookies         |
| `responses` | `Record<status, ZodType>` | response type contracts |

```ts
import { z } from "zod";

app.get(
    "/users/:id",
    {
        params: z.object({ id: z.coerce.number() }),
        query: z.object({ verbose: z.coerce.boolean().default(false) }),
    },
    (req, res) => {
        // req.params.id: number
        // req.query.verbose: boolean
        res.json({ id: req.params.id });
    },
);
```

> Headers and cookies must be populated by middleware (e.g. `cookie-parser`) before the route runs.

### Typed responses

Declare a `responses` schema to type `res.status()` and `res.json()`:

```ts
app.get(
    "/users/:id",
    {
        params: z.object({ id: z.string() }),
        responses: {
            200: z.object({ id: z.string(), name: z.string() }),
            404: z.object({ error: z.string() }),
        },
    },
    (req, res) => {
        // res.status(200).json({ ... }) /* id + name only */
        // res.status(404).json({ error: 'not found' })
        res.status(200).json({ id: req.params.id, name: "ada" });
    },
);
```

`responses` schemas are compile-time contracts only — they are **not** validated at runtime.

### Validation errors

On invalid input, the request is passed to the next error handler with a `ZodError`. Register an error middleware to format it (e.g. Status 400):

```ts
const zodErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof z.ZodError) {
        res.status(400).json({ issues: error.issues });
        return;
    }
    next(error);
};

app.use(zodErrorHandler);
```

### Routers and prefixes

Mount routers to reuse route groups. Prefixes are composed across mount sites and reflected in `app.routes` metadata.

```ts
import { Router } from "express-zod";

const users = new Router({ prefix: "/users" }).get("/:id", (req, res) =>
    res.json({ id: req.params.id }),
);

const app = new Application({ prefix: "/api" }).use(users);

app.routes.map((route) => route.fullPath); // ['/api/users/:id']

app.listen(3000); // GET /api/users/:id
```

Routers can be nested inside other routers, and prefixes compose through every level.

### Server-Sent Events

`res.sse()` streams values from a single value, an iterable, or an async iterable. When a `responses` schema is present, event payloads are type-checked against `responses[200]`.

```ts
app.get(
    "/events",
    { responses: { 200: z.object({ message: z.string() }) } },
    (_req, res) => {
        res.sse(
            (async function* () {
                yield { message: "hello" };
                yield { event: "update", data: { message: "world" } };
            })(),
        );
    },
);
```

- Plain values are serialized as `data:` lines (strings and objects, `JSON.stringify`ed)
- `{ event, data }` chunks emit a named SSE event
- `res.sse(...)` returns a controller with `.onCancel(...)` and `.cancel(reason?)` to react to client disconnects

### Plugins

A plugin is an object with a `name` and an `install(ctx)` method. It can register routes or attach middleware to the underlying express instance.

```ts
const healthPlugin = {
    name: "health",
    install({ raw, instance }) {
        raw.get("/health", (_req, res) => res.json({ status: "ok" }));
    },
};

const app = new Application().use(healthPlugin);

app.listen(3000); // GET /health
```

### Middleware

Pass any Express middleware or error handler to `use(...)`. It runs before your route handlers, in registration order.

```ts
app.use(express.json());
app.use((req, _res, next) => {
    req.requestId = crypto.randomUUID();
    next();
});
```

## API

### `Application`

A top-level, listenable Express app. Extends `Router`.

- `constructor(options)` — accepts `{ prefix }` plus Express `RouterOptions`
- `app.get|post|put|patch|delete|head|options(path, [schemas], ...handlers)` — register a route
- `app.use(middleware | router | plugin)` — mount middleware, routers or plugins
- `app.listen(...)` — bound `Express#listen`
- `app.routes` — registered route metadata (`path`, `method`, `fullPath`, `routeOptions`)

### `Router`

A mountable, non-listenable router. Same route registration API as `Application`.

- `constructor(options)` — `new Router({ prefix: '/api' })`
- `router.get|post|put|patch|delete|head|options(...)` — register a route
- `router.use(...)` — mount middleware, sub-routers or plugins
- `router.routes` — registered route metadata

### Route handler signature

```ts
type Handler = (
    req: Request, // typed params, query, body, headers, cookies
    res: TRouteResponse, // typed status()/json()/sse()
    next: NextFunction,
) => unknown;
```

## License

[MIT](./LICENSE)
