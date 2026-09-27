import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type e from 'express'
import type { IRouteOptions } from './router'
import type { RequestHandler, RespondedHandler } from './types/handler'

export interface IToResponseOptions {
    /**
     * Call `next()` when the handler returns nothing.
     *
     * Route handlers fall through by returning nothing, so this defaults to
     * `true`. Middleware registered with `use` drives the chain itself — it may
     * resolve `next()` well after it returned, e.g. while `express.json()` is
     * still draining the request body — so it opts out.
     *
     * @default true
     */
    autoNext?: boolean
}

export function toResponse<Options extends IRouteOptions = {}>(
    handler: RequestHandler<Options>,
    options: IToResponseOptions = {},
): RespondedHandler {
    const autoNext = options.autoNext ?? true

    return async (req, res, next) => {
        let continued = false
        const forward = ((error?: unknown) => {
            continued = true
            next(error)
        }) as e.NextFunction

        let value: unknown
        try {
            value = await handler(
                req as unknown as Parameters<RequestHandler<Options>>[0],
                res as unknown as Parameters<RequestHandler<Options>>[1],
                forward,
            )
        } catch (error) {
            next(error)
            return
        }

        if (continued || res.headersSent) {
            return
        }

        if (value === undefined) {
            if (autoNext) {
                forward()
            }
            return
        }

        try {
            await send(res, value)
        } catch (error) {
            if (!res.headersSent) {
                next(error)
            }
        }
    }
}

const ENCODING_HEADERS = new Set([
    'content-encoding',
    'content-length',
    'transfer-encoding',
])

async function send(res: e.Response, value: unknown): Promise<void> {
    if (value === null) {
        noContent(res)
        return
    }

    if (value instanceof Response) {
        await sendWebResponse(res, value)
        return
    }

    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
        res.send(value)
        return
    }

    if (isStream(value)) {
        await sendStream(res, value)
        return
    }

    if (typeof value === 'function' || typeof value === 'symbol') {
        throw new TypeError(`Cannot respond with a ${typeof value}`)
    }

    res.json(value)
}

function noContent(res: e.Response) {
    if (res.statusCode === 200) {
        res.status(204)
    }
    res.end()
}

async function sendStream(
    res: e.Response,
    source: Readable | AsyncIterable<unknown>,
) {
    if (!res.get('Content-Type')) {
        res.type('application/octet-stream')
    }
    const stream = source instanceof Readable ? source : Readable.from(source)
    await pipeline(stream, res)
}

async function sendWebResponse(res: e.Response, response: Response) {
    res.status(response.status)

    for (const cookie of response.headers.getSetCookie()) {
        res.append('set-cookie', cookie)
    }
    for (const [key, value] of response.headers) {
        const name = key.toLowerCase()
        if (name === 'set-cookie' || ENCODING_HEADERS.has(name)) {
            continue
        }
        res.setHeader(key, value)
    }

    if (!response.body) {
        res.end()
        return
    }
    const body = response.body as unknown as Parameters<
        typeof Readable.fromWeb
    >[0]
    await pipeline(Readable.fromWeb(body), res)
}

function isStream(value: unknown): value is Readable | AsyncIterable<unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        (typeof (value as { pipe?: unknown }).pipe === 'function' ||
            Symbol.asyncIterator in value)
    )
}
