# express-zod

Type-safe, schema-validated routing for [Express](https://expressjs.com/) and [Zod](https://zod.dev/) v4.

`express-zod` lets you describe every part of a route — `params`, `query`, `body`, `responses`, `headers`, and `cookies` — with Zod schemas. Your request and response handlers become fully typed, and invalid input is rejected before your code ever runs.

## Features

- **Schema-validated routing** — declare `params`, `query`, `body`, `responses`, `headers`, and `cookies` per route with Zod.
- **Type-safe handlers** — `req.params`, `req.query`, `req.body`, and `res.json()` are inferred from your schemas.
- **Prefixable & nestable** — `Router` and `Application` support prefixes and composition via `.use()`.
- **OpenAPI** — auto-generate OpenAPI documents and a Scalar UI with `@express-zod/openapi`.
- **End-to-End types** — generate a fully typed client from your server with `@express-zod/client`.

## Install

```bash
npm i express-zod
```

Peer dependencies:

- `express` ^5
- `zod` ^4

Companion packages (optional):

```bash
npm i @express-zod/client
npm i @express-zod/openapi
```

## Quick start

```ts
import { Application } from "express-zod";
import { z } from "zod";

const userSchema = z.object({
    id: z.number().int(),
    name: z.string().min(1),
    email: z.email(),
});

const app = new Application({ prefix: "/api" })
    .get(
        "/users/:id",
        {
            params: z.object({ id: z.coerce.number().int().positive() }),
            responses: {
                200: userSchema,
                404: z.object({ message: z.string() }),
            },
        },
        (req, res) => {
            // req.params.id: number
            const { id } = req.params;
            if (id !== 1) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json({ id: 1, name: "Ada Lovelace", email: "ada@example.com" });
        },
    )
    .post(
        "/users",
        {
            body: userSchema.omit({ id: true }),
            responses: {
                201: userSchema,
                400: z.object({ message: z.string() }),
            },
        },
        (req, res) => {
            // req.body: { name: string; email: string }
            const { name, email } = req.body;
            res.status(201).json({ id: 2, name, email });
        },
    );

app.listen(3000, () => {
    console.log("Server listening on http://localhost:3000");
});
```

## Route schemas

Attach a schema object as the first argument after the path to enable validation and type inference:

```ts
app.get(
    "/users/:id",
    {
        params: z.object({ id: z.number().int().positive() }),
        query: z.object({ verbose: z.boolean().default(false) }),
        body: z.object({ name: z.string() }),
        headers: z.object({ authorization: z.string() }),
        cookies: z.object({ session: z.string() }),
        responses: {
            200: userSchema,
            404: z.object({ message: z.string() }),
        },
    },
    handler,
);
```

| Schema key  | Validates                  | Feeds type of   |
| ----------- | -------------------------- | --------------- |
| `params`    | `req.params`               | `req.params`    |
| `query`     | `req.query`                | `req.query`     |
| `body`      | `req.body`                 | `req.body`      |
| `headers`   | `req.headers`              | `req.headers`   |
| `cookies`   | `req.cookies`              | `req.cookies`   |
| `responses` | response body (types only) | `res.json(...)` |

Only the request-side schemas (`params`, `query`, `body`, `headers`, `cookies`) are validated at runtime; a validation failure is forwarded to the next error handler. `responses` is used purely for type inference and OpenAPI generation.

Routes without a schema work too:

```ts
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
```

You can also pass multiple handlers, like native Express:

```ts
app.get("/users", { query: listQuerySchema }, middleUtils, (req, res) => {
    /* ... */
});
```

## Application and Router

`Application` wraps an Express app and `Router` wraps an Express router. Both share the same route registrars (`get`, `post`, `put`, `patch`, `delete`, `head`, `options`).

### Prefixes

```ts
const app = new Application({ prefix: "/api" });
```

### Nesting routers

```ts
import { Application, Router } from "express-zod";

const users = new Router({ prefix: "/users" })
    .get("/", { responses: { 200: z.array(userSchema) } }, listUsers)
    .post("/", { body: createUserSchema }, createUser);

const posts = new Router({ prefix: "/posts" }).get(
    "/:id",
    { params: userParams },
    getPost,
);

const app = new Application({ prefix: "/api" }).use(users).use(posts);
```

Prefixes compose — the routes above are served under `/api/users` and `/api/posts`.

### Middleware

Pass Express middleware straight to `.use()`:

```ts
import express from "express";

const app = new Application().use(express.json()).use(cors());
```

### Plugins

A plugin is an object with a `name` and an `install` function that receives the raw host and your instance:

```ts
const logger = {
    name: "logger",
    install({ raw, instance }) {
        raw.use((req, _res, next) => {
            console.log(req.method, req.url);
            next();
        });
    },
};

app.use(logger);
```

## Error handling

Validation failures are passed to `next(err)`, so install your own error middleware as usual:

```ts
import type { ErrorRequestHandler } from "express";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof z.ZodError) {
        res.status(400).json({ issues: err.issues });
        return;
    }
    res.status(500).json({ message: "Internal Server Error" });
};

new Application().use(errorHandler);
```

## Inspecting routes

The `routes` getter returns every registered route with its method, full path, and resolved options:

```ts
console.log(app.routes);
// [{ method: 'get', path: '/', fullPath: '/api/users', routeOptions: { ... } }, ...]
```

## Type-safe client

Pair your server with `@express-zod/client` to get a fully typed API client — methods, request arguments, and response bodies are inferred from the server's `Application` type.

See the [client README](packages/client/README.md) for full details.

```ts
// server.ts
import { Application } from "express-zod";

const app = new Application({ prefix: "/api" }).get(
    "/users/:id",
    {
        params: z.object({ id: z.number().int().positive() }),
        responses: { 200: userSchema, 404: z.object({ message: z.string() }) },
    },
    handler,
);

app.listen(3000);
export type App = typeof app;
```

```ts
// client.ts
import { defineClient } from "@express-zod/client";
import type { App } from "./server";

const client = defineClient<App>("http://localhost:3000/");

const user = await client.get("/api/users/:id", { params: { id: 1 } });
// user: { id: number; name: string; email: string }
```

## OpenAPI documentation

Add `@express-zod/openapi` to auto-generate an OpenAPI 3.x document from your route schemas, served alongside a Scalar API reference UI — no separate doc file to maintain.

See the [openapi README](packages/openapi/README.md) for full details.

```ts
import { openapi } from '@express-zod/openapi'
import { Application } from 'express-zod'

const docs = openapi({
    openapi: '3.0.1',
    info: { title: 'express-zod API', version: '0.0.1' },
})

new Application({ prefix: '/api' })
    .use(docs)
    .get('/users/:id', { ... }, handler)
    .listen(3000)
```

- `http://localhost:3000/openapi.json` — the raw OpenAPI document
- `http://localhost:3000/openapi` — the Scalar API reference UI

## License

[MIT](https://opensource.org/licenses/MIT)
