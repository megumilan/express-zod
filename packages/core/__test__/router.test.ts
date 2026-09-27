import { once } from 'node:events'
import {
    request as httpRequest,
    type IncomingMessage,
    type Server,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import express, { type ErrorRequestHandler, type Express } from 'express'
import request from 'supertest'
import { z } from 'zod'
import { Router } from '../src/router'

/**
 * The mounted Express app — the object `listen` binds to. Tests go through it
 * rather than `listen` so they exercise mounting without opening a socket.
 */
const appOf = (router: { '~mount': () => Express }) => router['~mount']()

/** Sends a request whose verb supertest has no helper for. */
async function sendRaw(server: Server, method: string, path: string) {
    const { port } = server.address() as AddressInfo
    const req = httpRequest({ host: '127.0.0.1', port, method, path })
    req.end()
    const [res] = (await once(req, 'response')) as [IncomingMessage]
    const chunks: Buffer[] = []
    for await (const chunk of res) {
        chunks.push(chunk as Buffer)
    }
    return { status: res.statusCode, body: Buffer.concat(chunks).toString() }
}

describe('Router', () => {
    describe('registration', () => {
        it('returns the router from every verb, so calls chain', () => {
            const router = new Router()

            expect(router.get('/a', () => null)).toBe(router)
            expect(router.post('/a', () => null)).toBe(router)
            expect(router.put('/a', () => null)).toBe(router)
            expect(router.patch('/a', () => null)).toBe(router)
            expect(router.delete('/a', () => null)).toBe(router)
            expect(router.head('/a', () => null)).toBe(router)
            expect(router.options('/a', () => null)).toBe(router)
            expect(router.all('/a', () => null)).toBe(router)
            expect(router.query('/a', () => null)).toBe(router)
        })

        it('registers several handlers for the same route', async () => {
            const seen: string[] = []
            const app = appOf(
                new Router().get(
                    '/x',
                    () => {
                        seen.push('first')
                        return undefined
                    },
                    () => {
                        seen.push('second')
                        return { from: 'second' }
                    },
                ),
            )

            const res = await request(app).get('/x').expect(200)
            expect(res.body).toEqual({ from: 'second' })
            expect(seen).toEqual(['first', 'second'])
        })

        it('stops at the first handler that answers', async () => {
            const seen: string[] = []
            const app = appOf(
                new Router().get(
                    '/x',
                    () => {
                        seen.push('first')
                        return { from: 'first' }
                    },
                    () => {
                        seen.push('second')
                        return { from: 'second' }
                    },
                ),
            )

            const res = await request(app).get('/x').expect(200)
            expect(res.body).toEqual({ from: 'first' })
            expect(seen).toEqual(['first'])
        })
    })

    describe('handler return values', () => {
        it('answers with the value the handler returns', async () => {
            const router = new Router().get('/health', () => ({ ok: true }))
            const res = await request(appOf(router)).get('/health').expect(200)
            expect(res.body).toEqual({ ok: true })
        })

        it('answers 404 when the handler returns undefined', async () => {
            const router = new Router().get('/silent', () => undefined)
            await request(appOf(router)).get('/silent').expect(404)
        })

        it('answers 204 when the handler returns null', async () => {
            const router = new Router().get('/nothing', () => null)
            const res = await request(appOf(router)).get('/nothing').expect(204)
            expect(res.text).toBe('')
        })

        it('keeps a status the handler set itself', async () => {
            const router = new Router().get('/made', (_req, res) => {
                res.status(201)
                return { created: true }
            })

            const res = await request(appOf(router)).get('/made').expect(201)
            expect(res.body).toEqual({ created: true })
        })
    })

    describe('HTTP methods', () => {
        it('routes each verb to its own handler', async () => {
            const app = appOf(
                new Router()
                    .post('/r', () => ({ method: 'post' }))
                    .put('/r', () => ({ method: 'put' }))
                    .patch('/r', () => ({ method: 'patch' }))
                    .delete('/r', () => ({ method: 'delete' })),
            )

            const posted = await request(app).post('/r').expect(200)
            const putted = await request(app).put('/r').expect(200)
            const patched = await request(app).patch('/r').expect(200)
            const deleted = await request(app).delete('/r').expect(200)

            expect(posted.body).toEqual({ method: 'post' })
            expect(putted.body).toEqual({ method: 'put' })
            expect(patched.body).toEqual({ method: 'patch' })
            expect(deleted.body).toEqual({ method: 'delete' })
        })

        it('answers HEAD with the headers but no body', async () => {
            const app = appOf(new Router().head('/h', () => ({ ok: true })))
            const res = await request(app).head('/h').expect(200)

            // Express serialises the body — hence the length — but sends none of it.
            expect(res.headers['content-type']).toContain('application/json')
            expect(res.headers['content-length']).toBe('11')
            expect(res.text).toBeFalsy()
        })

        it('answers OPTIONS with the registered handler', async () => {
            const app = appOf(new Router().options('/o', () => ({ ok: true })))
            const res = await request(app).options('/o').expect(200)
            expect(res.body).toEqual({ ok: true })
        })

        it('matches any verb through all', async () => {
            const app = appOf(new Router().all('/a', () => ({ ok: true })))

            await request(app).get('/a').expect(200)
            await request(app).post('/a').expect(200)
            await request(app).delete('/a').expect(200)
        })

        it('handles the QUERY verb', async () => {
            const server = new Router()
                .query('/q', () => ({ ok: true }))
                .listen(0)
            try {
                await expect(sendRaw(server, 'QUERY', '/q')).resolves.toEqual({
                    status: 200,
                    body: '{"ok":true}',
                })
            } finally {
                server.close()
            }
        })
    })

    describe('prefixes', () => {
        it('mounts every route under its prefix', async () => {
            const router = new Router({ prefix: '/api' }).get(
                '/health',
                () => ({
                    ok: true,
                }),
            )
            const app = appOf(router)

            await request(app).get('/api/health').expect(200)
            await request(app).get('/health').expect(404)
        })

        it('composes prefixes through nested routers', async () => {
            const leaf = new Router({ prefix: '/leaf' }).get('/x', () => ({
                from: 'leaf',
            }))
            const mid = new Router({ prefix: '/mid' }).use(leaf)
            const top = new Router({ prefix: '/top' }).use(mid)
            const app = appOf(top)

            await request(app).get('/top/mid/leaf/x').expect(200)
            await request(app).get('/mid/leaf/x').expect(404)
            await request(app).get('/top/mid/x').expect(404)
        })

        it('mounts a child router under an extra prefix', async () => {
            const users = new Router({ prefix: '/users' }).get(
                '/:id',
                { params: z.object({ id: z.string() }) },
                (req) => ({ id: req.params.id }),
            )
            const app = appOf(new Router({ prefix: '/api' }).use('/v2', users))

            const res = await request(app).get('/api/v2/users/7').expect(200)
            expect(res.body).toEqual({ id: '7' })
        })

        it('reuses one router under several prefixes', async () => {
            const thing = new Router().get('/x', () => ({ ok: true }))
            const app = appOf(
                new Router()
                    .use(new Router({ prefix: '/a' }).use(thing))
                    .use(new Router({ prefix: '/b' }).use(thing)),
            )

            await request(app).get('/a/x').expect(200)
            await request(app).get('/b/x').expect(200)
        })
    })

    describe('middleware', () => {
        it('runs middleware before the route', async () => {
            const seen: string[] = []
            const app = appOf(
                new Router()
                    .use((_req, _res, next) => {
                        seen.push('middleware')
                        next()
                    })
                    .get('/', () => {
                        seen.push('handler')
                        return { ok: true }
                    }),
            )

            await request(app).get('/').expect(200)
            expect(seen).toEqual(['middleware', 'handler'])
        })

        it('runs middleware in registration order', async () => {
            const seen: number[] = []
            const app = appOf(
                new Router()
                    .use((_req, _res, next) => {
                        seen.push(1)
                        next()
                    })
                    .use((_req, _res, next) => {
                        seen.push(2)
                        next()
                    })
                    .get('/', () => ({ ok: true })),
            )

            await request(app).get('/').expect(200)
            expect(seen).toEqual([1, 2])
        })

        it('hands the express request to the middleware', async () => {
            const seen: string[] = []
            const app = appOf(
                new Router()
                    .use((req, _res, next) => {
                        seen.push(req.path)
                        next()
                    })
                    .get('/x', () => ({ ok: true })),
            )

            await request(app).get('/x').expect(200)
            expect(seen).toEqual(['/x'])
        })

        it('lets middleware short-circuit by returning a value', async () => {
            const app = appOf(
                new Router()
                    .use(() => ({ blocked: true }))
                    .get('/', () => ({ ok: true })),
            )

            const res = await request(app).get('/').expect(200)
            expect(res.body).toEqual({ blocked: true })
        })

        it('ignores a value returned after the handler advanced the chain', async () => {
            const app = appOf(
                new Router()
                    .use((_req, _res, next) => {
                        next()
                        return { ignored: true }
                    })
                    .get('/', () => ({ ok: true })),
            )

            const res = await request(app).get('/').expect(200)
            expect(res.body).toEqual({ ok: true })
        })

        it('does not advance the chain twice when middleware calls next', async () => {
            const log: string[] = []
            const app = appOf(
                new Router()
                    .use((_req, _res, next) => {
                        next()
                    })
                    .get('/x', async () => {
                        log.push('slow:start')
                        await new Promise((resolve) => setTimeout(resolve, 50))
                        log.push('slow:end')
                        return { from: 'slow' }
                    })
                    .get('/x', () => {
                        log.push('second')
                        return { from: 'second' }
                    }),
            )

            const res = await request(app).get('/x').expect(200)
            expect(res.body).toEqual({ from: 'slow' })
            expect(log).toEqual(['slow:start', 'slow:end'])
        })

        it('runs middleware that answers the request itself', async () => {
            const app = appOf(
                new Router()
                    .use((_req, res, next) => {
                        res.status(204).end()
                        next()
                    })
                    .get('/', () => ({ ok: true })),
            )

            const res = await request(app).get('/').expect(204)
            expect(res.text).toBe('')
        })

        it('runs express middleware that parses the body', async () => {
            const app = appOf(
                new Router()
                    .use(express.json())
                    .post(
                        '/echo',
                        { body: z.object({ name: z.string() }) },
                        (req) => ({ name: req.body.name }),
                    ),
            )

            const res = await request(app)
                .post('/echo')
                .send({ name: 'ada' })
                .expect(200)
            expect(res.body).toEqual({ name: 'ada' })
        })
    })

    describe('errors', () => {
        const onError: ErrorRequestHandler = (error, _req, res, _next) => {
            res.status(500).json({ message: (error as Error).message })
        }

        it('runs an error handler registered with use', async () => {
            const app = appOf(
                new Router()
                    .get('/boom', () => {
                        throw new Error('boom')
                    })
                    .use(onError),
            )

            const res = await request(app).get('/boom').expect(500)
            expect(res.body).toEqual({ message: 'boom' })
        })

        it("runs an error handler registered with use<'error'>", async () => {
            // `error` is typed by the generic, so no annotation here on purpose.
            const app = appOf(
                new Router()
                    .get('/boom', () => {
                        throw new Error('boom')
                    })
                    .use<'error'>((error, _req, res, _next) => {
                        res.status(500).json({ message: error.message })
                    }),
            )

            const res = await request(app).get('/boom').expect(500)
            expect(res.body).toEqual({ message: 'boom' })
        })

        it('forwards next(error) from a handler', async () => {
            const app = appOf(
                new Router()
                    .get('/x', (_req, _res, next) => {
                        next(new Error('nope'))
                    })
                    .use(onError),
            )

            const res = await request(app).get('/x').expect(500)
            expect(res.body).toEqual({ message: 'nope' })
        })

        it('forwards a thrown error from middleware', async () => {
            const app = appOf(
                new Router()
                    .use(() => {
                        throw new Error('middleware boom')
                    })
                    .get('/', () => ({ ok: true }))
                    .use(onError),
            )

            const res = await request(app).get('/').expect(500)
            expect(res.body).toEqual({ message: 'middleware boom' })
        })

        it('stops at the first error handler that answers', async () => {
            const seen: string[] = []
            const first: ErrorRequestHandler = (_error, _req, res, _next) => {
                seen.push('first')
                res.status(500).json({ from: 'first' })
            }
            const second: ErrorRequestHandler = (_error, _req, res, _next) => {
                seen.push('second')
                res.status(500).json({ from: 'second' })
            }
            const app = appOf(
                new Router()
                    .get('/boom', () => {
                        throw new Error('boom')
                    })
                    .use(first)
                    .use(second),
            )

            const res = await request(app).get('/boom').expect(500)
            expect(res.body).toEqual({ from: 'first' })
            expect(seen).toEqual(['first'])
        })
    })

    describe('route metadata', () => {
        it('records the full path and the options of a route', () => {
            const query = z.object({ page: z.string() })
            const router = new Router()
                .get('/items', { query }, () => null)
                .post('/items', () => null)

            expect(router['~routes'].map((route) => route['~path'])).toEqual([
                '/items',
                '/items',
            ])
            expect(router['~routes'][0]['~options']).toEqual({ query })
            expect(router['~routes'][1]['~options']).toEqual({})
        })

        it('records the router prefix on the route path', () => {
            const router = new Router({ prefix: '/api' }).get(
                '/items/:id',
                () => null,
            )

            expect(router['~routes'].map((route) => route['~path'])).toEqual([
                '/api/items/:id',
            ])
        })

        it('records child routes under their mount path', () => {
            const child = new Router({ prefix: '/users' }).get(
                '/:id',
                () => null,
            )

            const parent = new Router({ prefix: '/api' }).use(child)
            expect(parent['~routes'].map((route) => route['~path'])).toEqual([
                '/api/users/:id',
            ])
        })

        it('records the extra prefix passed to use', () => {
            const child = new Router({ prefix: '/users' }).get(
                '/:id',
                () => null,
            )

            const parent = new Router({ prefix: '/api' }).use('/v2', child)
            expect(parent['~routes'].map((route) => route['~path'])).toEqual([
                '/api/v2/users/:id',
            ])
        })

        it('joins path segments without doubling their slashes', () => {
            const pathsOf = (router: Router) =>
                router['~routes'].map((route) => route['~path'])

            expect(pathsOf(new Router().get('/x', () => null))).toEqual(['/x'])
            expect(
                pathsOf(new Router({ prefix: '/api' }).get('/', () => null)),
            ).toEqual(['/api'])
            expect(
                pathsOf(new Router({ prefix: '/api/' }).get('/x', () => null)),
            ).toEqual(['/api/x'])
            expect(
                pathsOf(
                    new Router({ prefix: '/api/' }).use(
                        '/v2/',
                        new Router({ prefix: '/users/' }).get('/x', () => null),
                    ),
                ),
            ).toEqual(['/api/v2/users/x'])
        })
    })

    describe('construction', () => {
        it('defaults to no name and no prefix', () => {
            const router = new Router()
            expect(router['~name']).toBeUndefined()
            expect(router['~prefix']).toBe('')
        })

        it('keeps the name and the prefix it was given', () => {
            const router = new Router({ prefix: '/api', name: 'api' })
            expect(router['~name']).toBe('api')
            expect(router['~prefix']).toBe('/api')
        })

        it('mounts once, however often it is asked to', () => {
            const router = new Router()
            expect(router['~mounted']).toBe(false)

            const app = appOf(router)
            expect(appOf(router)).toBe(app)
            expect(router['~mounted']).toBe(true)
        })
    })

    describe('listen', () => {
        it('serves over a real socket', async () => {
            const router = new Router().get('/health', () => ({ ok: true }))
            const server = router.listen(0)
            try {
                const { port } = server.address() as AddressInfo
                await request(`http://127.0.0.1:${port}`)
                    .get('/health')
                    .expect(200)
            } finally {
                server.close()
            }
        })

        it('serves under the router prefix', async () => {
            const router = new Router({ prefix: '/api' }).get(
                '/health',
                () => ({
                    ok: true,
                }),
            )
            const server = router.listen(0)
            try {
                const { port } = server.address() as AddressInfo
                await request(`http://127.0.0.1:${port}`)
                    .get('/api/health')
                    .expect(200)
                await request(`http://127.0.0.1:${port}`)
                    .get('/health')
                    .expect(404)
            } finally {
                server.close()
            }
        })
    })
})
