import request from 'supertest'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { Application } from '../src'
import { getHost } from './util'

describe('sse', () => {
    test('sets SSE headers and streams events from an async iterable', async () => {
        const app = new Application().get(
            '/events',
            {
                responses: {
                    200: z.object({ message: z.string() }),
                },
            },
            (_req, res) => {
                res.sse(
                    (async function* () {
                        yield { data: { message: 'hello' } }
                        yield { data: { message: 'world' } }
                    })(),
                )
            },
        )

        const res = await request(getHost(app))
            .get('/events')
            .expect(200)
            .expect('Content-Type', /text\/event-stream/)
            .expect('Cache-Control', 'no-cache, no-transform')

        expect(res.text).toBe(
            'data: {"message":"hello"}\n\ndata: {"message":"world"}\n\n',
        )
    })

    test('streams plain chunk values', async () => {
        const app = new Application().get('/events', (_req, res) => {
            res.sse([
                'line1\nline2',
                { message: 'object' },
                { data: 'wrapper' },
            ])
        })

        const res = await request(getHost(app)).get('/events').expect(200)

        expect(res.text).toBe(
            'data: line1\ndata: line2\n\ndata: {"message":"object"}\n\ndata: wrapper\n\n',
        )
    })

    test('emits the optional event name', async () => {
        const app = new Application().get('/events', (_req, res) => {
            res.sse([
                { event: 'ping', data: { message: 'hi' } },
                { data: 'plain' },
            ])
        })

        const res = await request(getHost(app)).get('/events').expect(200)

        expect(res.text).toBe(
            'event: ping\ndata: {"message":"hi"}\n\ndata: plain\n\n',
        )
    })

    test('accepts a single plain value as one event', async () => {
        const app = new Application().get('/events', (_req, res) => {
            res.sse({ event: 'ping', data: { message: 'single' } })
        })

        const res = await request(getHost(app)).get('/events').expect(200)

        expect(res.text).toBe('event: ping\ndata: {"message":"single"}\n\n')
    })

    test('does not cancel when the server ends the response itself', async () => {
        let cancelled = false
        const app = new Application().get('/events', (_req, res) => {
            res.sse({
                async *[Symbol.asyncIterator]() {
                    yield { data: { message: 'first' } }
                    await new Promise(() => {})
                },
            }).onCancel(() => {
                cancelled = true
            })
            setTimeout(() => res.end(), 50)
        })

        const res = await request(getHost(app)).get('/events').expect(200)
        expect(res.text).toBe('data: {"message":"first"}\n\n')
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(cancelled).toBe(false)
    })

    test('triggers onCancel with a reason when the client disconnects', async () => {
        let reason: unknown
        let streaming = false
        const app = new Application().get('/events', (_req, res) => {
            res.sse({
                async *[Symbol.asyncIterator]() {
                    yield { data: { message: 'first' } }
                    await new Promise(() => {})
                },
            }).onCancel((value) => {
                reason = value
            })
            streaming = true
        })

        const req = request(getHost(app)).get('/events')
        const settled = req.then(
            () => Promise.reject(new Error('expected the request to abort')),
            (error) => error,
        )
        await vi.waitFor(() => expect(streaming).toBe(true))
        req.abort()
        await vi.waitFor(() => expect(reason).toBeDefined())
        await expect(settled).resolves.toBeDefined()
    })

    test('constrains the sse parameter to a stream of responses[200]', () => {
        new Application().get(
            '/events',
            {
                responses: {
                    200: z.object({ message: z.string() }),
                },
            },
            (_req, res) => {
                res.sse([{ message: 'hello' }])
                res.sse([{ event: 'update', data: { message: 'hello' } }])
                res.sse({ message: 'single' })
                res.sse({ event: 'single', data: { message: 'hello' } })
                res.sse(
                    // @ts-expect-error plain chunk must match responses[200]
                    (async function* () {
                        yield { nope: true }
                    })(),
                )
                res.sse(
                    // @ts-expect-error single value must match responses[200]
                    { nope: true },
                )
                res.sse(
                    // @ts-expect-error chunk data must match responses[200]
                    (async function* () {
                        yield { data: { nope: true } }
                    })(),
                )
            },
        )
    })
})
