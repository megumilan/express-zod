import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { Application } from '../src'

describe('route types', () => {
    it('infers params, query and body from their schemas', () => {
        new Application().post(
            '/users/:id',
            {
                body: z.object({ name: z.string() }),
                query: z.object({ verbose: z.boolean() }),
                params: z.object({ id: z.coerce.number() }),
            },
            (req) => {
                expectTypeOf(req.params).toEqualTypeOf<{ id: number }>()
                expectTypeOf(req.query).toEqualTypeOf<{ verbose: boolean }>()
                expectTypeOf(req.body).toEqualTypeOf<{ name: string }>()
            },
        )
    })

    it('marks optional params as optional', () => {
        new Application().get(
            '/users',
            { params: z.object({ sort: z.string().optional() }) },
            (req) => {
                expectTypeOf(req.params).toEqualTypeOf<{ sort?: string }>()
            },
        )
    })

    it('types res.json and res.status() against the responses schema', () => {
        new Application().get(
            '/users',
            {
                responses: {
                    200: z.object({
                        items: z.array(z.object({ id: z.number() })),
                    }),
                    400: z.object({ message: z.string() }),
                },
            },
            (_req, res) => {
                res.json({ items: [{ id: 1 }] })
                res.status(400).json({ message: 'nope' })
                // @ts-expect-error 500 is not a declared response code
                res.status(500)
                // @ts-expect-error 400 body must match its schema
                res.status(400).json({ items: [] })
                // @ts-expect-error 200 body is required by the schema
                res.json()
            },
        )
    })

    it('types res.write against the responses schema', () => {
        new Application().get(
            '/events',
            {
                sse: true,
                responses: { 200: z.object({ message: z.string() }) },
            },
            (_req, res) => {
                res.write({ message: 'hello' })
                res.write({ message: 'world' }, (error) => {
                    error satisfies Error | null | undefined
                })
                res.write({ message: 'hello' }, 'utf8', (error) => {
                    error satisfies Error | null | undefined
                })
                // @ts-expect-error chunk must match responses[200]
                res.write({ nope: true })
                // @ts-expect-error chunk must match responses[200]
                res.write('plain string')
            },
        )
    })

    it('accepts sse as a boolean route option and writes free-form chunks', () => {
        new Application().get('/events', { sse: true }, (_req, res) => {
            res.write('hello')
            res.write({ any: 'chunk' })
            res.end()
        })
        new Application().get(
            '/typed-events',
            // @ts-expect-error sse must be a boolean
            { sse: 'yes' },
            () => undefined,
        )
    })
})
