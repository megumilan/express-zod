import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { Router } from '../src/router'

test('infers request values from the route schemas', () => {
    new Router().get(
        '/users/:id',
        {
            params: z.object({ id: z.coerce.number() }),
            query: z.object({ verbose: z.coerce.boolean().default(false) }),
            body: z.object({ name: z.string() }),
            cookies: z.object({ session: z.string() }),
        },
        (req) => {
            expectTypeOf(req.params.id).toEqualTypeOf<number>()
            expectTypeOf(req.query.verbose).toEqualTypeOf<boolean>()
            expectTypeOf(req.body.name).toEqualTypeOf<string>()
            expectTypeOf(req.cookies.session).toEqualTypeOf<string>()
        },
    )
})

test('infers request headers declared by the route schema', () => {
    new Router().get(
        '/x',
        { headers: z.object({ 'x-token': z.string() }) },
        (req) => {
            expectTypeOf(req.headers['x-token']).toEqualTypeOf<string>()
        },
    )
})

test('accepts only the declared body for res.json', () => {
    new Router().get(
        '/users/:id',
        {
            params: z.object({ id: z.string() }),
            responses: {
                200: z.object({ id: z.string(), name: z.string() }),
                404: z.object({ error: z.string() }),
            },
        },
        (req, res) => {
            expectTypeOf(res.json)
                .parameter(0)
                .toEqualTypeOf<{ id: string; name: string }>()

            res.status(200).json({ id: req.params.id, name: 'ada' })
            res.status(404).json({ error: 'not found' })
        },
    )
})

test('infers request values for middleware registered with options', () => {
    // The schemas have to be lifted into a variable first: an inline literal
    // leaves `Options` uninferred, and `req.query` degrades to `unknown`.
    const schemas = { query: z.object({ page: z.coerce.number() }) }
    new Router().use(schemas, (req, _res, next) => {
        expectTypeOf(req.query.page).toEqualTypeOf<number>()
        next()
    })
})

test("types the error handler registered with use<'error'>", () => {
    new Router().use<'error'>((error, _req, _res, _next) => {
        expectTypeOf(error).toEqualTypeOf<Error>()
    })
})
