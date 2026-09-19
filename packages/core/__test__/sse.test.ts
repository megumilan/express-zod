import request from 'supertest'
import { describe, expect, test } from 'vitest'
import { Application } from '../src'
import { getHost } from './util'

describe('sse routes', () => {
    test('sets SSE headers and flushes the response when sse: true', async () => {
        const app = new Application().get(
            '/events',
            { sse: true },
            (_req, res) => {
                res.write('hello')
                res.end()
            },
        )

        const res = await request(getHost(app))
            .get('/events')
            .expect(200)
            .expect('Content-Type', /text\/event-stream/)
            .expect('Cache-Control', 'no-cache, no-transform')
            .expect('X-Accel-Buffering', 'no')

        expect(res.text).toBe('data: hello\n\n')
    })

    test('formats writes as SSE data events with trailing newlines', async () => {
        const app = new Application().get(
            '/events',
            { sse: true },
            (_req, res) => {
                res.write('line1\nline2')
                res.write({ message: 'hello' })
                res.end()
            },
        )

        const res = await request(getHost(app)).get('/events').expect(200)

        expect(res.text).toBe(
            'data: line1\ndata: line2\n\ndata: {"message":"hello"}\n\n',
        )
    })

    test('does not set SSE headers or format writes without sse: true', async () => {
        const app = new Application().get('/events', (_req, res) => {
            res.write('line1\nline2')
            res.end()
        })

        const res = await request(getHost(app)).get('/events').expect(200)

        expect(res.text).toBe('line1\nline2')
    })

    test('streams writes across multiple requests with keep-alive events', async () => {
        const app = new Application().get(
            '/events',
            { sse: true },
            (_req, res) => {
                res.write({ n: 1 })
                setTimeout(() => {
                    res.write({ n: 2 })
                    res.end()
                }, 10)
            },
        )

        const res = await request(getHost(app)).get('/events').expect(200)

        expect(res.text).toBe('data: {"n":1}\n\ndata: {"n":2}\n\n')
    })

    test('keeps sse in the registered route metadata', () => {
        const route = new Application().get(
            '/events',
            { sse: true },
            () => undefined,
        ).routes[0]

        expect(route.routeOptions.sse).toBe(true)
    })
})
