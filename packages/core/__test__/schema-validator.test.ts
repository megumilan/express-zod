import express, { type ErrorRequestHandler, type Express } from 'express'
import request from 'supertest'
import { z } from 'zod'
import { Router } from '../src/router'
import { schemaValidator } from '../src/schema-validator'

/**
 * The mounted Express app — the object `listen` binds to. Tests go through it
 * rather than `listen` so they exercise mounting without opening a socket.
 */
const appOf = (router: { '~mount': () => Express }) => router['~mount']()

const onInvalid: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(400).json({ failed: true })
}

/** Builds a middleware, failing loudly if it should have produced one. */
function validatorOf(schemas: Parameters<typeof schemaValidator>[0]) {
    const validation = schemaValidator(schemas)
    if (!validation) {
        throw new Error('expected a validation middleware')
    }
    return validation
}

/** Answers 400 to whatever reaches the error middleware, collecting it. */
function captureError(app: Express) {
    const errors: unknown[] = []
    const handler: ErrorRequestHandler = (error, _req, res, _next) => {
        errors.push(error)
        res.status(400).end()
    }
    app.use(handler)
    return errors
}

function zodErrorOf(errors: unknown[]) {
    const [error] = errors
    if (!(error instanceof z.ZodError)) {
        throw new Error(`expected a ZodError, got ${String(error)}`)
    }
    return error
}

describe('schemaValidator', () => {
    it('returns null when no schema is declared', () => {
        expect(schemaValidator({})).toBeNull()
    })

    it('returns null when every declared schema is skipped', () => {
        const schemas = {
            params: z.object({}).meta({ skip: true }),
            query: z.object({}).meta({ skip: true }),
        }
        expect(schemaValidator(schemas)).toBeNull()
    })

    it('returns a middleware as soon as one schema is not skipped', () => {
        expect(
            schemaValidator({
                params: z.object({}).meta({ skip: true }),
                query: z.object({}),
            }),
        ).toBeTypeOf('function')
    })

    it('replaces the value on the request with the parsed one', async () => {
        const app = express()
        app.use(validatorOf({ query: z.object({ id: z.coerce.number() }) }))
        app.get('/', (req, res) => res.json(req.query))

        const res = await request(app).get('/?id=1').expect(200)
        // A string `'1'` would survive verbatim if the parsed value were dropped.
        expect(res.body).toEqual({ id: 1 })
    })

    it('leaves the keys it was not given alone', async () => {
        const app = express()
        app.use(validatorOf({ query: z.object({ id: z.string() }) }))
        app.get('/', (req, res) =>
            res.json({ params: req.params, query: req.query }),
        )

        const res = await request(app).get('/?id=1&extra=2').expect(200)
        // zod strips by default, so `query` was rewritten while `params` was not.
        expect(res.body).toEqual({ params: {}, query: { id: '1' } })
    })

    it('forwards a ZodError to the error middleware', async () => {
        const app = express()
        app.use(validatorOf({ query: z.object({ id: z.string() }) }))
        app.get('/', (_req, res) => res.json({ ok: true }))
        const errors = captureError(app)

        await request(app).get('/').expect(400)
        expect(zodErrorOf(errors).issues.map((issue) => issue.path)).toEqual([
            ['id'],
        ])
    })

    it('reports only the first failing key', async () => {
        const app = express()
        app.use(express.json())
        app.post(
            '/x',
            validatorOf({
                query: z.object({ page: z.string() }),
                body: z.object({ name: z.string() }),
            }),
            (_req, res) => res.json({ ok: true }),
        )
        const errors = captureError(app)

        // `page` precedes `name`, so the body is never reached.
        await request(app).post('/x').send({}).expect(400)
        expect(zodErrorOf(errors).issues.map((issue) => issue.path)).toEqual([
            ['page'],
        ])
    })

    it('validates params, query, body, headers and cookies', async () => {
        const app = express()
        app.use(express.json())
        // A stand-in for cookie-parser, which owns `req.cookies`.
        app.use((req, _res, next) => {
            req.cookies = { session: 'abc' }
            next()
        })
        app.post(
            '/items/:id',
            validatorOf({
                params: z.object({ id: z.coerce.number() }),
                query: z.object({ page: z.coerce.number() }),
                body: z.object({ name: z.string() }),
                headers: z.object({ 'x-trace': z.string() }),
                cookies: z.object({ session: z.string() }),
            }),
            (req, res) =>
                res.json({
                    params: req.params,
                    query: req.query,
                    body: req.body,
                    trace: req.headers['x-trace'],
                    cookies: req.cookies,
                }),
        )

        const res = await request(app)
            .post('/items/7?page=2')
            .set('x-trace', 't1')
            .send({ name: 'ada' })
            .expect(200)

        expect(res.body).toEqual({
            params: { id: 7 },
            query: { page: 2 },
            body: { name: 'ada' },
            trace: 't1',
            cookies: { session: 'abc' },
        })
    })

    it('ignores a skipped schema but still runs the others', async () => {
        const app = express()
        app.use(
            validatorOf({
                query: z.object({ page: z.string() }).meta({ skip: true }),
                headers: z.object({ 'x-trace': z.string() }),
            }),
        )
        app.get('/', (req, res) =>
            res.json({ query: req.query, trace: req.headers['x-trace'] }),
        )
        captureError(app)

        // `page` is absent and would fail if the query schema still ran.
        await request(app).get('/').expect(400)

        const res = await request(app).get('/').set('x-trace', 't').expect(200)
        expect(res.body).toEqual({ query: {}, trace: 't' })
    })
})

describe('schema validation through Router', () => {
    it('rejects a request that fails a declared schema', async () => {
        const app = appOf(
            new Router()
                .get('/x', { query: z.object({ id: z.string() }) }, () => ({
                    ok: true,
                }))
                .use(onInvalid),
        )

        await request(app).get('/x?id=1').expect(200)
        await request(app).get('/x').expect(400)
    })

    it('leaves the parsed value on the request', async () => {
        const app = appOf(
            new Router().get(
                '/x',
                { query: z.object({ id: z.string() }) },
                (req) => req.query,
            ),
        )

        const res = await request(app).get('/x?id=1&extra=2').expect(200)
        // Only holds because the parsed value is written back to `req`.
        expect(res.body).toEqual({ id: '1' })
    })

    it('validates the params of a route', async () => {
        const app = appOf(
            new Router()
                .get(
                    '/items/:id',
                    { params: z.object({ id: z.coerce.number() }) },
                    (req) => ({ id: req.params.id }),
                )
                .use(onInvalid),
        )

        const res = await request(app).get('/items/7').expect(200)
        expect(res.body).toEqual({ id: 7 })
        await request(app).get('/items/seven').expect(400)
    })

    it('skips a schema marked meta.skip', async () => {
        const app = appOf(
            new Router()
                .get(
                    '/x',
                    {
                        query: z
                            .object({ id: z.string() })
                            .meta({ skip: true }),
                    },
                    () => ({ ok: true }),
                )
                .use(onInvalid),
        )

        // `id` is absent, so the request would be rejected if the schema ran.
        await request(app).get('/x').expect(200)
    })

    it('skips only the schema marked meta.skip', async () => {
        const app = appOf(
            new Router()
                .get(
                    '/x/:id',
                    {
                        params: z.object({ id: z.string().regex(/^\d+$/) }),
                        query: z
                            .object({ page: z.string() })
                            .meta({ skip: true }),
                    },
                    () => ({ ok: true }),
                )
                .use(onInvalid),
        )

        // `page` is absent and would fail if the query schema still ran.
        await request(app).get('/x/1').expect(200)
        await request(app).get('/x/abc').expect(400)
    })

    it('validates the options given to use', async () => {
        const app = appOf(
            new Router()
                .use(
                    { headers: z.object({ 'x-token': z.string() }) },
                    (_req, _res, next) => next(),
                )
                .get('/', () => ({ ok: true }))
                .use(onInvalid),
        )

        await request(app).get('/').expect(400)
        await request(app).get('/').set('x-token', 't').expect(200)
    })

    it('validates routes registered after a skipped one', async () => {
        const app = appOf(
            new Router({ prefix: '/api' })
                .get(
                    '/open',
                    { query: z.object({}).meta({ skip: true }) },
                    () => ({ from: 'open' }),
                )
                .get(
                    '/closed',
                    { query: z.object({ id: z.string() }) },
                    () => ({ from: 'closed' }),
                )
                .use(onInvalid),
        )

        await request(app).get('/api/open').expect(200)
        await request(app).get('/api/closed?id=1').expect(200)
        await request(app).get('/api/closed').expect(400)
    })
})
