import { once } from 'node:events'
import express, {
    type ErrorRequestHandler,
    type Express,
    type RequestHandler,
} from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Application, Router } from '../src'
import { getHost } from './util'

function zodErrorHandler(): ErrorRequestHandler {
    return (error, _req, res, next) => {
        if (error instanceof z.ZodError) {
            res.status(400).json({ issues: error.issues })
            return
        }
        next(error)
    }
}

const cookieParser: RequestHandler = (req, _res, next) => {
    const cookies: Record<string, string> = {}
    for (const part of (req.headers.cookie ?? '').split(';')) {
        const [key, ...rest] = part.trim().split('=')
        if (key) {
            cookies[key] = rest.join('=')
        }
    }
    ;(req as unknown as { cookies: Record<string, string> }).cookies = cookies
    next()
}

describe('Application', () => {
    it('serves a route declared with a responses schema', async () => {
        const app = new Application().get(
            '/',
            {
                responses: {
                    200: z.object({ ok: z.boolean() }),
                },
            },
            (_req, res) => {
                res.json({ ok: true })
            },
        )

        await request(getHost(app)).get('/').expect(200, { ok: true })
    })

    it('serves all http methods', async () => {
        const app = new Application()
            .get('/r', (_req, res) => res.json({ method: 'get' }))
            .post('/r', (_req, res) => res.json({ method: 'post' }))
            .put('/r', (_req, res) => res.json({ method: 'put' }))
            .patch('/r', (_req, res) => res.json({ method: 'patch' }))
            .delete('/r', (_req, res) => res.json({ method: 'delete' }))
            .options('/r', (_req, res) => res.json({ method: 'options' }))
            .head('/r', (_req, res) => res.end())

        const client = request(getHost(app))
        for (const method of [
            'get',
            'post',
            'put',
            'patch',
            'delete',
            'options',
        ] as const) {
            const res = await client[method]('/r')
            expect(res.status).toBe(200)
            expect(res.body).toEqual({ method })
        }
        const head = await client.head('/r')
        expect(head.status).toBe(200)
    })

    it('runs app middleware before route handlers and route handlers in order', async () => {
        const order: string[] = []
        const app = new Application()
            .use((_req, _res, next) => {
                order.push('app')
                next()
            })
            .get(
                '/',
                (_req, _res, next) => {
                    order.push('first')
                    next()
                },
                (_req, res) => {
                    order.push('second')
                    res.json({ ok: true })
                },
            )

        await request(getHost(app)).get('/').expect(200, { ok: true })
        expect(order).toEqual(['app', 'first', 'second'])
    })

    it('validates the json body', async () => {
        const app = new Application()
            .use(express.json())
            .post(
                '/users',
                { body: z.object({ name: z.string().min(1) }) },
                (req, res) => {
                    res.json({ received: req.body.name })
                },
            )
            .use(zodErrorHandler())

        const client = request(getHost(app))
        await client.post('/users').send({ name: 'ada' }).expect(200, {
            received: 'ada',
        })
        await client.post('/users').send({ name: 123 }).expect(400)
        await client.post('/users').send({}).expect(400)
    })

    it('validates the query string', async () => {
        const app = new Application()
            .get(
                '/search',
                { query: z.object({ q: z.string().min(1) }) },
                (req, res) => {
                    res.json({ q: req.query.q })
                },
            )
            .use(zodErrorHandler())

        const client = request(getHost(app))
        await client.get('/search').query({ q: 'x' }).expect(200, { q: 'x' })
        await client.get('/search').query({ q: '' }).expect(400)
        await client.get('/search').expect(400)
    })

    it('validates path params', async () => {
        const app = new Application()
            .get(
                '/users/:id',
                {
                    params: z.object({
                        id: z.coerce.number().int().positive(),
                    }),
                },
                (req, res) => {
                    res.json({ id: req.params.id })
                },
            )
            .use(zodErrorHandler())

        const client = request(getHost(app))
        await client.get('/users/42').expect(200, { id: '42' })
        await client.get('/users/abc').expect(400)
        await client.get('/users/0').expect(400)
    })

    it('validates request headers', async () => {
        const app = new Application()
            .get(
                '/secure',
                { headers: z.object({ 'x-api-key': z.string().min(1) }) },
                (req, res) => {
                    res.json({ key: req.headers['x-api-key'] })
                },
            )
            .use(zodErrorHandler())

        const client = request(getHost(app))
        await client.get('/secure').set('x-api-key', 'secret').expect(200, {
            key: 'secret',
        })
        await client.get('/secure').expect(400)
    })

    it('validates cookies', async () => {
        const app = new Application()
            .use(cookieParser)
            .get(
                '/session',
                { cookies: z.object({ session: z.string().min(1) }) },
                (req, res) => {
                    res.json({ session: req.cookies.session })
                },
            )
            .use(zodErrorHandler())

        const client = request(getHost(app))
        await client.get('/session').set('Cookie', 'session=abc').expect(200, {
            session: 'abc',
        })
        await client.get('/session').expect(400)
    })

    it('does not validate the responses schema at runtime', async () => {
        const app = new Application().get(
            '/loose',
            {
                responses: {
                    200: z.object({ id: z.number() }),
                },
            },
            (_req, res) => {
                res.json({ id: 'not a number' })
            },
        )

        await request(getHost(app)).get('/loose').expect(200, {
            id: 'not a number',
        })
    })

    it('passes thrown route errors to the error middleware', async () => {
        const app = new Application()
            .get('/boom', () => {
                throw new Error('boom')
            })
            .use((error: unknown, _req, res, _next) => {
                res.status(500).json({
                    message:
                        error instanceof Error ? error.message : String(error),
                })
            })

        const res = await request(getHost(app)).get('/boom').expect(500)
        expect(res.body).toEqual({ message: 'boom' })
    })

    it('serves routes under the application prefix', async () => {
        const app = new Application({ prefix: '/api' }).get(
            '/health',
            (_req, res) => res.json({ ok: true }),
        )

        await request(getHost(app)).get('/api/health').expect(200, { ok: true })
        await request(getHost(app)).get('/health').expect(404)
    })

    it('serves routes from mounted routers with combined prefixes', async () => {
        const users = new Router({ prefix: '/users' }).get(
            '/:id',
            { params: z.object({ id: z.string() }) },
            (req, res) => {
                res.json({ id: req.params.id })
            },
        )
        const app = new Application({ prefix: '/api' }).use(users)

        expect(app.routes.map((route) => route.fullPath)).toEqual([
            '/api/users/:id',
        ])
        await request(getHost(app)).get('/api/users/42').expect(200, {
            id: '42',
        })
    })

    it('installs plugins and serves routes they register', async () => {
        let receivedInstance: unknown
        let receivedRaw: unknown
        const plugin = {
            name: 'health',
            install: ({
                raw,
                instance,
            }: {
                raw: unknown
                instance: unknown
            }) => {
                receivedRaw = raw
                receivedInstance = instance
                ;(raw as Express['get']).get('/health', (_req, res) => {
                    res.json({ status: 'ok' })
                })
            },
        }
        const app = new Application().use(plugin)

        expect(receivedInstance).toBe(app)
        expect(receivedRaw).toBe(getHost(app))
        await request(getHost(app)).get('/health').expect(200, { status: 'ok' })
        expect(app.routes.map((route) => route.path)).toContain('/health')
    })

    it('listens on a random port', async () => {
        const app = new Application().get('/', (_req, res) => {
            res.json({ ping: 'pong' })
        })

        const server = app.listen(0)
        await once(server, 'listening')

        try {
            const res = await request(server).get('/')
            expect(res.status).toBe(200)
            expect(res.body).toEqual({ ping: 'pong' })
        } finally {
            server.close()
        }
    })
})
