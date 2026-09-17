# @express-zod/openapi

Auto-generated [OpenAPI](https://spec.openapis.org/) documentation for express-zod, served with the [Scalar](https://github.com/scalar/scalar) API reference UI.

The plugin reads your route schemas (`params`, `query`, `body`, `headers`, `cookies`, `responses`) and builds an OpenAPI 3.x document for you — no separate doc file to maintain.

## Install

```bash
npm i @express-zod/openapi
```

Peer dependency:

- `express-zod`

## Quick start

```ts
import { InferOpenAPITags, openapi } from "@express-zod/openapi";
import express from "express";
import { Application, Router } from "express-zod";
import { z } from "zod";

const userSchema = z.object({
    id: z.number().int(),
    name: z.string().min(1),
    email: z.email(),
});

const docs = openapi({
    openapi: "3.0.1",
    info: {
        title: "express-zod API",
        version: "0.0.1",
    },
    tags: [
        {
            name: "User",
        },
    ],
});

const users = new Router({ prefix: "/users" })
    .get(
        "/",
        {
            query: z.object({
                page: z.coerce.number().int().min(1).default(1),
                limit: z.coerce.number().int().min(1).max(100).default(10),
            }),
            responses: {
                200: z.object({
                    items: z.array(userSchema),
                    total: z.number().int(),
                }),
            },
            meta: { summary: "List users", tags: ["User"] },
        },
        (req, res) => {
            res.json({
                items: [
                    { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
                ],
                total: 1,
            });
        },
    )
    .post(
        "/",
        {
            body: userSchema.omit({ id: true }),
            responses: {
                201: userSchema,
                400: z.object({ message: z.string() }),
            },
            meta: { summary: "Create a user" },
        },
        (req, res) => {
            const { name, email } = req.body;
            res.status(201).json({ id: 2, name, email });
        },
    );

const app = new Application({ prefix: "/api" })
    .use(express.json())
    .use(docs)
    .use(users);

app.listen(3000);

// Make meta.tags type-safe (see below)
declare global {
    namespace ExpressZodOpenAPI {
        interface Tags extends InferOpenAPITags<typeof docs> {}
    }
}
```

Then open your browser:

- `http://localhost:3000/openapi.json` — the raw OpenAPI document
- `http://localhost:3000/openapi` — the Scalar API reference UI

## Route schemas → OpenAPI

Each route's schema is mapped to the generated operation:

| Route schema | OpenAPI location                                         |
| ------------ | -------------------------------------------------------- |
| `params`     | `requestParams.path`                                     |
| `query`      | `requestParams.query`                                    |
| `headers`    | `requestParams.header`                                   |
| `cookies`    | `requestParams.cookie`                                   |
| `body`       | `requestBody.content['application/json'].schema`         |
| `responses`  | `responses[<status>].content['application/json'].schema` |

## Route metadata

Add an `meta` field to any route to describe the operation:

```ts
app.get(
    "/users/:id",
    {
        params: z.object({ id: z.coerce.number().int().positive() }),
        responses: {
            200: userSchema,
            404: z.object({ message: z.string() }),
        },
        meta: {
            summary: "Get a user",
            description: "Returns a single user by id.",
            operationId: "getUser",
            deprecated: false,
            security: [{ bearerAuth: [] }],
            tags: ["User"],
        },
    },
    (req, res) => {
        /* ... */
    },
);
```

`meta` accepts everything from `ZodOpenApiOperationObject` except `requestBody`, `responses`, `parameters`, `callbacks`, `requestParams` and `tags` (those are derived from the zod schemas). `tags` is re-enabled for type-safe tags (below).

## Type-safe tags

Declare the plugin's tags globally and `meta.tags` becomes fully typed:

```ts
const docs = openapi({
    openapi: "3.0.1",
    info: { title: "express-zod API", version: "0.0.1" },
    tags: [{ name: "User" }],
});

declare global {
    namespace ExpressZodOpenAPI {
        interface Tags extends InferOpenAPITags<typeof docs> {}
    }
}
```

Using a tag that was never declared, e.g. `meta: { tags: ['Bogus'] }`, is then a compile-time error.

## API

- `openapi(options)` — creates the plugin; install it with `app.use(docs)`.
- `openapiTags` — unique symbol used to brand the plugin with its tags.
- `TOpenAPIPlugin<Tags>` — plugin type carrying its declared tags.
- `InferOpenAPITags<T>` / `InferOpenAPITagNames<T>` — extract declared tags from a plugin instance for the global declaration above.

## License

[MIT](https://opensource.org/licenses/MIT)
