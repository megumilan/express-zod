import { Readable } from 'node:stream'
import express, { type ErrorRequestHandler, type Express } from 'express'
import request from 'supertest'
import { type IToResponseOptions, toResponse } from '../src/response'
import type { RequestHandler } from '../src/types/handler'

/** A one-route app, so each case exercises `toResponse` in isolation. */
function appOf(
    handler: RequestHandler,
    errorHandler?: ErrorRequestHandler,
    options?: IToResponseOptions,
) {
    const app: Express = express()
    app.get('/', toResponse(handler, options))
    if (errorHandler) {
        app.use(errorHandler)
    }
    return app
}

/** Two routes, the first wrapped by `toResponse`, the second a plain handler. */
function chainOf(handler: RequestHandler, options?: IToResponseOptions) {
    const app: Express = express()
    app.get('/', toResponse(handler, options))
    app.get('/', (_req, res) => {
        res.json({ from: 'second' })
    })
    return app
}

describe('toResponse', () => {
    it('serialises an object as JSON', async () => {
        const res = await request(appOf(() => ({ id: 1 })))
            .get('/')
            .expect(200)
        expect(res.headers['content-type']).toContain('application/json')
        expect(res.body).toEqual({ id: 1 })
    })

    it('serialises an array as JSON', async () => {
        const res = await request(appOf(() => [1, 2]))
            .get('/')
            .expect(200)
        expect(res.body).toEqual([1, 2])
    })

    it('serialises a string as a JSON string, not as HTML', async () => {
        const res = await request(appOf(() => 'hi'))
            .get('/')
            .expect(200)
        expect(res.headers['content-type']).toContain('application/json')
        expect(res.text).toBe('"hi"')
    })

    it('serialises a number as JSON, never as a status code', async () => {
        const res = await request(appOf(() => 42))
            .get('/')
            .expect(200)
        expect(res.text).toBe('42')
    })

    it('awaits a promise', async () => {
        const res = await request(appOf(async () => ({ ok: true })))
            .get('/')
            .expect(200)
        expect(res.body).toEqual({ ok: true })
    })

    it('answers null with 204 and no body', async () => {
        const res = await request(appOf(() => null))
            .get('/')
            .expect(204)
        expect(res.text).toBe('')
    })

    it('falls through to the rest of the chain on undefined', async () => {
        await request(appOf(() => undefined))
            .get('/')
            .expect(404)
    })

    it('falls through to the next handler on undefined', async () => {
        const res = await request(chainOf(() => undefined))
            .get('/')
            .expect(200)
        expect(res.body).toEqual({ from: 'second' })
    })

    it('still answers with a returned value when autoNext is off', async () => {
        const res = await request(
            chainOf(() => ({ ok: true }), { autoNext: false }),
        )
            .get('/')
            .expect(200)
        expect(res.body).toEqual({ ok: true })
    })

    it('leaves the chain to the handler when autoNext is off', async () => {
        const app = chainOf(
            (_req, _res, next) => {
                next()
            },
            { autoNext: false },
        )

        const res = await request(app).get('/').expect(200)
        expect(res.body).toEqual({ from: 'second' })
    })

    it('does not advance the chain while an autoNext-off handler is busy', async () => {
        const order: string[] = []
        const app = chainOf(
            async () => {
                order.push('start')
                await new Promise((resolve) => setTimeout(resolve, 20))
                order.push('end')
                return { from: 'slow' }
            },
            { autoNext: false },
        )

        const res = await request(app).get('/').expect(200)
        expect(res.body).toEqual({ from: 'slow' })
        // The second handler never ran: `undefined` is not our cue to move on.
        expect(order).toEqual(['start', 'end'])
    })

    it('keeps a status code the handler set before returning', async () => {
        const res = await request(
            appOf((_req, res) => {
                res.status(201)
                return { created: true }
            }),
        )
            .get('/')
            .expect(201)
        expect(res.body).toEqual({ created: true })
    })

    it('keeps headers the handler set before returning', async () => {
        const res = await request(
            appOf((_req, res) => {
                res.set('x-trace', 'abc')
                return { ok: true }
            }),
        )
            .get('/')
            .expect(200)
        expect(res.headers['x-trace']).toBe('abc')
    })

    it('ignores the return value when the handler responds itself', async () => {
        const res = await request(
            appOf((_req, res) => {
                res.json({ sent: 'by handler' })
                return { ignored: true }
            }),
        )
            .get('/')
            .expect(200)
        expect(res.body).toEqual({ sent: 'by handler' })
    })

    it('ignores the return value when the handler only ends the response', async () => {
        const res = await request(
            appOf((_req, res) => {
                res.status(202).end()
                return { ignored: true }
            }),
        )
            .get('/')
            .expect(202)
        expect(res.text).toBe('')
    })

    it('forwards a thrown error to error middleware', async () => {
        const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
            res.status(500).json({ message: (error as Error).message })
        }
        const res = await request(
            appOf(() => {
                throw new Error('boom')
            }, errorHandler),
        )
            .get('/')
            .expect(500)
        expect(res.body).toEqual({ message: 'boom' })
    })

    it('forwards a rejected promise to error middleware', async () => {
        const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
            res.status(500).json({ message: (error as Error).message })
        }
        const res = await request(
            appOf(async () => {
                throw new Error('async boom')
            }, errorHandler),
        )
            .get('/')
            .expect(500)
        expect(res.body).toEqual({ message: 'async boom' })
    })

    it('copies status, headers and body from a Response', async () => {
        const res = await request(
            appOf(
                () =>
                    new Response(JSON.stringify({ ok: true }), {
                        status: 201,
                        headers: { 'content-type': 'application/json' },
                    }),
            ),
        )
            .get('/')
            .expect(201)
        expect(res.headers['content-type']).toContain('application/json')
        expect(res.body).toEqual({ ok: true })
    })

    it('copies every set-cookie header of a Response', async () => {
        const response = new Response(null)
        response.headers.append('set-cookie', 'a=1')
        response.headers.append('set-cookie', 'b=2')
        const res = await request(appOf(() => response))
            .get('/')
            .expect(200)
        expect(res.headers['set-cookie']).toEqual(['a=1', 'b=2'])
    })

    it('pipes a Node stream', async () => {
        const res = await request(appOf(() => Readable.from(['hello'])))
            .get('/')
            .expect(200)
        expect(res.headers['content-type']).toContain(
            'application/octet-stream',
        )
        expect(res.body.toString()).toBe('hello')
    })

    it('keeps a content type set for a stream', async () => {
        const res = await request(
            appOf((_req, res) => {
                res.type('text/plain')
                return Readable.from(['hello'])
            }),
        )
            .get('/')
            .expect(200)
        expect(res.headers['content-type']).toContain('text/plain')
        expect(res.text).toBe('hello')
    })

    it('sends a Buffer as bytes', async () => {
        const res = await request(appOf(() => Buffer.from('bytes')))
            .get('/')
            .expect(200)
        expect(res.body.toString()).toBe('bytes')
    })

    it('streams an async iterable', async () => {
        async function* chunks() {
            yield 'one'
            yield 'two'
        }
        const res = await request(appOf(() => chunks()))
            .get('/')
            .expect(200)
        expect(res.body.toString()).toBe('onetwo')
    })

    it('keeps a status code set before returning null', async () => {
        const res = await request(
            appOf((_req, res) => {
                res.status(201)
                return null
            }),
        )
            .get('/')
            .expect(201)
        expect(res.text).toBe('')
    })

    it('drops encoding headers of a Response, whose body fetch already decoded', async () => {
        const res = await request(
            appOf(
                () =>
                    new Response('{"a":1}', {
                        headers: {
                            'content-encoding': 'gzip',
                            'content-length': '27',
                        },
                    }),
            ),
        )
            .get('/')
            .expect(200)
        expect(res.headers['content-encoding']).toBeUndefined()
        expect(res.headers['content-length']).toBeUndefined()
        expect(res.text).toBe('{"a":1}')
    })

    it('replaces a content type the handler set, rather than joining it', async () => {
        const res = await request(
            appOf((_req, res) => {
                res.type('text/plain')
                return new Response('{}', {
                    headers: { 'content-type': 'application/json' },
                })
            }),
        )
            .get('/')
            .expect(200)
        expect(res.headers['content-type']).toBe('application/json')
    })

    it('forwards an unserialisable return value to error middleware', async () => {
        const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
            res.status(500).json({ message: (error as Error).message })
        }
        const res = await request(appOf(() => () => {}, errorHandler))
            .get('/')
            .expect(500)
        expect(res.body).toEqual({ message: 'Cannot respond with a function' })
    })
})
